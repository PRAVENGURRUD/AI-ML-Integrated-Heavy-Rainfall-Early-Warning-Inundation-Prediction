import React, { useEffect, useRef, useState } from 'react';

/**
 * Animates a number counting up from its previous value to a new one.
 * Used for the Mean CFVI stat so it doesn't just "pop" into place.
 */
export default function AnimatedNumber({ value, duration = 800, decimals = 3 }) {
  const [display, setDisplay] = useState(0);
  const rafRef = useRef(null);
  const fromRef = useRef(0);

  useEffect(() => {
    if (value === null || value === undefined) return;
    const from = fromRef.current;
    const to = value;
    const start = performance.now();

    function step(now) {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      setDisplay(from + (to - from) * eased);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        fromRef.current = to;
      }
    }

    rafRef.current = requestAnimationFrame(step);
    return () => rafRef.current && cancelAnimationFrame(rafRef.current);
  }, [value, duration]);

  if (value === null || value === undefined) return <>—</>;
  return <>{display.toFixed(decimals)}</>;
}
