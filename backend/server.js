// server.js — Express backend for CFVI (Chennai only)
require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const ee      = require('@google/earthengine');
const fs      = require('fs');

const { getFVI, inspectPoint, getRainfallSimulation } = require('./fvi');
const { getFISI, inspectFISIPoint, getPopulationDensity, FISI_WEIGHTS, FISI_PARAMETERS } = require('./fisi');
const { getRainfallForecast } = require('./rainfall');
const { getInundation } = require('./inundation');
const { getAlerts } = require('./alerts');
const { getNowcast } = require('./nowcast');
const { getPrecipitationLayer } = require('./precipitation');

const app  = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// ── GEE Authentication ─────────────────────────────────────────────────────
let geeReady = false;

function initGEE() {
  const keyFile = process.env.GEE_KEY_FILE;
  if (!keyFile || !fs.existsSync(keyFile)) {
    console.error('❌  GEE_KEY_FILE not found. Set it in .env pointing to your service account JSON.');
    process.exit(1);
  }
  const key = JSON.parse(fs.readFileSync(keyFile, 'utf8'));
  ee.data.authenticateViaPrivateKey(key, () => {
    ee.initialize(null, null, () => {
      geeReady = true;
      console.log('✅  GEE authenticated and initialized');
    }, (err) => { console.error('❌  GEE initialize failed:', err); process.exit(1); });
  }, (err) => { console.error('❌  GEE auth failed:', err); process.exit(1); });
}
initGEE();

function requireGEE(req, res, next) {
  if (!geeReady) return res.status(503).json({ error: 'GEE not ready yet, try again in a moment.' });
  next();
}

// ── Health ─────────────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok', geeReady }));

// GET /api/rainfall — live + recent Chennai rainfall (no GEE needed, just
// a normal web request to Open-Meteo). This does NOT require the GEE key,
// so it works even before/without an Earth Engine key being set up.
app.get('/api/rainfall', async (req, res) => {
  try {
    console.log('\u23f3  Fetching rainfall forecast for Chennai');
    const result = await getRainfallForecast();
    console.log('\u2705  Rainfall fetch done');
    res.json(result);
  } catch (err) {
    console.error('Rainfall fetch error:', err);
    res.status(500).json({ error: 'Rainfall fetch failed', detail: String(err) });
  }
});

// ── GET /api/flood-index ───────────────────────────────────────────────────
app.get('/api/flood-index', requireGEE, async (req, res) => {
  try {
    console.log('⏳  Computing FVI for Chennai');
    const result = await getFVI();
    console.log('✅  FVI done');
    res.json(result);
  } catch (err) {
    console.error('FVI error:', err);
    res.status(500).json({ error: 'GEE computation failed', detail: String(err) });
  }
});

// ── GET /api/fisi ──────────────────────────────────────────────────────────
app.get('/api/fisi', requireGEE, async (req, res) => {
  try {
    console.log('⏳  Computing FISI for Chennai');
    const result = await getFISI();
    console.log('✅  FISI done');
    res.json(result);
  } catch (err) {
    console.error('FISI error:', err);
    res.status(500).json({ error: 'GEE computation failed', detail: String(err) });
  }
});

// ── GET /api/fisi/meta ─────────────────────────────────────────────────────
app.get('/api/fisi/meta', (req, res) => {
  res.json({ weights: FISI_WEIGHTS, parameters: FISI_PARAMETERS });
});

// ── GET /api/population ────────────────────────────────────────────────────
app.get('/api/population', requireGEE, async (req, res) => {
  try {
    console.log('⏳  Computing population density for Chennai');
    const result = await getPopulationDensity();
    console.log('✅  Population done');
    res.json(result);
  } catch (err) {
    console.error('Population error:', err);
    res.status(500).json({ error: 'GEE computation failed', detail: String(err) });
  }
});

// ── GET /api/inspect ───────────────────────────────────────────────────────
app.get('/api/inspect', requireGEE, async (req, res) => {
  const lat = parseFloat(req.query.lat);
  const lng = parseFloat(req.query.lng);
  if (Number.isNaN(lat) || Number.isNaN(lng))
    return res.status(400).json({ error: 'lat and lng are required numbers' });

  try {
    const result = await inspectPoint(lat, lng);
    res.json(result);
  } catch (err) {
    console.error('Inspect error:', err);
    res.status(500).json({ error: 'Point inspection failed', detail: String(err) });
  }
});

// ── GET /api/fisi/inspect ──────────────────────────────────────────────────
app.get('/api/fisi/inspect', requireGEE, async (req, res) => {
  const lat = parseFloat(req.query.lat);
  const lng = parseFloat(req.query.lng);
  if (Number.isNaN(lat) || Number.isNaN(lng))
    return res.status(400).json({ error: 'lat and lng are required numbers' });

  try {
    const result = await inspectFISIPoint(lat, lng);
    res.json(result);
  } catch (err) {
    console.error('FISI inspect error:', err);
    res.status(500).json({ error: 'Point inspection failed', detail: String(err) });
  }
});

// ── GET /api/simulate-rainfall ─────────────────────────────────────────────
// GET /api/inundation — real rainfall-driven flood depth (SCS Curve Number
// + flow-accumulation concentration). Pass ?rainfall=<mm> to test a specific
// amount, or leave it off to use the live 3-day rainfall total automatically.
app.get('/api/inundation', requireGEE, async (req, res) => {
  try {
    let rainfallMm = parseFloat(req.query.rainfall);
    if (Number.isNaN(rainfallMm)) {
      // Use the 24-hour total (single-storm scale), not the 3-day total —
      // see rainfall.js for why. The 3-day figure is still what the AI
      // model's HIGH/LOW risk flag uses; this is a separate, physical
      // "how deep would it get" calculation.
      const forecast = await getRainfallForecast();
      rainfallMm = forecast.past24HourTotalMm;
    }
    console.log(`\u23f3  Computing inundation for ${rainfallMm}mm rainfall`);
    const result = await getInundation(rainfallMm);
    console.log('\u2705  Inundation done');
    res.json(result);
  } catch (err) {
    console.error('Inundation error:', err);
    res.status(500).json({ error: 'Inundation computation failed', detail: String(err) });
  }
});

// ── GET /api/alerts — zone-level early warnings ─────────────────────────────
// Same rainfall-driven depth model as /api/inundation, split into grid
// zones (see alerts.js header for why grid zones instead of real wards).
// Pass ?rainfall=<mm> to test a specific amount, or leave it off to use the
// live 24-hour rainfall total automatically (same default as /api/inundation).
app.get('/api/alerts', requireGEE, async (req, res) => {
  try {
    let rainfallMm = parseFloat(req.query.rainfall);
    if (Number.isNaN(rainfallMm)) {
      const forecast = await getRainfallForecast();
      rainfallMm = forecast.past24HourTotalMm;
    }
    console.log(`\u23f3  Computing zone alerts for ${rainfallMm}mm rainfall`);
    const result = await getAlerts(rainfallMm);
    console.log(`\u2705  Alerts done — ${result.summary.zonesAtWarningOrAbove}/${result.summary.totalZones} zones at WARNING or above`);
    res.json(result);
  } catch (err) {
    console.error('Alerts error:', err);
    res.status(500).json({ error: 'Alerts computation failed', detail: String(err) });
  }
});

// ── GET /api/nowcast — ConvLSTM rainfall nowcast (predicts RAINFALL, not
// flooding) — pass ?mode=replay to use a fixed real test example instead of
// live satellite data (offline demo fallback; live is the default).
app.get('/api/nowcast', async (req, res) => {
  const mode = req.query.mode === 'replay' ? 'replay' : 'live';
  if (mode === 'live' && !geeReady) {
    return res.status(503).json({ error: 'GEE not ready yet, try again in a moment.' });
  }
  try {
    console.log(`\u23f3  Computing ${mode} nowcast`);
    const result = await getNowcast(mode);
    console.log(`\u2705  Nowcast done (${result.mode}${result.liveAttemptFailed ? ', live attempt failed — fell back to replay' : ''})`);
    res.json(result);
  } catch (err) {
    console.error('Nowcast error:', err);
    res.status(500).json({ error: 'Nowcast computation failed', detail: String(err) });
  }
});

// GET /api/precipitation -- latest live GPM IMERG satellite rain-cover
// layer over and around Chennai (see precipitation.js for details).
app.get('/api/precipitation', requireGEE, async (req, res) => {
  try {
    console.log('\u23f3  Fetching live precipitation layer for Chennai');
    const result = await getPrecipitationLayer();
    console.log('\u2705  Precipitation layer done');
    res.json(result);
  } catch (err) {
    console.error('Precipitation error:', err);
    res.status(500).json({ error: 'Precipitation layer failed', detail: String(err) });
  }
});

app.get('/api/simulate-rainfall', requireGEE, async (req, res) => {
  const rainfall = parseFloat(req.query.rainfall);
  if (Number.isNaN(rainfall) || rainfall <= 0)
    return res.status(400).json({ error: 'rainfall must be a positive number' });

  try {
    const result = await getRainfallSimulation(rainfall);
    res.json(result);
  } catch (err) {
    console.error('Rainfall error:', err);
    res.status(500).json({ error: 'Rainfall simulation failed', detail: String(err) });
  }
});

app.listen(PORT, () => {
  console.log(`🌊  CFVI backend running on http://localhost:${PORT}`);
});
