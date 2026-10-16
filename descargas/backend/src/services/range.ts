export type RangeResult =
  | { kind: 'none' }
  | { kind: 'partial'; start: number; end: number }
  | { kind: 'unsatisfiable' };

/**
 * Parses a single-range `Range: bytes=...` header against a file of `size` bytes.
 * - absent / not `bytes=` / multi-range  -> serve the whole file (RFC 7233 allows ignoring)
 * - malformed or out-of-bounds           -> 416
 */
export function parseRange(header: string | undefined, size: number): RangeResult {
  if (!header) return { kind: 'none' };
  const trimmed = header.trim();
  if (!/^bytes=/i.test(trimmed)) return { kind: 'none' };

  const spec = trimmed.slice(6).trim();
  if (spec.includes(',')) return { kind: 'none' };

  const match = /^(\d*)-(\d*)$/.exec(spec);
  if (!match || (match[1] === '' && match[2] === '')) return { kind: 'unsatisfiable' };

  if (size === 0) return { kind: 'unsatisfiable' };

  let start: number;
  let end: number;
  if (match[1] === '') {
    // suffix range: last N bytes
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix === 0) return { kind: 'unsatisfiable' };
    start = Math.max(size - suffix, 0);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] === '' ? size - 1 : Number(match[2]);
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)) return { kind: 'unsatisfiable' };
    if (start >= size || start > end) return { kind: 'unsatisfiable' };
    end = Math.min(end, size - 1);
  }
  return { kind: 'partial', start, end };
}
