/**
 * Permutation helpers. A permutation of size n is an array `perm` where
 * `perm[i]` is the image of i (for the prisoners: the number hidden in box i).
 */

/** Cycle containing `start`: start → perm[start] → … until it closes. */
export function cycleOf(perm: readonly number[], start: number): number[] {
  const cycle = [start];
  let next = perm[start];
  while (next !== start) {
    cycle.push(next);
    next = perm[next];
  }
  return cycle;
}

/**
 * Disjoint cycle decomposition. Each cycle starts at its smallest element and
 * cycles are ordered by that element, so the result is canonical.
 */
export function cycleDecomposition(perm: readonly number[]): number[][] {
  const seen = new Uint8Array(perm.length);
  const cycles: number[][] = [];
  for (let i = 0; i < perm.length; i++) {
    if (seen[i]) continue;
    const cycle = cycleOf(perm, i);
    for (const x of cycle) seen[x] = 1;
    cycles.push(cycle);
  }
  return cycles;
}

/** For every element, the index of the cycle (in `cycleDecomposition` order) it belongs to. */
export function cycleIndexMap(perm: readonly number[]): number[] {
  const map = new Array<number>(perm.length).fill(-1);
  cycleDecomposition(perm).forEach((cycle, ci) => {
    for (const x of cycle) map[x] = ci;
  });
  return map;
}

/** Length of the longest cycle, computed in O(n) without allocating cycles. */
export function longestCycleLength(perm: readonly number[]): number {
  const seen = new Uint8Array(perm.length);
  let longest = 0;
  for (let i = 0; i < perm.length; i++) {
    if (seen[i]) continue;
    let len = 0;
    let j = i;
    while (!seen[j]) {
      seen[j] = 1;
      j = perm[j];
      len++;
    }
    if (len > longest) longest = len;
  }
  return longest;
}

/** True when `perm` is a bijection on 0..n-1. */
export function isPermutation(perm: readonly number[]): boolean {
  const seen = new Uint8Array(perm.length);
  for (const x of perm) {
    if (!Number.isInteger(x) || x < 0 || x >= perm.length || seen[x]) return false;
    seen[x] = 1;
  }
  return true;
}
