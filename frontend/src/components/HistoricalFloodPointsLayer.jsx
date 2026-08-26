// HistoricalFloodPointsLayer.jsx -- draws REAL, documented flooding
// locations from the actual Dec 2015 Chennai floods on the map, as small
// markers distinct from the model's own zone-alert circles. This is
// genuine ground-truth data (see ../data/chennai2015FloodPoints.js for
// the source), shown so anyone can visually check whether the model's
// predicted flood zones actually line up with where flooding really was
// reported -- not used to silently adjust the model's own numbers.

import React, { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import { CHENNAI_2015_FLOOD_POINTS } from '../data/chennai2015FloodPoints';

export default function HistoricalFloodPointsLayer({ visible }) {
  const map = useMap();
  const layerGroupRef = useRef(null);

  useEffect(() => {
    const L = require('leaflet');

    if (layerGroupRef.current) {
      map.removeLayer(layerGroupRef.current);
      layerGroupRef.current = null;
    }
    if (!visible) return;

    const group = L.layerGroup();
    CHENNAI_2015_FLOOD_POINTS.forEach((pt) => {
      const marker = L.circleMarker([pt.lat, pt.lon], {
        radius: 4,
        color: '#ffffff',
        weight: 1,
        fillColor: '#ff2d55',
        fillOpacity: 0.9,
      });
      marker.bindPopup(
        `<strong>${pt.name}</strong><br/>` +
        `Real reported flooding, Dec 2015<br/>` +
        `Zone ${pt.zone}, Division ${pt.division}<br/>` +
        `<span style="font-size:11px;color:#666">Source: OpenCity Chennai Flooding Data</span>`
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
  }, [visible, map]);

  return null;
}
