import { useEffect, useRef } from 'react';

/**
 * Runs `callback(dtSeconds)` on every animation frame while `active` is true.
 * The loop stops when the component unmounts, when `active` turns false and
 * while the tab is hidden (no work in background tabs, no huge dt on return).
 * dt is clamped so a long frame never makes a simulation jump.
 */
export function useAnimationFrame(callback: (dt: number) => void, active: boolean, maxDt = 0.1): void {
  const cbRef = useRef(callback);
  cbRef.current = callback;

  useEffect(() => {
    if (!active) return;
    let raf = 0;
    let last = 0;
    let running = true;

    const loop = (now: number) => {
      if (!running) return;
      const dt = last === 0 ? 0 : Math.min((now - last) / 1000, maxDt);
      last = now;
      if (dt > 0) cbRef.current(dt);
      raf = requestAnimationFrame(loop);
    };

    const start = () => {
      if (raf) return;
      last = 0;
      raf = requestAnimationFrame(loop);
    };
    const stop = () => {
      cancelAnimationFrame(raf);
      raf = 0;
    };
    const onVisibility = () => (document.hidden ? stop() : start());

    if (!document.hidden) start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      running = false;
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [active, maxDt]);
}
