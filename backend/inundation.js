// inundation.js — turns a rainfall amount into an actual flood depth map for
// Chennai. This replaces the old fixed "5/15/30/50cm bathtub" button, which
// wasn't driven by rainfall at all (see fvi.js's own comments on that).
//
// Two real, explainable steps:
//
// STEP 1 — SCS Curve Number (SCS-CN): a published USDA method for how much of
// the rain becomes surface runoff instead of soaking into the ground.
// Concrete and roads (high "Curve Number") run off far more than trees or
// open soil (low Curve Number). Uses the same ESA WorldCover land-cover data
// fisi.js already loads. Assumes an average soil type, since detailed soil
// survey data isn't available for this prototype — a stated assumption, not
// a hidden one.
//
// STEP 2 — a concentration factor from flow accumulation: real runoff
// doesn't sit evenly everywhere, it concentrates into drains and low
// channels. This uses the same HydroSHEDS flow-accumulation data, and the
// same "split into 5 groups" method, fisi.js already uses for its own
// scoring — cells where more water naturally drains through get a bigger
// multiplier. This is a simplification of full HAND (Height Above Nearest
// Drainage), which would need a separate flow-path-tracing analysis on top
// of this — labeled here as an approximation, same honest-proxy approach
// already used for PS85's drainage layer in the plan.
//
//   depth_m(x, y) = (runoff_mm(x, y) / 1000) * concentration_multiplier(x, y)
//
// STATED LIMITATION: this model has no concept of a stormwater drainage
// system carrying water away over time -- every drop that doesn't
// infiltrate is treated as if it sits there permanently. That's a
// reasonable approximation for ordinary rainfall, but at a genuinely
// extreme, record-breaking storm total it means the model can show
// severe flooding across nearly the whole city with little
// differentiation between well- and poorly-drained areas. We looked for
// a real, citable Chennai drainage-capacity figure to correct for this
// and could not find one specific enough to use honestly -- so rather
// than invent a number, we are stating this as a known limitation
// instead. See replayEvents.js / the Current Situation UI for the
// caveat shown alongside the historical replay events.
//
// getDepthImage() below does just the raster math (steps 1 & 2) and is
// reused by alerts.js so the per-ward alerts are driven by the exact same
// physics as the city-wide map/stats here — no second copy of the model.

const ee = require('@google/earthengine');
const { chennaiGeom } = require('./fvi');

// ── Chennai Metropolitan Area (not just Chennai district) ──────────────────
//
// STATED SCOPE: fvi.js's chennaiGeom() -- used by the Vulnerability Index
// tab (FVI/FISI/population) -- is the official, compact "Chennai"
// administrative DISTRICT (~426km2). That tab is untouched by this change
// and keeps using exactly that boundary. But real flood risk, including
// the real Dec 2015 floods, also badly affects places like Tambaram,
// Avadi, and Sriperumbudur -- which are technically in neighboring
// districts (Chengalpattu, Tiruvallur, Kancheepuram) even though they're
// part of what everyone actually means by "Chennai" day to day: the
// Chennai Metropolitan Area (see
// https://en.wikipedia.org/wiki/Chennai_metropolitan_area). The Current
// Situation flood model (this file + alerts.js) uses this wider area
// instead, built from real district boundaries -- geoBoundaries, CC BY
// 4.0 (https://www.geoboundaries.org), the same dataset published as an
// Earth Engine catalog asset -- by unioning Chennai with its three
// neighboring districts.
//
// STATED LIMITATION: this is coarser than the Chennai Metropolitan
// Development Authority's official planning boundary (~1,189km2 as
// originally designated in 1974, ~5,904km2 after a 2022 expansion) -- a
// pixel-precise match would need taluk-level sub-district boundaries, and
// we don't have a reliable, verifiable source for those. Unioning full
// districts means some genuinely rural, non-metro parts of Tiruvallur,
// Kancheepuram, and Chengalpattu districts are included too. Stated
// honestly as district-level coverage, not claimed as an exact CMA match.
// Confirmed against the live dataset via the diagnostic fallback below
// (it reports exactly this on a mismatch) -- geoBoundaries spells the
// fourth district "Chengalputtu", not "Chengalpattu"/"Chengalpet" as
// commonly written elsewhere.
const METRO_DISTRICT_NAMES = [
  'Chennai',
  'Tiruvallur', 'Thiruvallur',
  'Kancheepuram', 'Kanchipuram', 'Kancheepuram district', 'Kanchipuram district',
  'Chengalpattu', 'Chengalpattu district', 'Chengalpet', 'Chengalpet district',
  'Chengalputtu', 'Chengalputtu district',
];

let _chennaiMetroGeomPromise = null;
function chennaiMetroGeom() {
  if (_chennaiMetroGeomPromise) return _chennaiMetroGeomPromise;
  // Same "clear the cache on failure" guard used throughout this file.
  _chennaiMetroGeomPromise = (async () => {
    const allIndiaDistricts = ee.FeatureCollection('WM/geoLab/geoBoundaries/600/ADM2')
      .filter(ee.Filter.eq('shapeGroup', 'IND'));
    const matched = allIndiaDistricts.filter(ee.Filter.inList('shapeName', METRO_DISTRICT_NAMES));

    const count = await new Promise((resolve, reject) => {
      matched.size().evaluate((n, err) => (err ? reject(err) : resolve(n)));
    });
    // Defensive check, not an assumption -- this dataset's exact district
    // name spelling for this region hasn't been verified against a live
    // query (GEE calls aren't reachable from where this was written). If
    // fewer than the 4 expected districts matched, surface exactly what
    // names WERE available near Chennai instead of silently proceeding
    // with a wrong, undersized area -- same lesson as the p85/p20
    // property-name bugs elsewhere in this project.
    if (count < 4) {
      const nearbyNames = await new Promise((resolve, reject) => {
        allIndiaDistricts.aggregate_array('shapeName').evaluate((names, err) => (err ? reject(err) : resolve(names)));
      });
      const candidates = (nearbyNames || []).filter((n) => /chenn|tiruvallur|thiruvallur|kanch|chengal/i.test(n));
      throw new Error(
        `chennaiMetroGeom: only matched ${count}/4 expected districts via METRO_DISTRICT_NAMES. ` +
        `Similarly-named IND districts actually in the dataset: ${candidates.join(', ') || '(none found)'}`
      );
    }
    return matched.geometry();
  })().catch((err) => {
    _chennaiMetroGeomPromise = null;
    throw err;
  });
  return _chennaiMetroGeomPromise;
}

// ── Raw terrain/land-cover layers, clipped to the metro area ───────────────
//
// inundation.js used to reuse fisi.js's components() (which clips to the
// smaller Chennai DISTRICT) to avoid loading the same GEE sources twice.
// Now that the flood model needs the wider metro area, it can't reuse
// those anymore without also widening FVI/FISI's scope, which the
// Vulnerability Index tab was never asked to change -- so this loads its
// own copies of just the layers it actually needs (WorldCover,
// HydroSHEDS flow accumulation, JRC surface water), clipped to
// chennaiMetroGeom() instead.
// STATED ROLLBACK: chennaiMetroGeom() (above) turned out to produce a
// visibly wrong result once actually looked at -- the flood layer painted
// far outside Tamil Nadu entirely (as far as Tirupati, Andhra Pradesh).
// GEE calls aren't reachable from where this code is written, so that
// couldn't be caught before it reached a real browser -- either one of
// the 4 matched geoBoundaries district shapes has a real digitizing
// error, or something else about that union is wrong in a way that needs
// an actual live GEE session to diagnose (visualize each matched
// district individually, check its reported area against its real-world
// figure). Until that's actually verified live, this reverts to the
// known-correct chennaiGeom() (Chennai district only) rather than leave
// a visibly broken result live or guess again blind. chennaiMetroGeom()
// is left in place, unused, so the fix is a one-line swap once the real
// cause is confirmed.
let _metroComponentsPromise = null;
function metroComponents() {
  if (_metroComponentsPromise) return _metroComponentsPromise;
  _metroComponentsPromise = (async () => {
    const area = chennaiGeom(); // TODO: chennaiMetroGeom() once verified live

    const worldCover = ee.ImageCollection('ESA/WorldCover/v200').first().clip(area);

    const flowAcc = ee.Image('WWF/HydroSHEDS/15ACC').clip(area);
    const logFlowAcc = flowAcc.add(1).log10().rename('log_flow_acc');

    const gsw = ee.Image('JRC/GSW1_4/GlobalSurfaceWater').clip(area);
    const permanentWater = gsw.select('occurrence').gt(50).selfMask().rename('permanent_water');

    return { area, worldCover, logFlowAcc, permanentWater };
  })().catch((err) => {
    _metroComponentsPromise = null;
    throw err;
  });
  return _metroComponentsPromise;
}

// Chennai doesn't have an official ward-boundary dataset available in
// Earth Engine's public catalog, so -- same honest-proxy approach used
// elsewhere in this project -- this splits the city into an even grid of
// zones instead of pretending to have real ward shapes. Only alerts.js
// actually uses this (for zone-level reporting) -- it briefly moved here
// while an earlier version of the concentration multiplier below needed
// per-zone grouping too, but that approach turned out to be flawed (see
// the comment above flowAccScaleAnchors()) and was replaced with a
// citywide-absolute scale instead, so the concentration math no longer
// touches the zone grid at all. Left exported from here rather than moved
// back, to avoid more file churn than necessary.
const GRID_SIZE = 4; // 4x4 = up to 16 zones (fewer after empty edge zones are dropped)
const MIN_ZONE_LAND_KM2 = 0.5;

function buildGridZones(area) {
  const bounds = ee.Geometry(area).bounds();
  const ring = ee.List(bounds.coordinates().get(0));
  const minLon = ee.Number(ee.List(ring.get(0)).get(0));
  const minLat = ee.Number(ee.List(ring.get(0)).get(1));
  const maxLon = ee.Number(ee.List(ring.get(2)).get(0));
  const maxLat = ee.Number(ee.List(ring.get(2)).get(1));

  const lonStep = maxLon.subtract(minLon).divide(GRID_SIZE);
  const latStep = maxLat.subtract(minLat).divide(GRID_SIZE);

  const rows = ee.List.sequence(0, GRID_SIZE - 1);
  const cols = ee.List.sequence(0, GRID_SIZE - 1);

  const features = rows.map((r) => {
    r = ee.Number(r);
    return cols.map((c) => {
      c = ee.Number(c);
      const lonLo = minLon.add(lonStep.multiply(c));
      const lonHi = minLon.add(lonStep.multiply(c.add(1)));
      const latLo = minLat.add(latStep.multiply(r));
      const latHi = minLat.add(latStep.multiply(r.add(1)));
      const cellRect = ee.Geometry.Rectangle([lonLo, latLo, lonHi, latHi]);
      const clipped = cellRect.intersection(area, ee.ErrorMargin(1));
      const zoneId = r.multiply(GRID_SIZE).add(c).add(1);
      return ee.Feature(clipped, {
        zoneId,
        row: r,
        col: c,
        centerLat: latLo.add(latHi).divide(2),
        centerLon: lonLo.add(lonHi).divide(2),
      });
    });
  }).flatten();

  return ee.FeatureCollection(features);
}

// SCS Curve Numbers by ESA WorldCover class (assumes an average / mixed
// Hydrologic Soil Group, since no detailed soil survey is available here).
const WORLDCOVER_TO_CN = {
  10: 70,  // Tree cover
  20: 70,  // Shrubland
  30: 74,  // Grassland
  40: 78,  // Cropland
  50: 92,  // Built-up (roads, buildings — high runoff)
  60: 85,  // Bare / sparse vegetation
  70: 90,  // Snow/ice (not relevant to Chennai, included for completeness)
  80: 100, // Water (masked out separately below — already water)
  90: 80,  // Herbaceous wetland
  95: 80,  // Mangroves
  100: 85, // Moss/lichen
};

// Same depth-severity bands used across the project, kept in one place so
// inundation.js and alerts.js always agree on what "Severe" means.
function classifyDepth(meanDepthM) {
  if (meanDepthM >= 2.0) return 'Extreme';
  if (meanDepthM >= 1.0) return 'Severe';
  if (meanDepthM >= 0.5) return 'High';
  if (meanDepthM >= 0.15) return 'Moderate';
  if (meanDepthM >= 0.05) return 'Light';
  return 'Minimal';
}

const INUNDATION_VIS = {
  min: 0,
  max: 1,
  palette: ['e6f3ff', 'b3d9ff', '80bfff', '4da6ff', '0066cc', '003d99'],
};

// Same 6-tier alert colors used everywhere else in the app (alerts.js's
// ALERT_LEVELS, the frontend's ALERT_LEGEND) -- Normal -> Emergency, in
// order, so this classified map, the zone markers, and the sidebar
// badges are always painted the exact same way.
// Labeled with the same alert-level names the rest of the app (alerts.js,
// the sidebar badges) uses, not classifyDepth()'s raw Minimal/Light/...
// names, so the map legend and the sidebar never say two different things
// for the same color.
const CLASS_ORDER = ['Normal', 'Advisory', 'Watch', 'Warning', 'Severe Warning', 'Emergency'];
const CLASSIFIED_PALETTE = ['267300', 'A3FF00', 'FFAA00', 'FF6B00', 'E60000', '730000'];
const CLASSIFIED_VIS = { min: 0, max: CLASS_ORDER.length - 1, palette: CLASSIFIED_PALETTE };

/**
 * Turns the continuous depth raster into a discrete 0-5 "risk class"
 * image (0 = Minimal/Normal ... 5 = Extreme/Emergency), covering the
 * WHOLE city -- unlike the wetOnly water-depth layer, dry/safe land is
 * shown too (as green "Normal"), so the map reads as one continuous
 * risk-level heatmap instead of a mostly-transparent water overlay. Uses
 * the exact same thresholds as classifyDepth() above so this map and the
 * per-zone/city-wide classification labels never disagree.
 */
function buildClassifiedImage(depthM) {
  return ee.Image(0)
    .where(depthM.gte(0.05), 1)
    .where(depthM.gte(0.15), 2)
    .where(depthM.gte(0.5), 3)
    .where(depthM.gte(1.0), 4)
    .where(depthM.gte(2.0), 5)
    .updateMask(depthM.mask())
    .rename('risk_class');
}

// ── Absolute (not rank-based) flow-accumulation concentration ──────────────
//
// STATED CORRECTION: two earlier versions of this ranked every pixel by
// PERCENTILE into discrete concentration groups -- first against the whole
// city, then against just its own zone. Both share the same flaw: a
// percentile rank is, by construction, guaranteed to put some fixed
// fraction of pixels into the "top" group no matter what the underlying
// data actually looks like. The per-zone version was the worse of the
// two -- it guaranteed EVERY zone, even one that's uniformly flat with no
// real drainage channel, would have exactly 20% of its own pixels land in
// the highest (8x) multiplier band, purely because that's what splitting
// any zone into its own quantiles does. Nothing was ever actually safe
// from hitting the top multiplier.
//
// This version drops rank-based grouping entirely. Instead, each pixel's
// concentration multiplier scales continuously with its own ABSOLUTE flow
// accumulation value (how much real upstream area drains through it),
// measured against two fixed citywide reference points: the citywide
// MEDIAN log-flow-accumulation (p50 -- "ordinary, non-channel land") and
// the citywide 99th percentile (p99 -- genuine channel/major-drain
// territory; real channels are a small minority of any landscape by
// definition, so p99 is a reasonable proxy for "this is an actual drain,
// not just slightly-more-downhill land"). A pixel's own value relative to
// those two fixed anchors determines its multiplier -- a zone whose flow
// accumulation never gets much above the citywide median genuinely gets a
// low multiplier everywhere, with no guaranteed "top" pocket forced onto
// it by the math.
const FLOW_CONCENTRATION_MIN = 0.5;
const FLOW_CONCENTRATION_MAX = 8;

let _flowAccScaleAnchorsPromise = null;
function flowAccScaleAnchors() {
  if (_flowAccScaleAnchorsPromise) return _flowAccScaleAnchorsPromise;
  // Same "don't leave a rejected promise memoized forever" guard as the
  // rest of this file's cached async values.
  _flowAccScaleAnchorsPromise = (async () => {
    const { logFlowAcc, area } = await metroComponents();
    const stats = await new Promise((resolve, reject) => {
      logFlowAcc.reduceRegion({
        reducer: ee.Reducer.percentile([50, 99]),
        geometry: area, scale: 90, maxPixels: 1e9, bestEffort: true, tileScale: 4,
      }).evaluate((r, err) => (err ? reject(err) : resolve(r)));
    });
    const keys = Object.keys(stats || {});
    // Same defensive property-name lookup as elsewhere in this project --
    // reduceRegion()'s exact naming for a multi-percentile reducer isn't
    // something to hardcode (learned that the hard way twice already).
    const loKey = keys.find((k) => k === 'p50' || k.endsWith('_p50'));
    const hiKey = keys.find((k) => k === 'p99' || k.endsWith('_p99'));
    if (!loKey || !hiKey || stats[loKey] == null || stats[hiKey] == null) {
      throw new Error(`flowAccScaleAnchors: could not find p50/p99 in ${keys.join(', ')}`);
    }
    return { lo: stats[loKey], hi: stats[hiKey] };
  })().catch((err) => {
    _flowAccScaleAnchorsPromise = null;
    throw err;
  });
  return _flowAccScaleAnchorsPromise;
}

/**
 * Async wrapper: awaits the flow-accumulation scale anchors (memoized
 * after first use, since they only depend on static terrain data, not
 * rainfall) then builds the full depth image.
 *
 * @param {number} rainfallMm
 * @returns {Promise<{ depthM: ee.Image, area: ee.Geometry }>}
 */
async function getDepthImage(rainfallMm) {
  const { area, worldCover, logFlowAcc, permanentWater } = await metroComponents();

  const codes = Object.keys(WORLDCOVER_TO_CN).map(Number);
  const cnValues = codes.map((code) => WORLDCOVER_TO_CN[code]);
  const cn = worldCover.remap(codes, cnValues).rename('cn');
  const s = ee.Image(25400).divide(cn).subtract(254);

  const p = ee.Image(rainfallMm);
  const excess = p.subtract(s.multiply(0.2));
  const runoffMm = excess.pow(2)
    .divide(p.add(s.multiply(0.8)))
    .updateMask(excess.gt(0))
    .unmask(0)
    .rename('runoff_mm');

  const { lo, hi } = await flowAccScaleAnchors();
  // A pixel at or below the citywide median (lo) gets the floor
  // multiplier; at or above the citywide p99 (hi) gets the ceiling; in
  // between, it scales continuously with the pixel's OWN absolute value
  // -- no rank, no guaranteed "top X%" in any zone.
  const normalized = logFlowAcc.subtract(lo).divide(hi - lo).clamp(0, 1);
  const concentration = normalized
    .multiply(FLOW_CONCENTRATION_MAX - FLOW_CONCENTRATION_MIN)
    .add(FLOW_CONCENTRATION_MIN)
    .rename('concentration');

  const permanentWaterFilled = permanentWater.unmask(0);
  const depthM = runoffMm
    .multiply(concentration)
    .divide(1000)
    .updateMask(permanentWaterFilled.eq(0))
    .clip(area)
    .rename('depth_m');

  return { depthM, area };
}

/**
 * @param {number} rainfallMm — rainfall amount to simulate (mm)
 * @returns {{ tileUrl, stats: {...} }}
 */
async function getInundation(rainfallMm) {
  const { depthM, area } = await getDepthImage(rainfallMm);

  // IMPORTANT: depthM is defined (often as exactly 0) over every non-water
  // land pixel, not just the actually-flooded ones — runoffMm is
  // .unmask(0) in getDepthImage() so dry pixels still carry a real "0"
  // value rather than being masked out (needed so the stats below can
  // measure the FLOODED area separately from the total land area). But
  // that also means painting depthM directly on the map would color EVERY
  // land pixel, including dry ones at 0 — the map would show as a solid
  // block instead of a mostly-see-through overlay. So the map tile uses
  // wetOnly (depth > 1cm) instead: dry land stays transparent, only actual
  // water gets colored.
  const wetOnly = depthM.updateMask(depthM.gt(0.01));
  const classifiedImage = buildClassifiedImage(depthM);

  const getMapIdAsync = (img, vis) => new Promise((resolve, reject) => {
    img.getMapId(vis, (mapId, err) => (err ? reject(err) : resolve(mapId.urlFormat)));
  });

  const [tileUrl, classifiedTileUrl] = await Promise.all([
    getMapIdAsync(wetOnly, INUNDATION_VIS),
    getMapIdAsync(classifiedImage, CLASSIFIED_VIS),
  ]);

  const pixelAreaKm2 = ee.Image.pixelArea().divide(1e6);

  const wetStats = wetOnly.reduceRegion({
    reducer: ee.Reducer.mean().combine(ee.Reducer.max(), null, true),
    geometry: area, scale: 90, maxPixels: 1e9, bestEffort: true, tileScale: 4,
  });
  const floodedAreaStats = pixelAreaKm2.updateMask(wetOnly.mask()).reduceRegion({
    reducer: ee.Reducer.sum(),
    geometry: area, scale: 90, maxPixels: 1e9, bestEffort: true, tileScale: 4,
  });
  const totalAreaStats = pixelAreaKm2.updateMask(depthM.mask()).reduceRegion({
    reducer: ee.Reducer.sum(),
    geometry: area, scale: 90, maxPixels: 1e9, bestEffort: true, tileScale: 4,
  });

  const all = await new Promise((resolve, reject) => {
    ee.Dictionary({ wetStats, floodedAreaStats, totalAreaStats }).evaluate(
      (result, statsErr) => (statsErr ? reject(statsErr) : resolve(result))
    );
  });

  const meanDepthM = all.wetStats?.depth_m_mean ?? 0;
  const maxDepthM = all.wetStats?.depth_m_max ?? 0;
  const floodedAreaKm2 = all.floodedAreaStats?.area ?? 0;
  const totalLandAreaKm2 = all.totalAreaStats?.area ?? 0;
  const percentOfCityFlooded = totalLandAreaKm2 > 0
    ? (floodedAreaKm2 / totalLandAreaKm2) * 100 : 0;

  return {
    tileUrl,
    classifiedTileUrl,
    classifiedLegend: CLASS_ORDER.map((label, i) => ({ label, color: `#${CLASSIFIED_PALETTE[i]}` })),
    stats: {
      rainfallInputMm: rainfallMm,
      rainfallBasis: 'single-storm scale (~24h) — NOT the 3-day cumulative figure used for overall risk',
      meanDepthM: parseFloat(meanDepthM.toFixed(3)),   // average among FLOODED areas only
      maxDepthM: parseFloat(maxDepthM.toFixed(3)),
      floodedAreaKm2: parseFloat(floodedAreaKm2.toFixed(2)),
      percentOfCityFlooded: parseFloat(percentOfCityFlooded.toFixed(1)),
      classification: classifyDepth(meanDepthM),
      method: 'SCS Curve Number runoff x flow-accumulation concentration (simplified HAND proxy)',
      district: 'Chennai',
    },
  };
}

module.exports = { getInundation, getDepthImage, classifyDepth, INUNDATION_VIS, buildGridZones, GRID_SIZE, MIN_ZONE_LAND_KM2 };
