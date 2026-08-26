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
// buildGridZones() below needs to change — everything downstream (the
// stats, the alert levels) stays the same.

const ee = require('@google/earthengine');
const { getDepthImage, classifyDepth } = require('./inundation');

const GRID_SIZE = 4; // 4x4 = up to 16 zones (fewer after empty edge zones are dropped)

// Zones smaller than this (mostly outside the actual city boundary, e.g.
// grid cells that only clip a sliver of the coastline) are dropped rather
// than reported as a misleadingly tiny "zone".
const MIN_ZONE_LAND_KM2 = 0.5;

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
 * Builds an evenly-spaced GRID_SIZE x GRID_SIZE grid of rectangles over the
 * city's bounding box, each clipped to the actual city boundary. Entirely
 * server-side (no client round-trip) — the grid math runs inside Earth
 * Engine and comes back already reduced to stats.
 *
 * @param {ee.Geometry} area — city boundary (from fvi.js's chennaiGeom())
 * @returns {ee.FeatureCollection} one feature per grid cell, tagged with
 *   zoneId/row/col/centerLat/centerLon
 */
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

  // Three reduceRegions() calls — one Earth Engine round trip each, but
  // each one reduces over ALL zones at once server-side, instead of one
  // round trip per zone (16 zones x 3 stats would be 48 round trips).
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

  // Evaluate each FeatureCollection directly (rather than nesting all three
  // inside one ee.Dictionary) — this is the documented, reliable way to
  // pull a FeatureCollection's features back as GeoJSON; nesting them
  // inside a Dictionary was silently losing the .features array.
  const evaluateFC = (fc) => new Promise((resolve, reject) => {
    fc.evaluate((result, err) => (err ? reject(err) : resolve(result)));
  });

  const [depthResult, floodedAreaResult, totalAreaResult] = await Promise.all([
    evaluateFC(depthByZone),
    evaluateFC(floodedAreaByZone),
    evaluateFC(totalAreaByZone),
  ]);

  const depthFeatures = depthResult?.features ?? [];
  const floodedAreaFeatures = floodedAreaResult?.features ?? [];
  const totalAreaFeatures = totalAreaResult?.features ?? [];

  const floodedAreaById = new Map(
    floodedAreaFeatures.map((f) => [f.properties.zoneId, f.properties.sum ?? 0])
  );
  const totalAreaById = new Map(
    totalAreaFeatures.map((f) => [f.properties.zoneId, f.properties.sum ?? 0])
  );

  const zones = depthFeatures
    .map((f) => {
      const p = f.properties;
      const totalAreaKm2 = totalAreaById.get(p.zoneId) ?? 0;
      const floodedAreaKm2 = floodedAreaById.get(p.zoneId) ?? 0;
      const meanDepthM = p.mean ?? 0;
      const maxDepthM = p.max ?? 0;
      const percentFlooded = totalAreaKm2 > 0 ? (floodedAreaKm2 / totalAreaKm2) * 100 : 0;
      // Alert level is based on the WORST spot in the zone (maxDepthM),
      // not the zone's average — a grid zone is ~15-20km2, big enough
      // that a genuinely dangerous drainage-channel pocket gets diluted
      // into a deceptively mild average. Early warning should flag
      // "there is a dangerous spot here", not "this zone is dangerous
      // on average". meanDepthM is still reported for context.
      const classification = classifyDepth(maxDepthM);

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
    },
  };
}

module.exports = { getAlerts, ALERT_LEVELS };
