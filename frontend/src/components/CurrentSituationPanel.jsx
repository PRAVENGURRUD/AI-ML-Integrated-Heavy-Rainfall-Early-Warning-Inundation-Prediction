// CurrentSituationPanel.jsx — sidebar content for the new "Current
// Situation" front page (the real-time, weather-driven view). Combines:
//  - LiveConditions: live rainfall + the AI (ConvLSTM) nowcast
//  - a Now / Next 3 Hours toggle (App.jsx swaps which rainfall figure
//    drives the real flood-depth model based on this)
//  - the real inundation model's stats (SCS-CN + flow accumulation)
//  - the zone-level early-warning alert summary
//
// The map itself (flood depth layer + colored zone markers) is rendered
// separately by App.jsx/AlertZoneLayer, since it has to live inside the
// shared <MapContainer>.

import React from 'react';
import LiveConditions from './LiveConditions';

const ALERT_COLORS = {
  NORMAL: '#267300',
  ADVISORY: '#A3FF00',
  WATCH: '#FFAA00',
  WARNING: '#FF6B00',
  'SEVERE WARNING': '#E60000',
  EMERGENCY: '#730000',
};

// inundation.js's classification labels -> the same alert-level naming
// alerts.js uses, just so the color badges agree with each other.
const CLASS_TO_ALERT = {
  Extreme: 'EMERGENCY',
  Severe: 'SEVERE WARNING',
  High: 'WARNING',
  Moderate: 'WATCH',
  Light: 'ADVISORY',
  Minimal: 'NORMAL',
};

export default function CurrentSituationPanel({
  apiUrl,
  timeMode,
  onTimeModeChange,
  inundationLoading,
  inundationError,
  inundationStats,
  alertsLoading,
  alertsError,
  alertsSummary,
  rainLayerOn,
  onRainLayerToggle,
  precipLoading,
  precipError,
  precipAsOf,
  precipMaxMmHr,
}) {
  return (
    <>
      <LiveConditions apiUrl={apiUrl} />

      <div className="control-group">
        <div className="rain-layer-row">
          <label style={{ marginBottom: 0 }}>
            Rain Radar (live satellite){precipLoading ? ' — loading…' : ''}
          </label>
          <button
            type="button"
            className={`rain-layer-toggle${rainLayerOn ? ' on' : ''}`}
            onClick={() => onRainLayerToggle(!rainLayerOn)}
            aria-label="Toggle live rain layer"
            aria-pressed={rainLayerOn}
          />
        </div>
        {rainLayerOn && precipAsOf && !precipError && (
          <span className="rain-layer-asof">
            {precipMaxMmHr != null && precipMaxMmHr <= 0
              ? 'no significant rain detected nearby right now — '
              : ''}
            satellite rain data as of {new Date(precipAsOf).toLocaleString()}
          </span>
        )}
        {rainLayerOn && precipError && (
          <span className="rain-layer-asof">rain layer unavailable: {precipError}</span>
        )}
      </div>

      <div className="control-group">
        <label>Flood Map Shows</label>
        <div className="time-mode-toggle">
          <button
            className={timeMode === 'now' ? 'active' : ''}
            onClick={() => onTimeModeChange('now')}
          >
            Now
          </button>
          <button
            className={timeMode === 'future' ? 'active' : ''}
            onClick={() => onTimeModeChange('future')}
          >
            Next 3 Hours (AI)
          </button>
        </div>
        {timeMode === 'future' && (
          <p className="swipe-hint">
            Showing what the flood map would look like if the AI nowcast's
            predicted rainfall falls — not a live measurement.
          </p>
        )}
      </div>

      <div className="control-group">
        {inundationLoading && (
          <div className="loading-state">
            <div className="spinner" />
            <span>Computing flood depth…</span>
          </div>
        )}
        {inundationError && !inundationLoading && (
          <div className="error-state">
            <span className="error-icon">⚠</span><span>{inundationError}</span>
          </div>
        )}
        {inundationStats && !inundationLoading && !inundationError && (
          <>
            <div className="stat-card">
              <span className="stat-label">
                {timeMode === 'now' ? 'Current Flood Depth' : 'Predicted Flood Depth (+3h)'}
              </span>
              <span className="stat-value">
                {inundationStats.maxDepthM}<span className="stat-unit"> m max</span>
              </span>
              <span
                className="class-badge"
                style={{ background: ALERT_COLORS[CLASS_TO_ALERT[inundationStats.classification]] || '#888' }}
              >
                {inundationStats.classification}
              </span>
            </div>
            <div className="meta-grid">
              <div className="meta-item">
                <span className="meta-label">Flooded Area</span>
                <span className="meta-value">{inundationStats.floodedAreaKm2} km²</span>
              </div>
              <div className="meta-item">
                <span className="meta-label">% of City</span>
                <span className="meta-value">{inundationStats.percentOfCityFlooded}%</span>
              </div>
            </div>
          </>
        )}
      </div>

      <div className="control-group">
        {alertsLoading && (
          <div className="loading-state">
            <div className="spinner" />
            <span>Checking zone alerts…</span>
          </div>
        )}
        {alertsError && !alertsLoading && (
          <div className="error-state">
            <span className="error-icon">⚠</span><span>{alertsError}</span>
          </div>
        )}
        {alertsSummary && !alertsLoading && !alertsError && (
          <div className="stat-card">
            <span className="stat-label">Zone Alerts</span>
            <span className="stat-value">
              {alertsSummary.zonesAtWarningOrAbove}
              <span className="stat-unit"> / {alertsSummary.totalZones} zones</span>
            </span>
            <span
              className="class-badge"
              style={{ background: ALERT_COLORS[alertsSummary.highestAlertLevel] || '#888' }}
            >
              Worst: {alertsSummary.highestAlertLevel}
            </span>
          </div>
        )}
      </div>
    </>
  );
}
