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
// getDepthImage() below does just the raster math (steps 1 & 2) and is
// reused by alerts.js so the per-ward alerts are driven by the exact same
// physics as the city-wide map/stats here — no second copy of the model.

const ee = require('@google/earthengine');
const { chennaiGeom } = require('./fvi');
const { components, reclassifyByBreaks, flowAccBreaks } = require('./fisi');

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

/**
 * Async wrapper: awaits the flow-accumulation breaks (one small GEE call,
 * cached after first use by fisi.js) then builds the full depth image.
 *
 * @param {number} rainfallMm
 * @returns {Promise<{ depthM: ee.Image, area: ee.Geometry }>}
 */
async function getDepthImage(rainfallMm) {
  const area = chennaiGeom();
  const c = components();

  const codes = Object.keys(WORLDCOVER_TO_CN).map(Number);
  const cnValues = codes.map((code) => WORLDCOVER_TO_CN[code]);
  const cn = c.worldCover.remap(codes, cnValues).rename('cn');
  const s = ee.Image(25400).divide(cn).subtract(254);

  const p = ee.Image(rainfallMm);
  const excess = p.subtract(s.multiply(0.2));
  const runoffMm = excess.pow(2)
    .divide(p.add(s.multiply(0.8)))
    .updateMask(excess.gt(0))
    .unmask(0)
    .rename('runoff_mm');

  const fBreaks = await flowAccBreaks();
  const flowGroup = reclassifyByBreaks(c.logFlowAcc, fBreaks, [1, 2, 3, 4, 5]);
  const concentration = ee.Image(1)
    .where(flowGroup.eq(1), 0.5)
    .where(flowGroup.eq(2), 1)
    .where(flowGroup.eq(3), 2)
    .where(flowGroup.eq(4), 4)
    .where(flowGroup.eq(5), 8)
    .rename('concentration');

  const permanentWater = c.permanentWater.unmask(0);
  const depthM = runoffMm
    .multiply(concentration)
    .divide(1000)
    .updateMask(permanentWater.eq(0))
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

  return new Promise((resolve, reject) => {
    depthM.getMapId(INUNDATION_VIS, (mapId, err) => {
      if (err) return reject(err);
      const tileUrl = mapId.urlFormat;

      // IMPORTANT: depthM is defined (often as 0) over every non-water
      // pixel, not just the actually-flooded ones — runoffMm is .unmask(0)
      // above so dry pixels still carry a real "0" value rather than being
      // masked out. So we mask to depth > 1cm here specifically to measure
      // the FLOODED area/depth, separately from the total land area.
      const wetOnly = depthM.updateMask(depthM.gt(0.01));
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

      ee.Dictionary({ wetStats, floodedAreaStats, totalAreaStats }).evaluate((all, statsErr) => {
        if (statsErr) return reject(statsErr);

        const meanDepthM = all.wetStats?.depth_m_mean ?? 0;
        const maxDepthM = all.wetStats?.depth_m_max ?? 0;
        const floodedAreaKm2 = all.floodedAreaStats?.area ?? 0;
        const totalLandAreaKm2 = all.totalAreaStats?.area ?? 0;
        const percentOfCityFlooded = totalLandAreaKm2 > 0
          ? (floodedAreaKm2 / totalLandAreaKm2) * 100 : 0;

        resolve({
          tileUrl,
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
        });
      });
    });
  });
}

module.exports = { getInundation, getDepthImage, classifyDepth, INUNDATION_VIS };
