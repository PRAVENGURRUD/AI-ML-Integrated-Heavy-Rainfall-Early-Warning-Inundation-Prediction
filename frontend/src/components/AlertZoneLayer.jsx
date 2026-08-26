// AlertZoneLayer.jsx — draws the /api/alerts zone results on the map as
// colored circle markers (one per grid zone), so the "Early Warning" part
// of PS71 is actually visible, not just numbers in a sidebar. alerts.js
// only gives each zone's center point (no exact rectangle), so a marker
// sized/colored by alert level is the honest, simple way to show it.

import React, { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';

const ALERT_COLORS = {
  NORMAL: '#267300',
  ADVISORY: '#A3FF00',
  WATCH: '#FFAA00',
  WARNING: '#FF6B00',
  'SEVERE WARNING': '#E60000',
  EMERGENCY: '#730000',
};

export default function AlertZoneLayer({ zones }) {
  const map = useMap();
  const layerGroupRef = useRef(null);

  useEffect(() => {
    const L = require('leaflet');

    if (layerGroupRef.current) {
      map.removeLayer(layerGroupRef.current);
      layerGroupRef.current = null;
    }
    if (!zones || zones.length === 0) return;

    const group = L.layerGroup();
    zones.forEach((zone) => {
      const color = ALERT_COLORS[zone.alertLevel] || '#888';
      const marker = L.circleMarker([zone.centerLat, zone.centerLon], {
        radius: 16,
        color: '#08202f',
        weight: 2,
        fillColor: color,
        fillOpacity: 0.78,
      });
      const p85 = zone.p85DepthM != null ? zone.p85DepthM.toFixed(2) : '—';
      marker.bindPopup(
        `<strong>Zone ${zone.zoneId}</strong><br/>` +
        `Alert: <strong>${zone.alertLevel}</strong> (based on 85th percentile depth: ${p85}m)<br/>` +
        `Worst spot: ${zone.maxDepthM.toFixed(2)}m &middot; zone avg: ${zone.meanDepthM.toFixed(2)}m<br/>` +
        `${zone.percentFlooded.toFixed(1)}% of zone flooded`
      );
      marker.addTo(group);
    });
    group.addTo(map);
    layerGroupRef.current = group;

    return () => {
      if (layerGroupRef.current) {
        map.removeLayer(layerGroupRef.current);
        layerGroupRef.current = null;
      }
    };
  }, [zones, map]);

  return null;
}
