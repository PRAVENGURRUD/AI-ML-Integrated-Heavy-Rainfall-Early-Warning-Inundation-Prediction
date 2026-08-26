// LiveConditions.jsx — always-visible sidebar panel showing the two "live
// data" pieces (rainfall.js + nowcast.js) that had no UI before: the
// current 3-day/24h rainfall + HIGH/LOW risk flag, and the ConvLSTM's
// next-3-hours rainfall nowcast. Shown regardless of FVI/FISI mode, since
// it's not tied to either — it's the "what's actually happening right now"
// strip.

import React, { useState, useEffect } from 'react';

function riskColor(level) {
  return level === 'HIGH' ? '#E60000' : '#267300';
}

export default function LiveConditions({ apiUrl }) {
  const [rainfall, setRainfall] = useState(null);
  const [rainfallError, setRainfallError] = useState(null);
  const [nowcast, setNowcast] = useState(null);
  const [nowcastError, setNowcastError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadRainfall() {
      try {
        const res = await fetch(`${apiUrl}/api/rainfall`);
        const data = await res.json();
        if (cancelled) return;
        if (res.ok) setRainfall(data); else setRainfallError(data.error || 'Rainfall fetch failed');
      } catch (err) {
        if (!cancelled) setRainfallError(err.message);
      }
    }

    async function loadNowcast() {
      try {
        const res = await fetch(`${apiUrl}/api/nowcast`);
        const data = await res.json();
        if (cancelled) return;
        if (res.ok) setNowcast(data); else setNowcastError(data.error || 'Nowcast fetch failed');
      } catch (err) {
        if (!cancelled) setNowcastError(err.message);
      }
    }

    async function loadAll() {
      setLoading(true);
      await Promise.all([loadRainfall(), loadNowcast()]);
      if (!cancelled) setLoading(false);
    }

    loadAll();
    // Live satellite/forecast data doesn't change second to second — a
    // 5-minute refresh keeps this current without hammering the backend.
    const interval = setInterval(loadAll, 5 * 60 * 1000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [apiUrl]);

  return (
    <div className="control-group live-conditions">
      <label>Live Conditions — Chennai</label>

      {loading && !rainfall && !nowcast && (
        <div className="loading-state"><div className="spinner" /><span>Loading live data…</span></div>
      )}

      {rainfallError && (
        <div className="error-state"><span className="error-icon">⚠</span><span>Rainfall: {rainfallError}</span></div>
      )}

      {rainfall && (
        <div className="stat-card live-rainfall-card">
          <span className="stat-label">3-Day Rainfall</span>
          <span className="stat-value">{rainfall.past3DayTotalMm}<span className="stat-unit"> mm</span></span>
          <span className="class-badge" style={{ background: riskColor(rainfall.riskLevel) }}>
            {rainfall.riskLevel} RISK
          </span>
          <div className="live-rainfall-sub">
            <span>24h total: {rainfall.past24HourTotalMm}mm</span>
            <span>flood threshold: {rainfall.floodRiskThresholdMm}mm</span>
          </div>
        </div>
      )}

      {nowcastError && (
        <div className="error-state"><span className="error-icon">⚠</span><span>Nowcast: {nowcastError}</span></div>
      )}

      {nowcast && (
        <div className="nowcast-card">
          <div className="nowcast-header">
            <span className="stat-label">AI Rainfall Nowcast — Next 3h</span>
            <span className={`nowcast-mode-tag ${nowcast.mode === 'live' ? 'is-live' : 'is-replay'}`}>
              {nowcast.mode === 'live' ? 'LIVE' : 'DEMO REPLAY'}
            </span>
          </div>
          <div className="nowcast-bars">
            {nowcast.summary.map((h) => (
              <div className="nowcast-bar-col" key={h.hoursFromNow}>
                <div className="nowcast-bar-track">
                  <div
                    className="nowcast-bar-fill"
                    style={{ height: `${Math.max(4, Math.min(100, h.avgMm * 40))}%` }}
                  />
                </div>
                <span className="nowcast-bar-value">{h.avgMm.toFixed(2)}</span>
                <span className="nowcast-bar-label">+{h.hoursFromNow}h</span>
              </div>
            ))}
          </div>
          {nowcast.mode === 'live' && nowcast.asOf && (
            <span className="nowcast-asof">satellite data as of {new Date(nowcast.asOf).toLocaleString()}</span>
          )}
          {nowcast.liveAttemptFailed && (
            <span className="nowcast-asof">live pull failed — showing a real recorded storm example instead</span>
          )}
        </div>
      )}
    </div>
  );
}
