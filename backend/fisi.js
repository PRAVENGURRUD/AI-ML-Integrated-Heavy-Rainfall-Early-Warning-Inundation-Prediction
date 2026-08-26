// fisi.js — Flood Inundation Susceptibility Index (FISI) — Chennai only (CFVI)
//
// FISI = 0.25*Elevation + 0.15*Slope + 0.20*DistanceToWater
//        + 0.20*FlowAccumulation + 0.15*Rainfall + 0.05*LandCover
//
// All computations are restricted to Chennai district boundary.
// Component images and quantile breaks are memoized so the first request
// pays the build cost; every subsequent request reuses the cached graph.

const ee = require('@google/earthengine');
const { chennaiGeom } = require('./fvi');

const CLASS_LABELS = ['Very Low', 'Low', 'Moderate', 'High', 'Very High'];

const FISI_VIS = {
  min: 1, max: 5,
  palette: ['006400', '00FF00', 'FFFF00', 'FFA500', 'FF0000'],
};

const POP_VIS = {
  min: 1, max: 5,
  palette: ['F2E6FF', 'D9B3FF', 'B266FF', '7F00FF', '4B0082'],
};

const FISI_WEIGHTS = [
  { name: 'Elevation',             w: 25 },
  { name: 'Distance from Water Body', w: 20 },
  { name: 'Flow Accumulation',     w: 20 },
  { name: 'Slope',                 w: 15 },
  { name: 'Rainfall',              w: 15 },
  { name: 'LULC',                  w:  5 },
];

const FISI_PARAMETERS = [
  { name: 'Elevation',                  source: 'SRTM 30m' },
  { name: 'Long-term Average Rainfall', source: 'CHIRPS Daily (1981–2023 mean)' },
  { name: 'Flow Accumulation',          source: 'HydroSHEDS 15 arc-sec' },
  { name: 'Slope',                      source: 'SRTM-derived' },
  { name: 'Distance from Water Body',   source: 'JRC Global Surface Water' },
  { name: 'Land Use / Land Cover',      source: 'ESA WorldCover v200 (2021)' },
];

// ── Helpers ────────────────────────────────────────────────────────────────

function reclassifyByBreaks(image, breaks, scores) {
  let out = ee.Image(scores[4]).float();
  out = out.where(image.lte(breaks[3]), scores[3]);
  out = out.where(image.lte(breaks[2]), scores[2]);
  out = out.where(image.lte(breaks[1]), scores[1]);
  out = out.where(image.lte(breaks[0]), scores[0]);
  return out.rename('score');
}

function getQuantileBreaksAsync(image, region, scale) {
  return new Promise((resolve, reject) => {
    image.reduceRegion({
      reducer: ee.Reducer.percentile([20, 40, 60, 80]),
      geometry: region,
      scale,
      maxPixels: 1e13,
      bestEffort: true,
      tileScale: 4,
    }).evaluate((dict, err) => {
      if (err) return reject(err);
      const key = Object.keys(dict)[0].split('_p')[0];
      resolve([dict[key + '_p20'], dict[key + '_p40'], dict[key + '_p60'], dict[key + '_p80']]);
    });
  });
}

// ── Component images — built once, clipped to Chennai ────────────────────

let _components = null;
function components() {
  if (_components) return _components;
  const area = chennaiGeom();

  // Clip DEM early — all terrain derivatives inherit the clip for free
  const elevation = ee.Image('USGS/SRTMGL1_003').clip(area);
  const elevationScore = reclassifyByBreaks(elevation, [5, 10, 20, 50], [5, 4, 3, 2, 1]).rename('elevation_score');

  const slope = ee.Terrain.slope(elevation); // already clipped via elevation
  const slopeScore = reclassifyByBreaks(slope, [2, 5, 10, 20], [5, 4, 3, 2, 1]).rename('slope_score');

  const gsw = ee.Image('JRC/GSW1_4/GlobalSurfaceWater').clip(area);
  const permanentWater = gsw.select('occurrence').gt(50).selfMask().rename('permanent_water');
  const distanceToWater = permanentWater
    .distance(ee.Kernel.euclidean(2000, 'meters'))
    .clip(area).rename('distance_to_water');
  const distanceToWaterFilled = distanceToWater.unmask(9999);
  const distanceScore = reclassifyByBreaks(distanceToWaterFilled, [100, 300, 500, 1000], [5, 4, 3, 2, 1]).rename('distance_score');

  const flowAcc    = ee.Image('WWF/HydroSHEDS/15ACC').clip(area);
  const logFlowAcc = flowAcc.add(1).log10().rename('log_flow_acc');

  // CHIRPS mean annual rainfall 1981-2023, clipped to Chennai
  const chirps = ee.ImageCollection('UCSB-CHG/CHIRPS/DAILY').select('precipitation');
  const yearList = ee.List.sequence(1981, 2023);
  const annualRainfall = ee.ImageCollection.fromImages(
    yearList.map((y) => {
      y = ee.Number(y);
      const start = ee.Date.fromYMD(y, 1, 1);
      return chirps.filterDate(start, start.advance(1, 'year')).sum()
        .set('year', y).set('system:time_start', start.millis());
    })
  );
  const meanAnnualRainfall = annualRainfall.mean().clip(area).rename('rainfall');

  const worldCover = ee.ImageCollection('ESA/WorldCover/v200').first().clip(area);
  const lulcFromCodes = [10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 100];
  const lulcToScores  = [2,  2,  2,  3,  5,  1,  1,  0,  5,  4,  1];
  const lulcScore = worldCover.remap(lulcFromCodes, lulcToScores)
    .rename('lulc_score').updateMask(worldCover.neq(80));

  _components = {
    elevation, elevationScore, slope, slopeScore, permanentWater,
    distanceToWater, distanceScore, logFlowAcc, meanAnnualRainfall,
    worldCover, lulcScore,
  };
  return _components;
}

// Quantile breaks — computed over Chennai only (much smaller area = faster)
let _rainfallBreaksPromise = null;
function rainfallBreaks() {
  if (!_rainfallBreaksPromise) {
    const { meanAnnualRainfall } = components();
    _rainfallBreaksPromise = getQuantileBreaksAsync(meanAnnualRainfall, chennaiGeom(), 5000);
  }
  return _rainfallBreaksPromise;
}

let _flowAccBreaksPromise = null;
function flowAccBreaks() {
  if (!_flowAccBreaksPromise) {
    const { logFlowAcc } = components();
    _flowAccBreaksPromise = getQuantileBreaksAsync(logFlowAcc, chennaiGeom(), 500);
  }
  return _flowAccBreaksPromise;
}

async function buildFISIRaw() {
  const c = components();
  const [rBreaks, fBreaks] = await Promise.all([rainfallBreaks(), flowAccBreaks()]);

  const rainfallScore = reclassifyByBreaks(c.meanAnnualRainfall, rBreaks, [1, 2, 3, 4, 5]).rename('rainfall_score');
  const flowAccScore  = reclassifyByBreaks(c.logFlowAcc, fBreaks,  [1, 2, 3, 4, 5]).rename('flow_acc_score');

  const raw = c.elevationScore.multiply(0.25)
    .add(c.slopeScore.multiply(0.15))
    .add(c.distanceScore.multiply(0.20))
    .add(flowAccScore.multiply(0.20))
    .add(rainfallScore.multiply(0.15))
    .add(c.lulcScore.multiply(0.05))
    .rename('fisi_raw');

  return raw.updateMask(c.permanentWater.unmask(0).eq(0));
}

let _fisiRawImage   = null;
let _fisiRawPromise = null;
function fisiRawImage() {
  if (_fisiRawImage) return Promise.resolve(_fisiRawImage);
  if (!_fisiRawPromise) {
    _fisiRawPromise = buildFISIRaw().then((img) => { _fisiRawImage = img; return img; });
  }
  return _fisiRawPromise;
}

let _fisiBreaksPromise = null;
function fisiBreaks() {
  if (!_fisiBreaksPromise) {
    _fisiBreaksPromise = fisiRawImage().then((img) =>
      getQuantileBreaksAsync(img, chennaiGeom(), 100)
    );
  }
  return _fisiBreaksPromise;
}

// ── Population density ─────────────────────────────────────────────────────

let _popComponents = null;
function popComponents() {
  if (_popComponents) return _popComponents;
  const area = chennaiGeom();
  const population = ee.ImageCollection('WorldPop/GP/100m/pop')
    .filter(ee.Filter.eq('country', 'IND'))
    .filter(ee.Filter.eq('year', 2020))
    .mosaic().clip(area).rename('population');
  const populationDensity = population.divide(ee.Image.pixelArea().divide(1e6)).rename('pop_density');
  _popComponents = { population, populationDensity };
  return _popComponents;
}

let _popBreaksPromise = null;
function popDensityBreaks() {
  if (!_popBreaksPromise) {
    const { populationDensity } = popComponents();
    _popBreaksPromise = getQuantileBreaksAsync(populationDensity, chennaiGeom(), 100);
  }
  return _popBreaksPromise;
}

// ── Public API ─────────────────────────────────────────────────────────────

async function getFISI() {
  const geom   = chennaiGeom();
  const raw    = await fisiRawImage();
  const breaks = await fisiBreaks();

  const classified = reclassifyByBreaks(raw, breaks, [1, 2, 3, 4, 5])
    .rename('flood_class').updateMask(raw.mask()).clip(geom);

  const rawClipped    = raw.clip(geom).rename('fisi');
  const pixelAreaKm2  = ee.Image.pixelArea().divide(1e6);
  const susceptibleMask = classified.gte(4);

  return new Promise((resolve, reject) => {
    classified.getMapId(FISI_VIS, (mapId, err) => {
      if (err) return reject(err);
      const tileUrl = mapId.urlFormat;

      rawClipped.reduceRegion({
        reducer: ee.Reducer.mean().combine(ee.Reducer.count(), null, true),
        geometry: geom, scale: 90, maxPixels: 1e9, bestEffort: true, tileScale: 4,
      }).evaluate((meanStats, err1) => {
        if (err1) return reject(err1);

        pixelAreaKm2.updateMask(classified.mask()).clip(geom).reduceRegion({
          reducer: ee.Reducer.sum(),
          geometry: geom, scale: 90, maxPixels: 1e9, bestEffort: true, tileScale: 4,
        }).evaluate((totalAreaStats, err2) => {
          if (err2) return reject(err2);

          pixelAreaKm2.updateMask(susceptibleMask).clip(geom).reduceRegion({
            reducer: ee.Reducer.sum().combine(ee.Reducer.count(), null, true),
            geometry: geom, scale: 90, maxPixels: 1e9, bestEffort: true, tileScale: 4,
          }).evaluate((susStats, err3) => {
            if (err3) return reject(err3);

            const mean = meanStats?.fisi_mean ?? null;
            let classification = null;
            if (mean !== null) {
              if (mean <= breaks[0])      classification = CLASS_LABELS[0];
              else if (mean <= breaks[1]) classification = CLASS_LABELS[1];
              else if (mean <= breaks[2]) classification = CLASS_LABELS[2];
              else if (mean <= breaks[3]) classification = CLASS_LABELS[3];
              else                        classification = CLASS_LABELS[4];
            }

            const totalAreaKm2      = totalAreaStats?.area ?? 0;
            const susceptibleAreaKm2 = susStats?.area_sum ?? 0;
            const susceptiblePixels  = susStats?.area_count ?? 0;
            const percentAffected    = totalAreaKm2 > 0 ? (susceptibleAreaKm2 / totalAreaKm2) * 100 : null;

            resolve({
              tileUrl,
              stats: {
                meanFISI: mean !== null ? parseFloat(mean.toFixed(3)) : null,
                classification,
                district: 'Chennai',
                susceptiblePixels,
                totalInundationAreaKm2: parseFloat(susceptibleAreaKm2.toFixed(2)),
                percentAffected: percentAffected !== null ? parseFloat(percentAffected.toFixed(1)) : null,
              },
            });
          });
        });
      });
    });
  });
}

async function inspectFISIPoint(lat, lng) {
  const point = ee.Geometry.Point([lng, lat]);
  const geom  = chennaiGeom();

  // Validate point is within Chennai
  const inside = await new Promise((res, rej) =>
    ee.Number(geom.containsPoint(point, 1)).evaluate((v, e) => e ? rej(e) : res(v))
  );
  if (!inside) return { outsideChennai: true };

  const c       = components();
  const raw     = await fisiRawImage();
  const breaks  = await fisiBreaks();
  const classified = reclassifyByBreaks(raw, breaks, [1, 2, 3, 4, 5]).rename('flood_class');

  const combined = ee.Image.cat([
    raw.rename('fisi'), classified,
    c.elevation.rename('elevation_m'),
    c.slope.rename('slope_deg'),
    c.distanceToWater.rename('distance_to_water_m'),
    c.permanentWater.unmask(0).rename('is_water'),
  ]);

  return new Promise((resolve, reject) => {
    combined.reduceRegion({
      reducer: ee.Reducer.first(), geometry: point, scale: 30,
    }).evaluate((result, err) => {
      if (err) return reject(err);

      const isWater = result?.is_water === 1;
      const fisiVal = result?.fisi ?? null;
      let classification = null;
      if (isWater)            classification = 'Water Body';
      else if (fisiVal !== null) classification = CLASS_LABELS[(result?.flood_class || 1) - 1];

      resolve({
        lat, lng,
        fisi: fisiVal !== null ? parseFloat(fisiVal.toFixed(3)) : null,
        classification, isWater,
        elevation_m: result?.elevation_m ?? null,
        slope_deg: result?.slope_deg != null ? parseFloat(result.slope_deg.toFixed(2)) : null,
        distance_to_water_m: result?.distance_to_water_m != null ? Math.round(result.distance_to_water_m) : null,
      });
    });
  });
}

async function getPopulationDensity() {
  const geom   = chennaiGeom();
  const { population, populationDensity } = popComponents();
  const breaks = await popDensityBreaks();

  const classified = reclassifyByBreaks(populationDensity, breaks, [1, 2, 3, 4, 5])
    .rename('pop_density_class').updateMask(populationDensity.mask()).clip(geom);

  return new Promise((resolve, reject) => {
    classified.getMapId(POP_VIS, (mapId, err) => {
      if (err) return reject(err);
      const tileUrl = mapId.urlFormat;

      population.clip(geom).reduceRegion({
        reducer: ee.Reducer.sum().combine(ee.Reducer.mean(), null, true),
        geometry: geom, scale: 100, maxPixels: 1e9, bestEffort: true, tileScale: 4,
      }).evaluate((stats, err2) => {
        if (err2) return reject(err2);
        resolve({
          tileUrl,
          stats: {
            totalPopulation: stats?.population_sum != null ? Math.round(stats.population_sum) : null,
            meanDensityPerKm2: stats?.population_mean != null ? parseFloat(stats.population_mean.toFixed(1)) : null,
            district: 'Chennai',
          },
        });
      });
    });
  });
}

module.exports = {
  getFISI, inspectFISIPoint, getPopulationDensity,
  FISI_WEIGHTS, FISI_PARAMETERS, CLASS_LABELS, FISI_VIS, POP_VIS,
};
