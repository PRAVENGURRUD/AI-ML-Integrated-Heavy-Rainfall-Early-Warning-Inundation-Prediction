import React from 'react';

/**
 * Population Density overlay toggle. Independent from the FISI raster —
 * this only controls whether the separate WorldPop layer is shown, and
 * its opacity. The FISI raster itself is unaffected either way.
 */
export default function PopulationToggle({ enabled, onToggle, opacity, onOpacityChange, loading, error }) {
  return (
    <div className="control-group pop-toggle-group">
      <label className="pop-toggle-row" htmlFor="pop-toggle">
        <span>Population Density Overlay</span>
        <input
          id="pop-toggle"
          type="checkbox"
          checked={enabled}
          onChange={(e) => onToggle(e.target.checked)}
        />
      </label>
      {enabled && (
        <>
          <div className="opacity-card pop-opacity-mini">
            <label>Population Opacity — {Math.round(opacity * 100)}%</label>
            <input
              type="range" min="0" max="1" step="0.05"
              value={opacity}
              onChange={(e) => onOpacityChange(parseFloat(e.target.value))}
            />
          </div>
          {loading && <p className="swipe-hint">Loading population layer…</p>}
          {error && <p className="swipe-hint">⚠ {error}</p>}
        </>
      )}
    </div>
  );
}
