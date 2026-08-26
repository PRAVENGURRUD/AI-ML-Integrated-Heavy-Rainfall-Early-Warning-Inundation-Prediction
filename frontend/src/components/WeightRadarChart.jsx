import React, { useEffect, useState } from 'react';

const PARAMS = [
  { name: 'Elevation', w: 25 },
  { name: 'Population', w: 20 },
  { name: 'Coast Dist.', w: 20 },
  { name: 'Slope', w: 20 },
  { name: 'LULC', w: 15 },
];

const SIZE = 200;
const CENTER = SIZE / 2;
const RADIUS = 68;
const MAX_W = 30; // axis ceiling — params top out at 25, this leaves a little padding

const COLOR_GRID = '#1a4060';
const COLOR_ACCENT = '#00b4d8';
const COLOR_FILL = 'rgba(0,180,216,0.22)';
const COLOR_LABEL = '#7aaec4';

function pointFor(index, total, value, maxValue, radius, center) {
  const angle = (Math.PI * 2 * index) / total - Math.PI / 2;
  const r = (value / maxValue) * radius;
  return [center + r * Math.cos(angle), center + r * Math.sin(angle)];
}

/**
 * Spider/radar chart of the 5 CFVI parameter weights.
 * Draws in (scales up from center) on mount.
 */
export default function WeightRadarChart() {
  const [progress, setProgress] = useState(0);
  const total = PARAMS.length;

  useEffect(() => {
    let raf;
    const duration = 750;
    const start = performance.now();
    function step(now) {
      const t = Math.min((now - start) / duration, 1);
      setProgress(1 - Math.pow(1 - t, 3)); // ease-out cubic
      if (t < 1) raf = requestAnimationFrame(step);
    }
    raf = requestAnimationFrame(step);
    return () => raf && cancelAnimationFrame(raf);
  }, []);

  const dataPoints = PARAMS.map((p, i) =>
    pointFor(i, total, p.w * progress, MAX_W, RADIUS, CENTER)
  );
  const dataPath = dataPoints.map((p) => p.join(',')).join(' ');
  const gridLevels = [0.25, 0.5, 0.75, 1];

  return (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width="100%" height="190" role="img" aria-label="Parameter weight radar chart">
      {gridLevels.map((level, gi) => {
        const ringPoints = PARAMS.map((_, i) =>
          pointFor(i, total, MAX_W * level, MAX_W, RADIUS, CENTER).join(',')
        ).join(' ');
        return (
          <polygon key={gi} points={ringPoints} fill="none" stroke={COLOR_GRID} strokeWidth="1" />
        );
      })}

      {PARAMS.map((p, i) => {
        const [x, y] = pointFor(i, total, MAX_W, MAX_W, RADIUS, CENTER);
        return (
          <line key={p.name} x1={CENTER} y1={CENTER} x2={x} y2={y} stroke={COLOR_GRID} strokeWidth="1" />
        );
      })}

      <polygon points={dataPath} fill={COLOR_FILL} stroke={COLOR_ACCENT} strokeWidth="2" />

      {dataPoints.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="3" fill={COLOR_ACCENT} />
      ))}

      {PARAMS.map((p, i) => {
        const [x, y] = pointFor(i, total, MAX_W * 1.32, MAX_W, RADIUS, CENTER);
        return (
          <text key={p.name} x={x} y={y} fontSize="9" fill={COLOR_LABEL} textAnchor="middle" dominantBaseline="middle">
            {p.name}
          </text>
        );
      })}
    </svg>
  );
}
