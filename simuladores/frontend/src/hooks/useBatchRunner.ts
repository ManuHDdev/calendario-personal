import { useCallback, useRef, useState } from 'react';
import { useAnimationFrame } from './useAnimationFrame';

/**
 * Runs queued Monte Carlo trials across animation frames so charts visibly
 * fill up (a batch is spread over ~`seconds`) while never blocking a frame
 * for more than `budgetMs`. `runTrials(k)` must perform k trials and mutate
 * the caller's accumulators; the hook re-renders once per frame.
 */
export function useBatchRunner(runTrials: (count: number) => void, seconds = 1.6, budgetMs = 10) {
  const runRef = useRef(runTrials);
  runRef.current = runTrials;
  const queue = useRef(0);
  const rate = useRef(1);
  const [running, setRunning] = useState(false);
  const [, setTick] = useState(0);

  const enqueue = useCallback(
    (count: number) => {
      queue.current += count;
      rate.current = Math.max(queue.current / seconds, 30);
      setRunning(true);
    },
    [seconds],
  );

  const cancel = useCallback(() => {
    queue.current = 0;
    setRunning(false);
  }, []);

  useAnimationFrame((dt) => {
    const target = Math.min(queue.current, Math.max(1, Math.ceil(rate.current * dt)));
    const start = performance.now();
    let done = 0;
    const chunk = Math.max(1, Math.ceil(target / 10));
    while (done < target && performance.now() - start < budgetMs) {
      const k = Math.min(chunk, target - done);
      runRef.current(k);
      done += k;
    }
    queue.current -= done;
    setTick((t) => t + 1);
    if (queue.current <= 0) {
      queue.current = 0;
      setRunning(false);
    }
  }, running);

  return { enqueue, cancel, running, queued: queue.current };
}
