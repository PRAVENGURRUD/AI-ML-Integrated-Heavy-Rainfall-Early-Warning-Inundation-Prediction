import React, { useState } from 'react';
import { useMapEvents, Popup } from 'react-leaflet';

// Chennai bounding box for fast client-side pre-check before hitting GEE
const CHENNAI_BOUNDS = { minLat: 12.75, maxLat: 13.35, minLng: 79.95, maxLng: 80.35 };

function isInsideChennaiBounds(lat, lng) {
  return lat >= CHENNAI_BOUNDS.minLat && lat <= CHENNAI_BOUNDS.maxLat &&
         lng >= CHENNAI_BOUNDS.minLng && lng <= CHENNAI_BOUNDS.maxLng;
}

/**
 * Click-to-inspect — samples FVI or FISI at the clicked point.
 * Clicks outside the Chennai bounding box are rejected client-side
 * before any network request. The backend performs an exact polygon check.
 */
export default function ClickInspector({ enabled, endpoint = '/api/inspect' }) {
  const [popupPos, setPopupPos] = useState(null);
  const [data, setData]         = useState(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const [outsideBounds, setOutsideBounds] = useState(false);

  useMapEvents({
    click(e) {
      if (!enabled) return;
      const { lat, lng } = e.latlng;
      setPopupPos([lat, lng]);
      setData(null);
      setError(null);
      setOutsideBounds(false);

      // Fast client-side bbox check — avoids GEE call for obvious misses
      if (!isInsideChennaiBounds(lat, lng)) {
        setOutsideBounds(true);
        return;
      }

      setLoading(true);
      fetch(`${endpoint}?lat=${lat}&lng=${lng}`)
        .then((res) => { if (!res.ok) throw new Error('Sample failed'); return res.json(); })
        .then((result) => {
          setData(result);
          setLoading(false);
        })
        .catch(() => { setError('Could not sample this point.'); setLoading(false); });
    },
  });

  if (!popupPos) return null;

  const isFISI    = data && Object.prototype.hasOwnProperty.call(data, 'fisi');
  const score     = isFISI ? data?.fisi : data?.fvi;
  const scoreLabel = isFISI ? 'FISI' : 'FVI';
  const distance  = isFISI ? data?.distance_to_water_m : data?.coast_distance_m;

  return (
    <Popup position={popupPos} eventHandlers={{ remove: () => setPopupPos(null) }}>
      <div className="inspect-popup">
        {outsideBounds && (
          <>
            <div className="inspect-title">Outside Study Area</div>
            <div className="inspect-row">Inspection is available only within Chennai district.</div>
          </>
        )}
        {!outsideBounds && loading && <span>Sampling pixel…</span>}
        {!outsideBounds && !loading && error && <span>{error}</span>}
        {!outsideBounds && !loading && data && !error && (
          data.outsideChennai ? (
            <>
              <div className="inspect-title">Outside Chennai</div>
              <div className="inspect-row">Inspection is available only within Chennai district.</div>
            </>
          ) : data.isWater ? (
            <>
              <div className="inspect-title">Water Body</div>
              <div className="inspect-row">No {scoreLabel} value — permanent water surface.</div>
            </>
          ) : score === null ? (
            <>
              <div className="inspect-title">No data</div>
              <div className="inspect-row">
                {isFISI ? 'No data at this point.' : 'Outside coastal zone (> 30m elevation).'}
              </div>
            </>
          ) : (
            <>
              <div className="inspect-title">{data.classification}</div>
              <div className="inspect-row"><strong>{scoreLabel}:</strong> {score}</div>
              <div className="inspect-row"><strong>Elevation:</strong> {data.elevation_m?.toFixed?.(1) ?? '—'} m</div>
              <div className="inspect-row"><strong>Slope:</strong> {data.slope_deg ?? '—'}°</div>
              <div className="inspect-row"><strong>Distance from Water Body:</strong> {distance ?? '—'} m</div>
            </>
          )
        )}
      </div>
    </Popup>
  );
}
