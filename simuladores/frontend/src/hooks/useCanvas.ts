import { useCallback, useEffect, useRef, useState } from 'react';

export interface CanvasSize {
  width: number;
  height: number;
  dpr: number;
}

/**
 * Keeps a <canvas> sized to its CSS box at the device pixel ratio. Drawing
 * code works in CSS pixels: `getContext()` returns a context already scaled.
 * The canvas' CSS size is decided by its container (e.g. aspect-ratio).
 */
export function useCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState<CanvasSize>({ width: 0, height: 0, dpr: 1 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const update = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      const width = Math.max(1, Math.round(rect.width));
      const height = Math.max(1, Math.round(rect.height));
      if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
      }
      setSize((prev) =>
        prev.width === width && prev.height === height && prev.dpr === dpr ? prev : { width, height, dpr },
      );
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(canvas);
    window.addEventListener('resize', update);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', update);
    };
  }, []);

  const getContext = useCallback((): CanvasRenderingContext2D | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const dpr = canvas.width / Math.max(1, canvas.getBoundingClientRect().width);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return ctx;
  }, []);

  return { canvasRef, size, getContext };
}
