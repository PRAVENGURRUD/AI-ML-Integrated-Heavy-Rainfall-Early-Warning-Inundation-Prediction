// alerts.js — turns the city-wide inundation model (inundation.js) into
// zone-level early warnings.
//
// Chennai doesn't have an official ward-boundary dataset available in
// Google Earth Engine's public catalog, so — same honest-proxy approach
// used elsewhere in this project (see fisi.js's flow-accumulation groups,
// inundation.js's HAND approximation) — this splits the city into an even
// GRID_SIZE x GRID_SIZE grid of zones instead of pretending to have real
// ward shapes. Each zone gets the *same* SCS-CN + flow-accumulation depth
// model as the city-wide map, just reduced over a smaller area, so a zone
// alert is never contradicting the city-wide number. If real Greater
// Chennai Corporation ward boundaries become available later, only
// buildGridZones() in inundation.js needs to change — everything
// downstream (the stats, the alert levels) stays the same.

const ee = require('@google/earthengine');
const { getDepthImage, classifyDepth, buildGridZones, GRID_SIZE, MIN_ZONE_LAND_KM2 } = require('./inundation');
// buildGridZones/GRID_SIZE/MIN_ZONE_LAND_KM2 now live in inundation.js --
// the depth model itself needs the same zone grid for its per-zone
// flow-accumulation breaks (see inundation.js's perZoneFlowAccBreakImages()
// comment), so both the depth raster and this file's zone-alert summary
// are guaranteed to use the exact same zone boundaries.

// classification (from inundation.js) -> a disaster-alert-style label.
const ALERT_LEVELS = {
  Extreme: 'EMERGENCY',
  Severe: 'SEVERE WARNING',
  High: 'WARNING',
  Moderate: 'WATCH',
  Light: 'ADVISORY',
  Minimal: 'NORMAL',
};

// Order used to find the single "worst" zone for the summary.
const SEVERITY_ORDER = ['NORMAL', 'ADVISORY', 'WATCH', 'WARNING', 'SEVERE WARNING', 'EMERGENCY'];

/**
 * @param {number} rainfallMm — same single-storm-scale rainfall figure
 *   getInundation() uses (see rainfall.js's past24HourTotalMm).
 * @returns {Promise<{ rainfallInputMm, rainfallBasis, gridSize, zones: [...], summary: {...} }>}
 */
async function getAlerts(rainfallMm) {
  const { depthM, area } = await getDepthImage(rainfallMm);
  const zonesFC = buildGridZones(area);

  const wetOnly = depthM.updateMask(depthM.gt(0.01));
  const pixelAreaKm2 = ee.Image.pixelArea().divide(1e6);

  // Four reduceRegions() calls — one Earth Engine round trip each, but
  // each one reduces over ALL zones at once server-side, instead of one
  // round trip per zone (16 zones x 4 stats would be 64 round trips).
  const depthByZone = wetOnly.reduceRegions({
    collection: zonesFC,
    reducer: ee.Reducer.mean().combine(ee.Reducer.max(), null, true),
    scale: 90, tileScale: 4,
  });
  const floodedAreaByZone = pixelAreaKm2.updateMask(wetOnly.mask()).reduceRegions({
    collection: zonesFC,
    reducer: ee.Reducer.sum(),
    scale: 90, tileScale: 4,
  });
  const totalAreaByZone = pixelAreaKm2.updateMask(depthM.mask()).reduceRegions({
    collection: zonesFC,
    reducer: ee.Reducer.sum(),
    scale: 90, tileScale: 4,
  });
  // Alert-LEVEL classification uses the 85th percentile of depthM over
  // EVERY pixel in the zone (dry pixels included, unlike wetOnly above) —
  // NOT the single worst pixel. A ~15-20km2 grid zone is ~1,850 pixels at
  // this scale; using the literal max meant ANY single low-lying
  // drainage-channel pixel (which almost every zone has at least one of)
  // pinned the WHOLE zone to the worst possible alert level, regardless
  // of how much of the zone was actually affected. At extreme storm
  // totals this made literally every zone in the city read EMERGENCY —
  // technically not wrong about that one pixel, but useless as an early
  // warning signal since it stopped distinguishing genuinely bad zones
  // from mostly-fine ones. p85 still flags a zone the moment a real,
  // non-trivial share of it (>15%) is dangerously flooded — still
  // safety-first — but a single freak pixel in an otherwise dry zone no
  // longer paints the entire zone red.
  const depthP85ByZone = depthM.reduceRegions({
    collection: zonesFC,
    reducer: ee.Reducer.percentile([85]),
    scale: 90, tileScale: 4,
  });

  // Evaluate each FeatureCollection directly (rather than nesting all three
  // inside one ee.Dictionary) — this is the documented, reliable way to
  // pull a FeatureCollection's features back as GeoJSON; nesting them
  // inside a Dictionary was silently losing the .features array.
  const evaluateFC = (fc) => new Promise((resolve, reject) => {
    fc.evaluate((result, err) => (err ? reject(err) : resolve(result)));
  });

  const [depthResult, floodedAreaResult, totalAreaResult, depthP85Result] = await Promise.all([
    evaluateFC(depthByZone),
    evaluateFC(floodedAreaByZone),
    evaluateFC(totalAreaByZone),
    evaluateFC(depthP85ByZone),
  ]);

  const depthFeatures = depthResult?.features ?? [];
  const floodedAreaFeatures = floodedAreaResult?.features ?? [];
  const totalAreaFeatures = totalAreaResult?.features ?? [];
  const depthP85Features = depthP85Result?.features ?? [];

  const floodedAreaById = new Map(
    floodedAreaFeatures.map((f) => [f.properties.zoneId, f.properties.sum ?? 0])
  );
  const totalAreaById = new Map(
    totalAreaFeatures.map((f) => [f.properties.zoneId, f.properties.sum ?? 0])
  );
  // reduceRegions()'s exact property naming for a percentile reducer
  // isn't something to hardcode (it can differ from reduceRegion()'s, and
  // from band to band) -- read whichever property name actually comes
  // back (anything containing "_p85"/"p85") instead of assuming
  // "depth_m_p85" and silently defaulting every zone to 0 if that guess
  // is wrong.
  const p85Key = depthP85Features.length
    ? Object.keys(depthP85Features[0].properties).find((k) => k !== 'zoneId' && k.includes('p85'))
    : null;
  if (depthP85Features.length && !p85Key) {
    console.error('alerts.js: could not find a p85 property in reduceRegions output, keys were:',
      Object.keys(depthP85Features[0].properties));
  }
  const depthP85ById = new Map(
    depthP85Features.map((f) => [f.properties.zoneId, (p85Key ? f.properties[p85Key] : null) ?? 0])
  );

  const zones = depthFeatures
    .map((f) => {
      const p = f.properties;
      const totalAreaKm2 = totalAreaById.get(p.zoneId) ?? 0;
      const floodedAreaKm2 = floodedAreaById.get(p.zoneId) ?? 0;
      const meanDepthM = p.mean ?? 0;
      const maxDepthM = p.max ?? 0;
      const p85DepthM = depthP85ById.get(p.zoneId) ?? 0;
      const percentFlooded = totalAreaKm2 > 0 ? (floodedAreaKm2 / totalAreaKm2) * 100 : 0;
      // Alert level uses p85DepthM (see the comment above depthP85ByZone)
      // — not the single worst pixel (maxDepthM), and not the plain
      // average (meanDepthM), which a large zone can dilute a real
      // hazard into looking mild. Both maxDepthM and meanDepthM are
      // still reported below for transparency.
      const classification = classifyDepth(p85DepthM);

      return {
        zoneId: p.zoneId,
        row: p.row,
        col: p.col,
        centerLat: parseFloat(p.centerLat.toFixed(4)),
        centerLon: parseFloat(p.centerLon.toFixed(4)),
        totalAreaKm2: parseFloat(totalAreaKm2.toFixed(2)),
        floodedAreaKm2: parseFloat(floodedAreaKm2.toFixed(2)),
        percentFlooded: parseFloat(percentFlooded.toFixed(1)),
        meanDepthM: parseFloat(meanDepthM.toFixed(3)),
        maxDepthM: parseFloat(maxDepthM.toFixed(3)),
        p85DepthM: parseFloat(p85DepthM.toFixed(3)),
        classification,
        alertLevel: ALERT_LEVELS[classification] || 'NORMAL',
      };
    })
    // Drop grid cells that barely overlap the actual city (edge/coastal
    // slivers) — not real zones, just grid math artifacts.
    .filter((z) => z.totalAreaKm2 >= MIN_ZONE_LAND_KM2);

  const zonesAtWarningOrAbove = zones.filter(
    (z) => SEVERITY_ORDER.indexOf(z.alertLevel) >= SEVERITY_ORDER.indexOf('WARNING')
  ).length;

  const highestAlertLevel = zones.reduce((worst, z) => {
    return SEVERITY_ORDER.indexOf(z.alertLevel) > SEVERITY_ORDER.indexOf(worst) ? z.alertLevel : worst;
  }, 'NORMAL');

  // The single "X / totalZones at WARNING+" number collapses WARNING,
  // SEVERE WARNING and EMERGENCY into one bucket -- during a genuinely
  // extreme, near-record storm (e.g. the Dec 2015 replay) that can read
  // as "every zone is on fire" even when the zones are actually spread
  // across different severities. This full per-level breakdown is what
  // the UI shows instead, so "15/15 above WARNING" doesn't get mistaken
  // for "15/15 EMERGENCY" -- it lets you see the real spread.
  const byLevel = SEVERITY_ORDER.reduce((acc, level) => {
    acc[level] = zones.filter((z) => z.alertLevel === level).length;
    return acc;
  }, {});

  return {
    rainfallInputMm: rainfallMm,
    rainfallBasis: 'single-storm scale (~24h) — same basis as /api/inundation',
    gridSize: GRID_SIZE,
    method: 'Same SCS-CN + flow-accumulation depth model as /api/inundation, reduced per grid zone (no official ward boundaries available in Earth Engine — see file header)',
    zones: zones.sort((a, b) => a.zoneId - b.zoneId),
    summary: {
      totalZones: zones.length,
      zonesAtWarningOrAbove,
      highestAlertLevel,
      byLevel,
    },
  };
}

module.exports = { getAlerts, ALERT_LEVELS };
