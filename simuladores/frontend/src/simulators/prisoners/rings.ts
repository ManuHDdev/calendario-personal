export interface RingPos {
  x: number;
  y: number;
  r: number;
}

export interface RingLayout {
  /** Same indices as the input lengths; null when the ring did not fit. */
  rings: (RingPos | null)[];
  shown: number;
  /** Dot radius for each element on the rings. */
  dot: number;
}

/**
 * Pack cycles as rings whose circumference is proportional to their length,
 * longest first, wrapping into rows. Bisects the largest per-element spacing
 * that fits the canvas; if not even the minimum spacing fits, the smallest
 * cycles are left out (and reported through `shown`).
 */
export function layoutRings(lengths: number[], width: number, height: number): RingLayout {
  const empty: RingLayout = { rings: lengths.map(() => null), shown: 0, dot: 2 };
  if (width < 10 || height < 10 || lengths.length === 0) return empty;
  const order = lengths.map((len, i) => ({ len, i })).sort((a, b) => b.len - a.len);
  const pad = 10;
  const gap = 10;
  const MIN_SPACING = 3;

  const tryLayout = (spacing: number, count: number): (RingPos | null)[] | null => {
    const out: (RingPos | null)[] = lengths.map(() => null);
    let x = pad;
    let y = pad;
    let rowH = 0;
    const placed: RingPos[] = [];
    for (const { len, i } of order.slice(0, count)) {
      const r = Math.max(spacing * 0.9, (len * spacing) / (2 * Math.PI));
      const d = 2 * r + spacing;
      if (x + d > width - pad + 0.01) {
        x = pad;
        y += rowH + gap;
        rowH = 0;
      }
      if (d > width - 2 * pad || y + d > height - pad + 0.01) return null;
      const p = { x: x + d / 2, y: y + d / 2, r };
      out[i] = p;
      placed.push(p);
      x += d + gap;
      rowH = Math.max(rowH, d);
    }
    const dy = (height - pad - (y + rowH)) / 2;
    if (dy > 0) for (const p of placed) p.y += dy;
    return out;
  };

  let count = order.length;
  while (count > 0 && !tryLayout(MIN_SPACING, count)) count--;
  if (count === 0) return empty;

  let lo = MIN_SPACING;
  let hi = 48;
  let best = tryLayout(lo, count)!;
  for (let it = 0; it < 16; it++) {
    const mid = (lo + hi) / 2;
    const res = tryLayout(mid, count);
    if (res) {
      best = res;
      lo = mid;
    } else hi = mid;
  }
  return { rings: best, shown: count, dot: Math.max(1.6, Math.min(5, lo * 0.32)) };
}
