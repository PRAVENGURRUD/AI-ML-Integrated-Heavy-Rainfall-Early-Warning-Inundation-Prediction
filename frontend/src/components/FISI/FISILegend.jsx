import React from 'react';

// Exact colors from the FISI raster (backend FISI_VIS palette) — not
// reused from the FVI legend, since FISI's class breaks are computed
// independently (data-driven quantiles) and can differ from FVI's.
export const FISI_LEGEND = [
  { color: '#006400', label: 'Very Low' },
  { color: '#00FF00', label: 'Low' },
  { color: '#FFFF00', label: 'Moderate' },
  { color: '#FFA500', label: 'High' },
  { color: '#FF0000', label: 'Very High' },
];

export default function FISILegend() {
  return (
    <div className="legend">
      <h3>Flood Inundation Susceptibility</h3>
      {FISI_LEGEND.map((l) => (
        <div className="legend-row" key={l.label}>
          <span className="legend-swatch" style={{ background: l.color }} />
          <span className="legend-label">{l.label}</span>
        </div>
      ))}
    </div>
  );
}
