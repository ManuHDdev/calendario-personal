/**
 * Minimal fixed-window, in-memory limiter (no extra dependency). Single backend instance only, which
 * is how this subapp is deployed. State is bounded: expired windows are purged when the map grows.
 */
export class RateLimiter {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
    private readonly maxKeys = 10_000,
  ) {}

  /** Counts one hit. `allowed` is false once the window is over budget. */
  hit(key: string): { allowed: boolean; retryAfterSec: number } {
    const t = this.now();
    if (this.hits.size >= this.maxKeys) this.purge(t);
    let entry = this.hits.get(key);
    if (!entry || entry.resetAt <= t) {
      entry = { count: 0, resetAt: t + this.windowMs };
      this.hits.set(key, entry);
    }
    entry.count++;
    return { allowed: entry.count <= this.max, retryAfterSec: Math.max(1, Math.ceil((entry.resetAt - t) / 1000)) };
  }

  /** True when the key has already used up its budget in the current window (does not count). */
  blocked(key: string): { blocked: boolean; retryAfterSec: number } {
    const t = this.now();
    const entry = this.hits.get(key);
    if (!entry || entry.resetAt <= t) return { blocked: false, retryAfterSec: 0 };
    return { blocked: entry.count >= this.max, retryAfterSec: Math.max(1, Math.ceil((entry.resetAt - t) / 1000)) };
  }

  private purge(t: number): void {
    for (const [k, v] of this.hits) if (v.resetAt <= t) this.hits.delete(k);
    // Still full of live windows (flood): drop everything rather than grow without bound.
    if (this.hits.size >= this.maxKeys) this.hits.clear();
  }
}
