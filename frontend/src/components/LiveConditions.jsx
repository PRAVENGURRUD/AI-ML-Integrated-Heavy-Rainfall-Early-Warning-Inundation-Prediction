// LiveConditions.jsx — always-visible sidebar panel showing the two "live
// data" pieces (rainfall.js + nowcast.js) that had no UI before: the
// current 3-day/24h rainfall + HIGH/LOW risk flag, and the ConvLSTM's
// next-3-hours rainfall nowcast. Shown regardless of FVI/FISI mode, since
// it's not tied to either — it's the "what's actually happening right now"
// strip.

import React, { useState, useEffect } from 'react';
import { updateNowcastAccuracy, getAccuracyStats } from '../nowcastAccuracy';

function riskColor(level) {
  return level === 'HIGH' ? '#E60000' : '#267300';
}

export default function LiveConditions({ apiUrl, hideRainfallStat }) {
  const [rainfall, setRainfall] = useState(null);
  const [rainfallError, setRainfallError] = useState(null);
  const [nowcast, setNowcast] = useState(null);
  const [nowcastError, setNowcastError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [accuracy, setAccuracy] = useState({ count: 0, maeMm: null, mostRecent: null });

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
        if (res.ok) {
          setNowcast(data);
          const updated = updateNowcastAccuracy(data);
          setAccuracy(getAccuracyStats(updated));
        } else {
          setNowcastError(data.error || 'Nowcast fetch failed');
        }
      } catch (err) {
        if (!cancelled) setNowcastError(err.message);
      }
    }

    async function loadAll() {
      setLoading(true);
      const tasks = hideRainfallStat ? [loadNowcast()] : [loadRainfall(), loadNowcast()];
      await Promise.all(tasks);
      if (!cancelled) setLoading(false);
    }

    loadAll();
    // Live satellite/forecast data doesn't change second to second — a
    // 5-minute refresh keeps this current without hammering the backend.
    const interval = setInterval(loadAll, 5 * 60 * 1000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [apiUrl, hideRainfallStat]);

  return (
    <div className="control-group live-conditions">
      <label>Live Conditions — Chennai</label>

      {loading && !nowcast && (hideRainfallStat || !rainfall) && (
        <div className="loading-state"><div className="spinner" /><span>Loading live data…</span></div>
      )}

      {!hideRainfallStat && rainfallError && (
        <div className="error-state"><span className="error-icon">⚠</span><span>Rainfall: {rainfallError}</span></div>
      )}

      {!hideRainfallStat && rainfall && (
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
          <p className="nowcast-subtitle">
            How much rain the AI expects for each of the next 3 hours, based on the last 6 hours of real
            satellite rain data.
          </p>

          <div className="nowcast-bars">
            {nowcast.summary.map((h) => (
              <div className="nowcast-bar-col" key={h.hoursFromNow}>
                <div className="nowcast-bar-track">
                  <div
                    className="nowcast-bar-fill"
                    style={{ height: `${Math.max(4, Math.min(100, h.avgMm * 40))}%` }}
                  />
                </div>
                <span className="nowcast-bar-value">{h.avgMm.toFixed(2)}<span className="nowcast-bar-unit"> mm</span></span>
                <span className="nowcast-bar-label">+{h.hoursFromNow}h</span>
              </div>
            ))}
          </div>
          {nowcast.mode === 'live' && nowcast.summary.every((h) => h.avgMm < 0.5) && (
            <span className="nowcast-asof">
              These are small numbers because little to no rain is expected right now — that's expected, not
              an error.
            </span>
          )}
          {nowcast.mode === 'live' && nowcast.asOf && (
            <span className="nowcast-asof">satellite data as of {new Date(nowcast.asOf).toLocaleString()}</span>
          )}
          {nowcast.liveAttemptFailed && (
            <span className="nowcast-asof">live pull failed — showing a real recorded storm example instead</span>
          )}

          <AccuracyBadge nowcast={nowcast} accuracy={accuracy} />
        </div>
      )}
    </div>
  );
}

// Compact, single-line "was the AI right?" indicator — replaces the old
// multi-paragraph breakdown. Covers three real situations without ever
// inventing a number: real accumulated live accuracy once enough hours
// have passed, nothing-yet while that's still pending, and the rare case
// where a live pull failed and the server fell back to the recorded
// replay example (still real data, just not live -- see nowcast.js).
function AccuracyBadge({ nowcast, accuracy }) {
  if (nowcast.mode === 'replay' && nowcast.actualSummary) {
    const predictedAvg = nowcast.summary.reduce((s, h) => s + h.avgMm, 0) / nowcast.summary.length;
    const actualAvg = nowcast.actualSummary.reduce((s, h) => s + h.avgMm, 0) / nowcast.actualSummary.length;
    const errorRatio = actualAvg > 0 ? Math.abs(predictedAvg - actualAvg) / actualAvg : 0;
    const dot = errorRatio < 0.3 ? 'good' : errorRatio < 0.7 ? 'ok' : 'bad';
    return (
      <div className="accuracy-badge">
        <span className={`accuracy-dot accuracy-dot-${dot}`} />
        <span>
          Live pull failed, showing a real recorded example instead — predicted {predictedAvg.toFixed(2)}mm,
          actually {actualAvg.toFixed(2)}mm
        </span>
      </div>
    );
  }

  if (accuracy.count > 0) {
    const dot = accuracy.maeMm < 1 ? 'good' : accuracy.maeMm < 3 ? 'ok' : 'bad';
    return (
      <div className="accuracy-badge">
        <span className={`accuracy-dot accuracy-dot-${dot}`} />
        <span>
          Accuracy check — {accuracy.count} prediction{accuracy.count === 1 ? '' : 's'} checked, avg error{' '}
          {accuracy.maeMm.toFixed(2)}mm/hr
        </span>
      </div>
    );
  }

  return (
    <div className="accuracy-badge">
      <span className="accuracy-dot accuracy-dot-pending" />
      <span>Accuracy check — not enough time has passed yet, check back in a few hours</span>
    </div>
  );
}
