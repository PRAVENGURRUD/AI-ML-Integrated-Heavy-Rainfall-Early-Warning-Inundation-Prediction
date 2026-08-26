// precipitation.js — renders the latest available GPM IMERG satellite
// rainfall as a semi-transparent map layer around Chennai: the actual
// live storm/rain system, not a cosmetic cloud photo. Reuses the exact
// same NASA GPM_L3/IMERG_V07 dataset nowcast.js already pulls numbers
// from — this module turns the same kind of data into a paintable image
// instead of a grid of numbers.
//
// STATED LIMITATION: same as nowcast.js — GPM IMERG's near-real-time feed
// has a real ~4h publishing delay (often more by the time Earth Engine
// finishes ingesting it), so "latest" means "the most recent frame Earth
// Engine actually has", not literally this instant. The `asOf` field in
// the response says exactly how recent it is.

const ee = require('@google/earthengine');

const CHENNAI_LON = 80.2707;
const CHENNAI_LAT = 13.0827;
// Used only to help FIND the right recent frame (filterBounds) and to
// measure how much rain is actually nearby for the `maxIntensityMm`
// figure below — NOT used to clip the map layer itself. Clipping the
// visible layer to a fixed box draws an ugly, unrealistic hard rectangle
// (rain doesn't respect an imaginary square), so the layer below is
// masked by intensity only and left to extend naturally.
const HALF_SIZE_DEG = 1.5;

// A much bigger box just for the "is there real rain nearby" check below --
// wide enough to actually match what's visible on screen at the app's
// normal zoom level, so the sidebar note never contradicts what the map
// is clearly showing.
const NEARBY_CHECK_HALF_SIZE_DEG = 4;

// Real rain, not satellite noise: GPM IMERG's near-real-time product has
// low-level speckle/noise even on dry days (readings around 0.1-0.3mm/hr
// that aren't really "rain" you'd notice). Masking at 0.1 painted that
// noise as a flat, ugly, near-solid block over the whole query box. 1.0
// mm/hr is a light-but-real drizzle threshold — below that, nothing is
// drawn, so the layer only lights up where rain is actually meaningful.
const RAIN_THRESHOLD_MM_HR = 1.0;

// Near-transparent for light rain, opaque purple for a downpour -- same
// "mask out the low pixels" trick used for the flood-depth layer in
// inundation.js, so dry areas stay fully see-through instead of painting
// a flat color everywhere.
const PRECIP_VIS = {
  min: RAIN_THRESHOLD_MM_HR,
  max: 15,
  palette: ['9ecae1', '6baed6', '3182bd', '08519c', '54278f', '3f007d'],
};

function queryRegion() {
  return ee.Geometry.Rectangle([
    CHENNAI_LON - HALF_SIZE_DEG, CHENNAI_LAT - HALF_SIZE_DEG,
    CHENNAI_LON + HALF_SIZE_DEG, CHENNAI_LAT + HALF_SIZE_DEG,
  ]);
}

async function getPrecipitationLayer() {
  const region = queryRegion();

  // Same wide 7-day search window nowcast.js uses, for the same reason:
  // IMERG's real ingestion lag in Earth Engine tested wider than its
  // stated ~4h delay, so a narrow window can come back completely empty.
  const end = new Date();
  const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);

  const imerg = ee.ImageCollection('NASA/GPM_L3/IMERG_V07')
    .filterBounds(region)
    .filterDate(start.toISOString(), end.toISOString())
    .select('precipitation');

  const latest = imerg.sort('system:time_start', false).first();

  const millis = await new Promise((resolve, reject) => {
    ee.Number(latest.get('system:time_start')).evaluate((v, err) => (err ? reject(err) : resolve(v)));
  });
  if (millis == null) throw new Error('No recent IMERG precipitation frames available - try again shortly.');
  const asOf = new Date(millis).toISOString();

  // Bilinear-resample before masking/painting -- GPM IMERG's native grid
  // is coarse (~11km cells), which without this renders as ugly, hard
  // "graph paper" blocks at normal map zoom. Resampling interpolates
  // smoothly between grid points instead, so it reads like a real weather
  // radar image rather than a checkerboard.
  const smoothed = latest.resample('bilinear');

  // Mask out anything that isn't real rain -- see RAIN_THRESHOLD_MM_HR
  // above. NOT clipped to a box: it's left to extend naturally wherever
  // actual rain exists, so no artificial rectangle edge is ever drawn.
  const rainOnly = smoothed.updateMask(smoothed.gt(RAIN_THRESHOLD_MM_HR));

  // How much real rain is actually near Chennai right now -- lets the UI
  // say "no significant rain nearby" instead of showing a near-empty,
  // confusing layer with no explanation. Checked over a much wider box
  // (see NEARBY_CHECK_HALF_SIZE_DEG) so this never contradicts a storm
  // that's clearly visible elsewhere on screen.
  const nearbyRegion = ee.Geometry.Rectangle([
    CHENNAI_LON - NEARBY_CHECK_HALF_SIZE_DEG, CHENNAI_LAT - NEARBY_CHECK_HALF_SIZE_DEG,
    CHENNAI_LON + NEARBY_CHECK_HALF_SIZE_DEG, CHENNAI_LAT + NEARBY_CHECK_HALF_SIZE_DEG,
  ]);
  const maxNearby = await new Promise((resolve, reject) => {
    rainOnly.reduceRegion({
      reducer: ee.Reducer.max(),
      geometry: nearbyRegion, scale: 11000, maxPixels: 1e9, bestEffort: true,
    }).get('precipitation').evaluate((v, err) => (err ? reject(err) : resolve(v)));
  });

  return new Promise((resolve, reject) => {
    rainOnly.getMapId(PRECIP_VIS, (mapId, err) => {
      if (err) return reject(err);
      resolve({
        tileUrl: mapId.urlFormat,
        asOf,
        maxIntensityNearbyMmHr: maxNearby != null ? parseFloat(maxNearby.toFixed(2)) : 0,
        note: 'GPM IMERG near-real-time satellite precipitation. Real ~4h+ publishing delay - "asOf" is the latest actually-available frame, not this instant.',
        units: 'mm/hr (instantaneous rain rate)',
      });
    });
  });
}

module.exports = { getPrecipitationLayer };
