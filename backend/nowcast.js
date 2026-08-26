// nowcast.js — rainfall NOWCAST for Chennai: looks at the last 6 hours of
// real satellite rainfall maps and predicts the next 3 hours, using a
// ConvLSTM neural net trained on real GPM IMERG rainfall data (see the
// project notes for training details — beat a persistence baseline by
// ~20% on held-out test data).
//
// IMPORTANT: this predicts RAINFALL, not flooding. Its predicted rainfall
// can be fed into /api/inundation exactly like any other rainfall figure —
// flood modeling stays entirely inside inundation.js/alerts.js.
//
// The actual neural net runs in Python (predict_nowcast.py), called as a
// subprocess — @tensorflow/tfjs-node's native Windows build turned out to
// be too fragile to rely on for a team demo, so inference goes through a
// plain `pip install tensorflow`, which installs cleanly everywhere.
//
// Two modes:
//   "live"   — pulls the most recent real satellite rainfall over Chennai.
//              STATED LIMITATION: GPM IMERG's near-real-time data has a
//              real-world ~4-hour publishing delay, so "live" means "the
//              latest data actually available", not literally this instant
//              — the `asOf` field in the response says exactly how recent.
//   "replay" — one fixed, real example from the held-out test set (not
//              live, but not fake either) — an offline demo fallback if
//              live data or the model call is ever slow/unavailable.

const ee = require('@google/earthengine');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const CHENNAI_LON = 80.2707;
const CHENNAI_LAT = 13.0827;
const HALF_SIZE_DEG = 0.75;   // same 1.5° x 1.5° box used for training
const GRID_SCALE = 11000;     // same ~0.1° native IMERG scale used for training
const GRID_SIZE = 15;
const T_IN = 6;

const REPLAY_PATH = path.join(__dirname, 'data', 'nowcast_replay_example.json');

function gridMean(grid) {
  const flat = grid.flat();
  return flat.reduce((a, b) => a + b, 0) / flat.length;
}

function summarizeFrames(frames) {
  return frames.map((frame, i) => ({
    hoursFromNow: i + 1,
    avgMm: parseFloat(gridMean(frame).toFixed(3)),
    maxMm: parseFloat(Math.max(...frame.flat()).toFixed(3)),
  }));
}

function runModel(inputMm) {
  return new Promise((resolve, reject) => {
    const child = execFile(
      'python',
      [path.join(__dirname, 'predict_nowcast.py')],
      { cwd: __dirname, maxBuffer: 10 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) return reject(new Error(`predict_nowcast.py failed: ${stderr || err.message}`));
        try {
          const parsed = JSON.parse(stdout);
          if (parsed && parsed.error) return reject(new Error(parsed.error));
          resolve(parsed);
        } catch (e) {
          reject(new Error(`Could not parse predict_nowcast.py output: ${stdout}`));
        }
      }
    );
    child.stdin.write(JSON.stringify(inputMm));
    child.stdin.end();
  });
}

// ── Replay mode — no GEE, no model call, just the recorded real example ────
function getReplayNowcast() {
  const example = JSON.parse(fs.readFileSync(REPLAY_PATH, 'utf8'));
  return {
    mode: 'replay',
    note: 'Real held-out test example from training, NOT live data — used as an offline demo fallback.',
    inputMm: example.inputMm,
    predictedMm: example.predictedFutureMm,
    actualMm: example.actualFutureMm,
    summary: summarizeFrames(example.predictedFutureMm),
    gridSize: example.gridSize,
  };
}

// ── Live mode ────────────────────────────────────────────────────────────
async function pullLiveGrid() {
  const region = ee.Geometry.Rectangle([
    CHENNAI_LON - HALF_SIZE_DEG, CHENNAI_LAT - HALF_SIZE_DEG,
    CHENNAI_LON + HALF_SIZE_DEG, CHENNAI_LAT + HALF_SIZE_DEG,
  ]);

  // Pull a MUCH wider window than the 6 hours we actually need. GPM IMERG's
  // stated near-real-time delay is ~4h, but testing showed Earth Engine's
  // own ingestion adds more lag on top of that — a 12h window came back
  // completely empty. 7 days is comfortably wide enough to reliably find
  // the latest available data regardless of exact ingestion delay; we then
  // take whatever the LATEST 6 complete hourly frames actually turn out to
  // be, and report exactly how recent that data really is via `asOf`.
  const end = new Date();
  const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);

  const imerg = ee.ImageCollection('NASA/GPM_L3/IMERG_V07')
    .filterBounds(region)
    .filterDate(start.toISOString(), end.toISOString())
    .select('precipitation');

  const table = await new Promise((resolve, reject) => {
    imerg.getRegion(region, GRID_SCALE).evaluate((result, err) => (err ? reject(err) : resolve(result)));
  });

  const header = table[0];
  const rows = table.slice(1);
  const col = Object.fromEntries(header.map((name, i) => [name, i]));

  const frames = new Map();
  for (const row of rows) {
    const t = row[col.time];
    const precip = row[col.precipitation] ?? 0;
    if (!frames.has(t)) frames.set(t, []);
    frames.get(t).push(precip);
  }

  const times = [...frames.keys()].sort((a, b) => a - b);
  if (times.length < 2) throw new Error('Not enough recent IMERG frames available yet — try again shortly.');

  const halfHourly = times.map((t) => {
    const flat = frames.get(t);
    if (flat.length !== GRID_SIZE * GRID_SIZE) {
      throw new Error(`Inconsistent grid: expected ${GRID_SIZE * GRID_SIZE} pixels, got ${flat.length}`);
    }
    const grid = [];
    for (let r = 0; r < GRID_SIZE; r++) grid.push(flat.slice(r * GRID_SIZE, (r + 1) * GRID_SIZE));
    return grid;
  });

  // Aggregate half-hourly -> hourly (sum consecutive pairs), keeping only
  // complete pairs counted from the END (most recent) — same as training.
  const nHours = Math.floor(halfHourly.length / 2);
  const usable = halfHourly.slice(halfHourly.length - nHours * 2);
  const hourly = [];
  for (let h = 0; h < nHours; h++) {
    const a = usable[h * 2];
    const b = usable[h * 2 + 1];
    hourly.push(a.map((row, r) => row.map((v, c) => v + b[r][c])));
  }

  if (hourly.length < T_IN) {
    throw new Error(`Only ${hourly.length} complete hourly frames available (need ${T_IN}) — IMERG data may be delayed right now.`);
  }

  const latestTime = new Date(times[times.length - 1]);
  return { hourly: hourly.slice(-T_IN), asOf: latestTime.toISOString() };
}

async function getLiveNowcast() {
  const { hourly, asOf } = await pullLiveGrid();
  const predictedMm = await runModel(hourly);

  return {
    mode: 'live',
    note: 'GPM IMERG near-real-time data has a real ~4h publishing delay — "asOf" is the latest actually-available data, not this instant.',
    asOf,
    inputMm: hourly,
    predictedMm,
    summary: summarizeFrames(predictedMm),
    gridSize: GRID_SIZE,
  };
}

async function getNowcast(mode) {
  if (mode === 'replay') return getReplayNowcast();
  try {
    return await getLiveNowcast();
  } catch (err) {
    // Earth Engine's callbacks sometimes reject with a plain string instead
    // of an Error object — normalize so the real message never gets lost.
    const message = err instanceof Error ? err.message : String(err);
    console.error('Live nowcast failed, falling back to replay:', message);

    // Graceful fallback: if live data or the model call fails for any
    // reason, fall back to the replay example rather than showing a broken
    // demo — but SAY that's what happened, never silently swap in
    // different data without saying so.
    const replay = getReplayNowcast();
    return { ...replay, liveAttemptFailed: true, liveError: message };
  }
}

module.exports = { getNowcast };
