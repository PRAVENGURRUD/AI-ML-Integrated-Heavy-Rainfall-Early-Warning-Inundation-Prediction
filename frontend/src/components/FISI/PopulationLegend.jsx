import React from 'react';

// Sequential (single-hue) ramp — matches backend POP_VIS palette.
export const POP_LEGEND = [
  { color: '#F2E6FF', label: 'Very Low' },
  { color: '#D9B3FF', label: 'Low' },
  { color: '#B266FF', label: 'Moderate' },
  { color: '#7F00FF', label: 'High' },
  { color: '#4B0082', label: 'Very High' },
];

export default function PopulationLegend() {
  return (
    <div className="legend population-legend">
      <h3>Population Density</h3>
      {POP_LEGEND.map((l) => (
        <div className="legend-row" key={l.label}>
          <span className="legend-swatch" style={{ background: l.color }} />
          <span className="legend-label">{l.label}</span>
        </div>
      ))}
    </div>
  );
}
