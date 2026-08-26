import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import './App.css';
import AnimatedNumber from './components/AnimatedNumber';
import ClickInspector from './components/ClickInspector';
import RegionalBreakdown from './components/RegionalBreakdown';
import FISIPanel from './components/FISI/FISIPanel';
import FISIWeights from './components/FISI/FISIWeights';
import FISILegend from './components/FISI/FISILegend';
import PopulationToggle from './components/FISI/PopulationToggle';
import PopulationLegend from './components/FISI/PopulationLegend';
import LiveConditions from './components/LiveConditions';
import CurrentSituationPanel from './components/CurrentSituationPanel';
import HistoricalFloodPointsLayer from './components/HistoricalFloodPointsLayer';
import { REPLAY_EVENTS } from './replayEvents';

// Chennai — fixed study area, no district switching
const CHENNAI_CENTER = { lat: 13.0827, lng: 80.2707, zoom: 11 };

const LEGEND = [
  { color: '#267300', label: 'Low',            range: '≤ 1.8' },
  { color: '#A3FF00', label: 'Moderately Low', range: '1.8 – 2.4' },
  { color: '#FFAA00', label: 'Moderate',       range: '2.4 – 3.2' },
  { color: '#E60000', label: 'High',           range: '3.2 – 4.0' },
  { color: '#730000', label: 'Very High',      range: '> 4.0' },
  { color: '#0077b6', label: 'Water Body',     range: '—' },
];

// Same color scale alerts.js's ALERT_LEVELS uses, for the Current
// Situation page's zone-marker legend.
const ALERT_LEGEND = [
  { color: '#267300', label: 'Normal' },
  { color: '#A3FF00', label: 'Advisory' },
  { color: '#FFAA00', label: 'Watch' },
  { color: '#FF6B00', label: 'Warning' },
  { color: '#E60000', label: 'Severe Warning' },
  { color: '#730000', label: 'Emergency' },
];

function GEETileLayer({ tileUrl, opacity, skipFlyTo = false }) {
  const map = useMap();
  const layerRef   = useRef(null);
  const opacityRef = useRef(opacity);

  useEffect(() => {
    if (!tileUrl) return;
    const L = require('leaflet');
    const oldLayer = layerRef.current;
    const newLayer = L.tileLayer(tileUrl, { opacity: 0, attribution: 'GEE | FVI' });
    newLayer.addTo(map);

    let rafId = null;
    let fired = false;
    const fadeIn = () => {
      if (fired) return;
      fired = true;
      const duration = 450;
      const start = performance.now();
      const step = (now) => {
        const t = Math.min((now - start) / duration, 1);
        newLayer.setOpacity(t * opacityRef.current);
        if (t < 1) { rafId = requestAnimationFrame(step); }
        else if (oldLayer) { map.removeLayer(oldLayer); }
      };
      rafId = requestAnimationFrame(step);
    };

    newLayer.once('load', fadeIn);
    const fallback = setTimeout(fadeIn, 700);
    layerRef.current = newLayer;

    if (!skipFlyTo) {
      map.flyTo([CHENNAI_CENTER.lat, CHENNAI_CENTER.lng], CHENNAI_CENTER.zoom, { duration: 1.2 });
    }

    return () => { clearTimeout(fallback); if (rafId) cancelAnimationFrame(rafId); };
  }, [tileUrl, map, skipFlyTo]);

  useEffect(() => {
    opacityRef.current = opacity;
    if (layerRef.current) layerRef.current.setOpacity(opacity);
  }, [opacity]);

  useEffect(() => {
    return () => {
      if (layerRef.current) { map.removeLayer(layerRef.current); layerRef.current = null; }
    };
  }, [map]);

  return null;
}

function SwipeTileLayer({ tileUrl, basemap, opacity }) {
  const map      = useMap();
  const baseRef  = useRef(null);
  const leftRef  = useRef(null);
  const rightRef = useRef(null);
  const swipeRef = useRef(null);

  useEffect(() => {
    if (!tileUrl) return;
    const L = require('leaflet');
    require('leaflet-side-by-side');

    if (swipeRef.current) { swipeRef.current.remove(); swipeRef.current = null; }
    if (leftRef.current)  { map.removeLayer(leftRef.current);  leftRef.current = null; }
    if (rightRef.current) { map.removeLayer(rightRef.current); rightRef.current = null; }
    if (baseRef.current)  { map.removeLayer(baseRef.current);  baseRef.current = null; }

    const baseUrl = basemap === 'satellite'
      ? 'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}'
      : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

    const baseLayer  = L.tileLayer(baseUrl, { maxZoom: 20 }).addTo(map);
    const leftLayer  = L.tileLayer('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', { opacity: 0, maxZoom: 20 }).addTo(map);
    const rightLayer = L.tileLayer(tileUrl, { opacity }).addTo(map);

    baseRef.current  = baseLayer;
    leftRef.current  = leftLayer;
    rightRef.current = rightLayer;
    swipeRef.current = L.control.sideBySide(leftLayer, rightLayer).addTo(map);

    map.flyTo([CHENNAI_CENTER.lat, CHENNAI_CENTER.lng], CHENNAI_CENTER.zoom, { duration: 1.2 });

    return () => {
      if (swipeRef.current) { swipeRef.current.remove(); swipeRef.current = null; }
      if (leftRef.current)  { map.removeLayer(leftRef.current);  leftRef.current = null; }
      if (rightRef.current) { map.removeLayer(rightRef.current); rightRef.current = null; }
      if (baseRef.current)  { map.removeLayer(baseRef.current);  baseRef.current = null; }
    };
  }, [tileUrl, map, basemap, opacity]);

  return null;
}

function classColor(cls) {
  return {
    'Low': '#267300', 'Moderately Low': '#A3FF00',
    'Moderate': '#FFAA00', 'High': '#E60000', 'Very High': '#730000',
  }[cls] || '#888';
}

export default function App() {
  const [mode, setMode] = useState('fvi');

  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState(null);
  const [tileUrl, setTileUrl]     = useState(null);
  const [stats, setStats]         = useState(null);
  const [basemap, setBasemap]     = useState('satellite');
  const [opacity, setOpacity]     = useState(1.0);
  const [swipeMode, setSwipeMode] = useState(false);
  const [inspectMode, setInspectMode] = useState(false);
  const [rainfallMode, setRainfallMode] = useState(false);
  const [rainfallTileUrl, setRainfallTileUrl] = useState(null);
  const [rainfallStats, setRainfallStats]     = useState(null);
  const [rainfallLoading, setRainfallLoading] = useState(false);

  const [fisiLoading, setFisiLoading] = useState(false);
  const [fisiError, setFisiError]     = useState(null);
  const [fisiTileUrl, setFisiTileUrl] = useState(null);
  const [fisiStats, setFisiStats]     = useState(null);
  const [fisiMeta, setFisiMeta]       = useState({ weights: [], parameters: [] });

  const [popEnabled, setPopEnabled] = useState(false);
  const [popOpacity, setPopOpacity] = useState(0.6);
  const [popTileUrl, setPopTileUrl] = useState(null);
  const [popLoading, setPopLoading] = useState(false);
  const [popError, setPopError]     = useState(null);

  // Current Situation (page 1) — real-time inundation + alerts, driven by
  // either the live 24h rainfall ("now") or the AI nowcast's predicted
  // rainfall for the next 3 hours ("future"). FVI/FISI below remain the
  // separate, static Vulnerability Index page.
  const [view, setView] = useState('current');
  const [timeMode, setTimeMode] = useState('now');
  const [replayEvent, setReplayEvent] = useState('live');

  const [curRainfall, setCurRainfall] = useState(null);
  const [curNowcast, setCurNowcast]   = useState(null);

  const [curInundationTileUrl, setCurInundationTileUrl] = useState(null);
  const [curClassifiedTileUrl, setCurClassifiedTileUrl] = useState(null);
  const [curClassifiedLegend, setCurClassifiedLegend]   = useState(null);
  const [curInundationStats, setCurInundationStats]     = useState(null);
  const [curInundationLoading, setCurInundationLoading] = useState(false);
  const [curInundationError, setCurInundationError]     = useState(null);

  const [curAlertZones, setCurAlertZones]       = useState([]);
  const [curAlertSummary, setCurAlertSummary]   = useState(null);
  const [curAlertsLoading, setCurAlertsLoading] = useState(false);
  const [curAlertsError, setCurAlertsError]     = useState(null);

  // Live GPM IMERG rain-cover layer -- the actual storm system over/around
  // Chennai, painted on the map (see precipitation.js).
  const [showRainLayer, setShowRainLayer]   = useState(true);
  const [curPrecipTileUrl, setCurPrecipTileUrl] = useState(null);
  const [curPrecipAsOf, setCurPrecipAsOf]       = useState(null);
  const [curPrecipMaxMmHr, setCurPrecipMaxMmHr] = useState(null);
  const [curPrecipLoading, setCurPrecipLoading] = useState(false);
  const [curPrecipError, setCurPrecipError]     = useState(null);

  const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:3001';

  // FVI fetch — no district param needed
  useEffect(() => {
    if (mode !== 'fvi') return;
    async function fetchFVI() {
      setLoading(true); setError(null);
      try {
        const res = await fetch(`${apiUrl}/api/flood-index`);
        if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Server error'); }
        const data = await res.json();
        setTileUrl(data.tileUrl); setStats(data.stats);
      } catch (err) { setError(err.message); }
      finally { setLoading(false); }
    }
    fetchFVI();
  }, [mode, apiUrl]);

  // FISI fetch — no district param needed
  useEffect(() => {
    if (mode !== 'fisi') return;
    async function fetchFISI() {
      setFisiLoading(true); setFisiError(null);
      try {
        const res = await fetch(`${apiUrl}/api/fisi`);
        if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Server error'); }
        const data = await res.json();
        setFisiTileUrl(data.tileUrl); setFisiStats(data.stats);
      } catch (err) { setFisiError(err.message); }
      finally { setFisiLoading(false); }
    }
    fetchFISI();
  }, [mode, apiUrl]);

  // Population overlay
  useEffect(() => {
    if (mode !== 'fisi' || !popEnabled) return;
    async function fetchPopulation() {
      setPopLoading(true); setPopError(null);
      try {
        const res = await fetch(`${apiUrl}/api/population`);
        if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Server error'); }
        const data = await res.json();
        setPopTileUrl(data.tileUrl);
      } catch (err) { setPopError(err.message); }
      finally { setPopLoading(false); }
    }
    fetchPopulation();
  }, [mode, popEnabled, apiUrl]);

  // FISI metadata
  useEffect(() => {
    fetch(`${apiUrl}/api/fisi/meta`).then(r => r.json()).then(setFisiMeta).catch(() => {});
  }, [apiUrl]);

  // Current Situation: live rainfall + nowcast, just to get the numbers
  // (LiveConditions fetches its own copy separately, for display). Only
  // runs in "Live forecast" mode -- a historical replay's rainfall figure
  // is fixed, so there's nothing live to poll. Refreshes every 5 minutes
  // (same cadence as the rain radar layer and LiveConditions) so the
  // WHOLE Live section -- rainfall, flood map, zone alerts -- updates
  // itself automatically if real weather changes while the page is open,
  // instead of only updating on a manual browser refresh.
  useEffect(() => {
    if (view !== 'current' || replayEvent !== 'live') return;
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`${apiUrl}/api/rainfall`);
        const data = await res.json();
        if (!cancelled && res.ok) setCurRainfall(data);
      } catch (err) { /* LiveConditions already surfaces this error */ }
      try {
        const res = await fetch(`${apiUrl}/api/nowcast`);
        const data = await res.json();
        if (!cancelled && res.ok) setCurNowcast(data);
      } catch (err) { /* LiveConditions already surfaces this error */ }
    }
    load();
    const interval = setInterval(load, 5 * 60 * 1000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [view, apiUrl, replayEvent]);

  // "Now" = the real, currently-measured 24h rainfall total (same figure
  // /api/inundation defaults to). "Future" = the AI nowcast's predicted
  // rainfall summed across the next 3 hours — same units (mm), so it can
  // drive the exact same real inundation physics as "now" does.
  const curRainfallMm = replayEvent !== 'live'
    ? REPLAY_EVENTS[replayEvent].rainfallMm
    : (timeMode === 'future'
        ? (curNowcast?.summary?.reduce((sum, h) => sum + h.avgMm, 0) ?? null)
        : (curRainfall?.past24HourTotalMm ?? null));

  useEffect(() => {
    if (view !== 'current' || curRainfallMm == null) return;
    let cancelled = false;
    async function loadInundation() {
      setCurInundationLoading(true); setCurInundationError(null);
      try {
        const res = await fetch(`${apiUrl}/api/inundation?rainfall=${curRainfallMm}`);
        const data = await res.json();
        if (cancelled) return;
        // data.detail carries the actual GEE error message (server.js sends
        // both) -- data.error alone is just the generic "X computation
        // failed" label, useless for diagnosing what actually broke.
        if (!res.ok) throw new Error(data.detail || data.error || 'Server error');
        setCurInundationTileUrl(data.tileUrl);
        setCurClassifiedTileUrl(data.classifiedTileUrl ?? null);
        setCurClassifiedLegend(data.classifiedLegend ?? null);
        setCurInundationStats(data.stats);
      } catch (err) {
        if (!cancelled) setCurInundationError(err.message);
      } finally {
        if (!cancelled) setCurInundationLoading(false);
      }
    }
    loadInundation();
    return () => { cancelled = true; };
  }, [view, apiUrl, curRainfallMm]);

  useEffect(() => {
    if (view !== 'current' || curRainfallMm == null) return;
    let cancelled = false;
    async function loadAlerts() {
      setCurAlertsLoading(true); setCurAlertsError(null);
      try {
        const res = await fetch(`${apiUrl}/api/alerts?rainfall=${curRainfallMm}`);
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(data.detail || data.error || 'Server error');
        setCurAlertZones(data.zones || []);
        setCurAlertSummary(data.summary || null);
      } catch (err) {
        if (!cancelled) setCurAlertsError(err.message);
      } finally {
        if (!cancelled) setCurAlertsLoading(false);
      }
    }
    loadAlerts();
    return () => { cancelled = true; };
  }, [view, apiUrl, curRainfallMm]);

  // Live rain-cover layer -- independent of timeMode (it always shows the
  // actual current storm, not a prediction), refreshed every 5 minutes to
  // match LiveConditions' own refresh cadence.
  useEffect(() => {
    if (view !== 'current' || !showRainLayer || replayEvent !== 'live') return;
    let cancelled = false;
    async function loadPrecip() {
      setCurPrecipLoading(true); setCurPrecipError(null);
      try {
        const res = await fetch(`${apiUrl}/api/precipitation`);
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(data.error || 'Server error');
        setCurPrecipTileUrl(data.tileUrl);
        setCurPrecipAsOf(data.asOf);
        setCurPrecipMaxMmHr(data.maxIntensityNearbyMmHr ?? null);
      } catch (err) {
        if (!cancelled) setCurPrecipError(err.message);
      } finally {
        if (!cancelled) setCurPrecipLoading(false);
      }
    }
    loadPrecip();
    const interval = setInterval(loadPrecip, 5 * 60 * 1000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [view, apiUrl, showRainLayer, replayEvent]);

  async function handleRainfallSimulation(rainfallCm) {
    setRainfallLoading(true);
    try {
      const res = await fetch(`${apiUrl}/api/simulate-rainfall?rainfall=${rainfallCm}`);
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Simulation failed'); }
      const data = await res.json();
      setRainfallTileUrl(data.tileUrl);
      setRainfallStats(data.stats);
      setRainfallMode(true);
    } catch (err) {
      console.error('Rainfall simulation error:', err);
      alert('Rainfall simulation failed: ' + err.message);
    } finally { setRainfallLoading(false); }
  }

  function handleClearRainfall() {
    setRainfallMode(false); setRainfallTileUrl(null); setRainfallStats(null);
  }

  const isFISI          = mode === 'fisi';
  const activeTileUrl   = isFISI ? fisiTileUrl : tileUrl;
  const activeLoading   = isFISI ? fisiLoading : loading;
  const inspectEndpoint = isFISI ? `${apiUrl}/api/fisi/inspect` : `${apiUrl}/api/inspect`;

  function handleModeChange(nextMode) {
    if (nextMode === mode) return;
    setRainfallMode(false); setRainfallTileUrl(null); setRainfallStats(null);
    setMode(nextMode);
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="brand-row">
            <img src="/logo.png" alt="CFVI logo" className="brand-logo" />
            <h1>Chennai Flood<br />Vulnerability Index</h1>
          </div>
          <p className="subtitle">Chennai District Analysis</p>
        </div>

        <div className="view-toggle">
          <button className={view === 'current' ? 'active' : ''} onClick={() => setView('current')}>Current Situation</button>
          <button className={view === 'vulnerability' ? 'active' : ''} onClick={() => setView('vulnerability')}>Vulnerability Index</button>
        </div>

        {view === 'current' && (
          <CurrentSituationPanel
            apiUrl={apiUrl}
            timeMode={timeMode}
            onTimeModeChange={setTimeMode}
            inundationLoading={curInundationLoading}
            inundationError={curInundationError}
            inundationStats={curInundationStats}
            alertsLoading={curAlertsLoading}
            alertsError={curAlertsError}
            alertsSummary={curAlertSummary}
            rainLayerOn={showRainLayer}
            onRainLayerToggle={setShowRainLayer}
            precipLoading={curPrecipLoading}
            precipError={curPrecipError}
            precipAsOf={curPrecipAsOf}
            precipMaxMmHr={curPrecipMaxMmHr}
            replayEvent={replayEvent}
            onReplayEventChange={setReplayEvent}
          />
        )}

        {/* Population Density overlay — FISI mode only */}
        {view === 'vulnerability' && isFISI && (
          <PopulationToggle
            enabled={popEnabled} onToggle={setPopEnabled}
            opacity={popOpacity} onOpacityChange={setPopOpacity}
            loading={popLoading} error={popError}
          />
        )}

        {/* Rainfall Simulation — FVI mode only */}
        {view === 'vulnerability' && !isFISI && (
          <div className="control-group">
            <label>Rainfall Simulation</label>
            <div className="rainfall-buttons">
              {[{ cm: 5, label: 'Light Rain' }, { cm: 15, label: 'Moderate' }, { cm: 30, label: 'Heavy' }, { cm: 50, label: 'Extreme' }].map(({ cm, label }) => (
                <button key={cm} className="rainfall-btn" onClick={() => handleRainfallSimulation(cm)} disabled={rainfallLoading}>
                  <span className="rainfall-value">{cm}cm</span>
                  <span className="rainfall-label">{label}</span>
                </button>
              ))}
            </div>
            {rainfallMode && (
              <>
                <p className="swipe-hint">Showing water simulation only — click "Clear Simulation" to bring back the FVI layer</p>
                <button className="clear-rainfall-btn" onClick={handleClearRainfall}>Clear Simulation</button>
              </>
            )}
            {rainfallLoading && <p className="swipe-hint">Simulating rainfall inundation...</p>}
            {rainfallStats && (
              <div className="rainfall-stats">
                <p><strong>Rainfall:</strong> {rainfallStats.rainfallCm}cm ({rainfallStats.rainfallMm}mm)</p>
                <p><strong>Flood Line:</strong> up to {rainfallStats.floodElevationThreshold}m elevation</p>
                <p><strong>Flooded Area:</strong> {rainfallStats.floodedAreaSqKm.toLocaleString()} km²</p>
                <p><strong>Severity:</strong> {rainfallStats.classification}</p>
              </div>
            )}
          </div>
        )}

        {/* FVI Stats Panel */}
        {view === 'vulnerability' && !isFISI && !rainfallMode && (
          <div className="control-group">
            {loading && (
              <div className="loading-state">
                <div className="spinner" />
                <span>Computing vulnerability index…</span>
              </div>
            )}
            {error && !loading && (
              <div className="error-state">
                <span className="error-icon">⚠</span><span>{error}</span>
              </div>
            )}
            {stats && !loading && !error && (
              <>
                <div className="stat-card">
                  <span className="stat-label">Mean FVI Score</span>
                  <span className="stat-value"><AnimatedNumber value={stats.meanFVI} /></span>
                  <span className="stat-sub">out of 5.0</span>
                </div>
                <div className="stat-card classification">
                  <span className="stat-label">Risk Classification</span>
                  <span className="class-badge" style={{ background: classColor(stats.classification) }}>
                    {stats.classification ?? '—'}
                  </span>
                </div>
                <div className="meta-grid">
                  <div className="meta-item"><span className="meta-label">Elevation</span><span className="meta-value">SRTM 30m</span></div>
                  <div className="meta-item"><span className="meta-label">LULC</span><span className="meta-value">ESA WorldCover</span></div>
                  <div className="meta-item"><span className="meta-label">Population</span><span className="meta-value">WorldPop 2020</span></div>
                  <div className="meta-item"><span className="meta-label">Distance From Water Bodies</span><span className="meta-value">JRC GSW</span></div>
                  <div className="meta-item"><span className="meta-label">Permanent Water Bodies</span><span className="meta-value">ESA WorldCover</span></div>
                  <div className="meta-item"><span className="meta-label">Slope</span><span className="meta-value">SRTM 30m</span></div>
                </div>
              </>
            )}
          </div>
        )}

        {/* FISI Information Panel */}
        {view === 'vulnerability' && isFISI && (
          <FISIPanel
            loading={fisiLoading} error={fisiError}
            stats={fisiStats} parameters={fisiMeta.parameters}
          />
        )}
      </aside>

      <main className="map-wrapper">
        <MapContainer
          center={[CHENNAI_CENTER.lat, CHENNAI_CENTER.lng]}
          zoom={CHENNAI_CENTER.zoom}
          className={`leaflet-map ${inspectMode ? 'inspect-cursor' : ''}`}
          zoomControl={true}
        >
          {!swipeMode && (
            <TileLayer
              url={basemap === 'satellite'
                ? 'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}'
                : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'}
              attribution="© Google Maps" maxZoom={20}
            />
          )}

          {view === 'vulnerability' && !swipeMode && !rainfallMode && activeTileUrl && (
            <GEETileLayer key={mode} tileUrl={activeTileUrl} opacity={opacity} />
          )}

          {view === 'vulnerability' && isFISI && popEnabled && popTileUrl && (
            <GEETileLayer tileUrl={popTileUrl} opacity={popOpacity} skipFlyTo />
          )}

          {view === 'vulnerability' && !isFISI && rainfallMode && rainfallTileUrl && (
            <GEETileLayer tileUrl={rainfallTileUrl} opacity={0.85} />
          )}

          {view === 'vulnerability' && swipeMode && !rainfallMode && activeTileUrl && (
            <SwipeTileLayer key={mode} tileUrl={activeTileUrl} basemap={basemap} opacity={opacity} />
          )}

          {view === 'vulnerability' && (
            <ClickInspector enabled={inspectMode} endpoint={inspectEndpoint} />
          )}

          {view === 'current' && replayEvent === 'live' && showRainLayer && curPrecipTileUrl && (
            <GEETileLayer key="precip" tileUrl={curPrecipTileUrl} opacity={0.75} skipFlyTo />
          )}

          {view === 'current' && curClassifiedTileUrl && (
            <GEETileLayer key="risk-classified" tileUrl={curClassifiedTileUrl} opacity={opacity} skipFlyTo />
          )}

          {view === 'current' && (
            <HistoricalFloodPointsLayer visible={replayEvent === 'dec2015'} />
          )}
        </MapContainer>

        {/* Regional breakdown — FVI mode only */}
        {view === 'vulnerability' && !isFISI && (
          <div className="regional-summary-floating">
            <RegionalBreakdown district="chennai" />
          </div>
        )}

        {/* FVI / FISI segmented switch */}
        {view === 'vulnerability' && (
          <div className="analysis-mode-toggle">
            <button className={!isFISI ? 'active' : ''} onClick={() => handleModeChange('fvi')}>FVI</button>
            <button className={isFISI ? 'active' : ''} onClick={() => handleModeChange('fisi')}>FISI</button>
          </div>
        )}

        {/* Map controls — top right */}
        {!rainfallMode && (
          <div className="map-controls-topright">
            <div className="basemap-toggle">
              <button className={basemap === 'satellite' ? 'active' : ''} onClick={() => setBasemap('satellite')}>Satellite</button>
              <button className={basemap === 'map' ? 'active' : ''} onClick={() => setBasemap('map')}>Map</button>
            </div>
            <div className="opacity-card">
              <label>Layer Opacity — {Math.round(opacity * 100)}%</label>
              <input type="range" min="0" max="1" step="0.05" value={opacity} onChange={e => setOpacity(parseFloat(e.target.value))} />
            </div>
            {view === 'vulnerability' && (
              <div className="control-buttons-group">
                <button
                  className={`control-btn-small ${swipeMode ? 'active' : ''}`}
                  onClick={() => { setSwipeMode(s => !s); if (!swipeMode) handleClearRainfall(); }}
                  title={`Compare Mode: Swipe left/right to compare satellite vs ${isFISI ? 'FISI' : 'FVI'}`}
                >📊 Compare</button>
                <button
                  className={`control-btn-small ${inspectMode ? 'active' : ''}`}
                  onClick={() => setInspectMode(s => !s)}
                  title={`Click to Inspect: Click map to sample ${isFISI ? 'FISI' : 'FVI'} at that point`}
                >📍 Inspect</button>
              </div>
            )}
          </div>
        )}

        <div className="map-label">
          {view === 'current'
            ? ((curInundationLoading || curAlertsLoading)
                ? 'Loading…'
                : (replayEvent !== 'live'
                    ? `Chennai — Replay: ${REPLAY_EVENTS[replayEvent].label} (${REPLAY_EVENTS[replayEvent].dateLabel})`
                    : (timeMode === 'future' ? 'Chennai — Predicted (+3h)' : 'Chennai — Current')))
            : (activeLoading ? 'Loading…' : 'Chennai District')}
        </div>

        <div className="legend-stack">
          {view === 'current' ? (
            <>
              {showRainLayer && curPrecipTileUrl && (
                <div className="legend">
                  <h3>Rain Intensity</h3>
                  <div className="rainfall-legend-gradiant">
                    <div className="rainfall-legend-bar precip-legend-bar"></div>
                    <div className="rainfall-legend-labels">
                      <span className="rainfall-label-left">Light</span>
                      <span className="rainfall-label-right">Heavy</span>
                    </div>
                  </div>
                </div>
              )}
              <div className="legend">
                <h3>Flood Risk Level</h3>
                {(curClassifiedLegend || ALERT_LEGEND.map((l, i) => ({ label: l.label, color: l.color }))).map(l => (
                  <div className="legend-row" key={l.label}>
                    <span className="legend-swatch" style={{ background: l.color }} />
                    <span className="legend-label">{l.label}</span>
                  </div>
                ))}
              </div>
              {replayEvent === 'dec2015' && (
                <div className="legend">
                  <h3>Ground Truth</h3>
                  <div className="legend-row">
                    <span className="legend-swatch" style={{ background: '#ff2d55', borderRadius: '50%' }} />
                    <span className="legend-label">Real reported flooding, Dec 2015</span>
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              {isFISI && popEnabled && <PopulationLegend />}

              {isFISI ? (
                <FISILegend />
              ) : rainfallMode ? (
                <div className="legend">
                  <h3>Water Depth</h3>
                  <div className="rainfall-legend-gradiant">
                    <div className="rainfall-legend-bar"></div>
                    <div className="rainfall-legend-labels">
                      <span className="rainfall-label-left">Light Water</span>
                      <span className="rainfall-label-right">Deep Water</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="legend">
                  <h3>Vulnerability Levels</h3>
                  {LEGEND.map(l => (
                    <div className="legend-row" key={l.label}>
                      <span className="legend-swatch" style={{ background: l.color }} />
                      <span className="legend-label">{l.label}</span>
                      <span className="legend-range">{l.range}</span>
                    </div>
                  ))}
                </div>
              )}

              {isFISI ? (
                <FISIWeights weights={fisiMeta.weights} />
              ) : (
                <div className="weights">
                  <h3>Parameter Weights</h3>
                  {[
                    { name: 'Elevation', w: 25 }, { name: 'Population', w: 20 },
                    { name: 'Water Body Dist.', w: 20 }, { name: 'Slope', w: 20 },
                    { name: 'LULC', w: 15 },
                  ].map(p => (
                    <div className="weight-row" key={p.name}>
                      <span className="weight-name">{p.name}</span>
                      <div className="weight-bar-bg"><div className="weight-bar-fill" style={{ width: `${p.w}%` }} /></div>
                      <span className="weight-pct">{p.w}%</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
