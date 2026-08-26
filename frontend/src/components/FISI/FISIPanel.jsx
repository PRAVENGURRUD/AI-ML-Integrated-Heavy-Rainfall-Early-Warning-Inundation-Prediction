import React from 'react';
import AnimatedNumber from '../AnimatedNumber';

const CLASS_COLORS = {
  'Very Low': '#006400',
  'Low': '#00FF00',
  'Moderate': '#FFFF00',
  'High': '#FFA500',
  'Very High': '#FF0000',
};

/**
 * Left information panel content for FISI mode. Mirrors the FVI stats
 * panel's layout/markup so the two modes look like the same product,
 * but shows FISI-specific fields only (no Vulnerable Region Breakdown —
 * that stays FVI-only per spec).
 */
export default function FISIPanel({ loading, error, stats, parameters }) {
  return (
    <div className="control-group">
      {loading && (
        <div className="loading-state">
          <div className="spinner" />
          <span>Computing susceptibility index…</span>
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
            <span className="stat-label">Mean FISI Score</span>
            <span className="stat-value"><AnimatedNumber value={stats.meanFISI} /></span>
            <span className="stat-sub">out of 5.0</span>
          </div>
          <div className="stat-card classification">
            <span className="stat-label">Flood Inundation Susceptibility</span>
            <span
              className="class-badge"
              style={{ background: CLASS_COLORS[stats.classification] || '#888' }}
            >
              {stats.classification ?? '—'}
            </span>
          </div>
          <div className="meta-grid">
            <div className="meta-item">
              <span className="meta-label">Total Inundation Area</span>
              <span className="meta-value">
                {stats.totalInundationAreaKm2 != null ? `${stats.totalInundationAreaKm2.toLocaleString()} km²` : '—'}
              </span>
            </div>
            <div className="meta-item">
              <span className="meta-label">% of District Affected</span>
              <span className="meta-value">
                {stats.percentAffected != null ? `${stats.percentAffected}%` : '—'}
              </span>
            </div>
          </div>
          {parameters && parameters.length > 0 && (
            <div className="fisi-params">
              <span className="meta-label">Parameters Used</span>
              <ul className="fisi-params-list">
                {parameters.map((p) => (
                  <li key={p.name}>
                    <span className="fisi-param-name">{p.name}</span>
                    <span className="fisi-param-source">{p.source}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}