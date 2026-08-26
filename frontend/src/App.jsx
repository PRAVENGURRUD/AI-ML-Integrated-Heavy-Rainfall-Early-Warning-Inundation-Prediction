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

        {/* Population Density overlay — FISI mode only */}
        {isFISI && (
          <PopulationToggle
            enabled={popEnabled} onToggle={setPopEnabled}
            opacity={popOpacity} onOpacityChange={setPopOpacity}
            loading={popLoading} error={popError}
          />
        )}

        {/* Rainfall Simulation — FVI mode only */}
        {!isFISI && (
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
        {!isFISI && !rainfallMode && (
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
        {isFISI && (
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

          {!swipeMode && !rainfallMode && activeTileUrl && (
            <GEETileLayer key={mode} tileUrl={activeTileUrl} opacity={opacity} />
          )}

          {isFISI && popEnabled && popTileUrl && (
            <GEETileLayer tileUrl={popTileUrl} opacity={popOpacity} skipFlyTo />
          )}

          {!isFISI && rainfallMode && rainfallTileUrl && (
            <GEETileLayer tileUrl={rainfallTileUrl} opacity={0.85} />
          )}

          {swipeMode && !rainfallMode && activeTileUrl && (
            <SwipeTileLayer key={mode} tileUrl={activeTileUrl} basemap={basemap} opacity={opacity} />
          )}

          <ClickInspector enabled={inspectMode} endpoint={inspectEndpoint} />
        </MapContainer>

        {/* Regional breakdown — FVI mode only */}
        {!isFISI && (
          <div className="regional-summary-floating">
            <RegionalBreakdown district="chennai" />
          </div>
        )}

        {/* FVI / FISI segmented switch */}
        <div className="analysis-mode-toggle">
          <button className={!isFISI ? 'active' : ''} onClick={() => handleModeChange('fvi')}>FVI</button>
          <button className={isFISI ? 'active' : ''} onClick={() => handleModeChange('fisi')}>FISI</button>
        </div>

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
          </div>
        )}

        <div className="map-label">
          {activeLoading ? 'Loading…' : 'Chennai District'}
        </div>

        <div className="legend-stack">
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
        </div>
      </main>
    </div>
  );
}
