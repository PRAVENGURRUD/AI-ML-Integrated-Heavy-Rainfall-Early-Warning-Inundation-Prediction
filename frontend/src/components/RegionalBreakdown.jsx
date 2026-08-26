import React, { useMemo } from 'react';
import { VULNERABLE_REGIONS, RISK_COLORS, RISK_EMOJIS } from '../data/vulnerable_regions';

/**
 * Displays manually curated vulnerable regions for a district.
 * Shows as floating card at bottom-center of map.
 * Data is static and based on visual inspection of the FVI map.
 */
export default function RegionalBreakdown({ district, className = '' }) {
  const regions = useMemo(() => {
    if (!district || district === 'all' || !VULNERABLE_REGIONS[district]) {
      return [];
    }
    return VULNERABLE_REGIONS[district];
  }, [district]);

  if (!regions || regions.length === 0) return null;

  return (
    <div className={`regional-breakdown ${className}`}>
      <h3>Vulnerable Regions</h3>
      <div className="regional-items-row">
        {regions.map((region, i) => (
          <div key={i} className="regional-item-compact">
            <div className="regional-compact-header">
              <span className="regional-emoji">{RISK_EMOJIS[region.risk] || '⚪'}</span>
              <span className="regional-name-compact">{region.region}</span>
            </div>
            <div className="regional-compact-stat">
              <span className="regional-compact-value" style={{ color: RISK_COLORS[region.risk] }}>
                {region.risk}
              </span>
            </div>
            {region.note && (
              <div className="regional-note">{region.note}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}