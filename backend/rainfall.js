// rainfall.js — live + recent rainfall for Chennai, from Open-Meteo.
//
// This reuses the exact same rainfall source and settings validated in
// yesterday's from-scratch prototype: the free Open-Meteo API, explicitly
// using the ECMWF IFS 0.25 degree model (one of the most trusted global
// weather models), with 2 past days included so a 3-day rolling rainfall
// total is available immediately. No API key needed.

const CHENNAI_LAT = 13.0827;
const CHENNAI_LON = 80.2707;

// Same threshold learned by yesterday's AI model (3-day rainfall vs. flood
// risk, trained on real Chennai flood/no-flood days). Kept here so the new
// pieces have one honest, already-validated number to compare against.
const FLOOD_RISK_THRESHOLD_MM = 140.225;

/**
 * Fetch Chennai's rainfall: the last 3 days (as a rolling total) and the
 * next several hours (for later use as a simple, non-AI forecast baseline).
 */
async function getRainfallForecast() {
  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${CHENNAI_LAT}&longitude=${CHENNAI_LON}` +
    `&hourly=precipitation&past_days=2&forecast_days=7` +
    `&models=ecmwf_ifs025&timezone=Asia%2FKolkata`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Open-Meteo request failed: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();

  const times = data.hourly.time;
  const precip = data.hourly.precipitation; // mm of rain, one number per hour

  // Find the index closest to "right now" in the hourly list.
  const now = new Date();
  let nowIndex = times.findIndex((t) => new Date(t) > now);
  if (nowIndex === -1) nowIndex = times.length - 1;
  if (nowIndex === 0) nowIndex = 1;

  // 3-day rolling total = sum of the 72 hours ending now. This is the
  // figure the AI model's 140.225mm threshold was trained and validated
  // against (see the strategy notes) — use this for overall flood RISK.
  const startIndex3Day = Math.max(0, nowIndex - 72);
  const past3DayTotal = precip
    .slice(startIndex3Day, nowIndex)
    .reduce((sum, mm) => sum + (mm || 0), 0);

  // 24-hour rolling total — a single-storm-scale figure. The SCS Curve
  // Number formula (used for the actual flood DEPTH calculation) is meant
  // for one storm's rainfall, not a multi-day accumulated total treated as
  // if it all fell at once — using the 3-day figure there would overstate
  // runoff, since real rain spread across days lets some water soak in
  // between bursts. Use THIS figure for depth/inundation calculations.
  const startIndex24h = Math.max(0, nowIndex - 24);
  const past24HourTotal = precip
    .slice(startIndex24h, nowIndex)
    .reduce((sum, mm) => sum + (mm || 0), 0);

  // Next 6 hours — a simple real forecast, useful later as the baseline
  // the AI nowcast (ConvLSTM) will need to beat.
  const next6Hours = precip.slice(nowIndex, nowIndex + 6).map((mm, i) => ({
    hoursFromNow: i + 1,
    mm: mm ?? 0,
  }));

  const riskLevel = past3DayTotal >= FLOOD_RISK_THRESHOLD_MM ? 'HIGH' : 'LOW';

  return {
    location: 'Chennai',
    source: 'Open-Meteo (ECMWF IFS 0.25°)',
    asOf: times[nowIndex],
    past3DayTotalMm: parseFloat(past3DayTotal.toFixed(2)),
    past24HourTotalMm: parseFloat(past24HourTotal.toFixed(2)),
    floodRiskThresholdMm: FLOOD_RISK_THRESHOLD_MM,
    riskLevel,
    next6Hours,
  };
}

module.exports = { getRainfallForecast, FLOOD_RISK_THRESHOLD_MM };
