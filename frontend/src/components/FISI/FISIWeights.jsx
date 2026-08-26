import React from 'react';

/**
 * Right-panel parameter weights for FISI. Weights are passed in from
 * backend config (/api/fisi/meta) rather than hardcoded, per spec.
 */
export default function FISIWeights({ weights }) {
  const list = weights && weights.length > 0 ? weights : [];
  return (
    <div className="weights">
      <h3>FISI Parameter Weights</h3>
      {list.map((p) => (
        <div className="weight-row" key={p.name}>
          <span className="weight-name">{p.name}</span>
          <div className="weight-bar-bg">
            <div className="weight-bar-fill" style={{ width: `${p.w}%` }} />
          </div>
          <span className="weight-pct">{p.w}%</span>
        </div>
      ))}
    </div>
  );
}
