import { useState } from 'react';
import { prefersReducedMotion } from '../hooks/usePrefersReducedMotion';

/** play/pause + speed state shared by every simulator. Starts paused with reduced motion. */
export function usePlayback(initialSpeed = 1) {
  const [playing, setPlaying] = useState(() => !prefersReducedMotion());
  const [speed, setSpeed] = useState(initialSpeed);
  return { playing, setPlaying, toggle: () => setPlaying((p) => !p), speed, setSpeed };
}

/** Distinct, theme-aware colour for the i-th category (golden-angle hue walk). */
export function categoricalColor(i: number, dark: boolean, alpha = 1): string {
  const hue = (265 + i * 137.508) % 360;
  return `hsla(${hue.toFixed(1)}, ${dark ? 70 : 68}%, ${dark ? 64 : 52}%, ${alpha})`;
}

/** Round-rect path helper for canvases (ctx.roundRect is not everywhere yet). */
export function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** Draw an arrow from (x1,y1) to (x2,y2) with a small head. */
export function arrow(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, head = 6): void {
  const a = Math.atan2(y2 - y1, x2 - x1);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - head * Math.cos(a - 0.45), y2 - head * Math.sin(a - 0.45));
  ctx.lineTo(x2 - head * Math.cos(a + 0.45), y2 - head * Math.sin(a + 0.45));
  ctx.closePath();
  ctx.fill();
}
