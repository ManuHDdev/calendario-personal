import { useCallback, useEffect, useRef, useState } from 'react';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Debounced autosave. `value` is compared with the last saved value (initially the value at mount);
 * when it differs, `save` runs after `delay` ms without further changes. `flush()` saves immediately
 * (resolves true when nothing is left unsaved) and an unmount flushes pending changes.
 */
export function useAutosave<T>(
  value: T,
  save: (v: T) => Promise<void>,
  options: { delay?: number; enabled?: boolean } = {},
): { status: SaveStatus; flush: () => Promise<boolean> } {
  const { delay = 800, enabled = true } = options;
  const [status, setStatus] = useState<SaveStatus>('idle');
  const latest = useRef(value);
  const saved = useRef(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveRef = useRef(save);
  const enabledRef = useRef(enabled);
  const inFlight = useRef<Promise<boolean> | null>(null);
  saveRef.current = save;
  enabledRef.current = enabled;

  const clear = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };

  const run = useCallback(async (): Promise<boolean> => {
    clear();
    if (inFlight.current) await inFlight.current;
    const v = latest.current;
    if (!enabledRef.current || sameJson(v, saved.current)) return true;
    setStatus('saving');
    const p = (async () => {
      try {
        await saveRef.current(v);
        saved.current = v;
        setStatus(sameJson(latest.current, v) ? 'saved' : 'saving');
        return true;
      } catch {
        setStatus('error');
        return false;
      }
    })();
    inFlight.current = p;
    const ok = await p;
    inFlight.current = null;
    if (ok && !sameJson(latest.current, saved.current)) return run();
    return ok;
  }, []);

  useEffect(() => {
    latest.current = value;
    if (!enabled || sameJson(value, saved.current)) return;
    setStatus('saving');
    clear();
    timer.current = setTimeout(() => void run(), delay);
  }, [value, enabled, delay, run]);

  // Flush pending edits when the component goes away.
  useEffect(
    () => () => {
      if (timer.current) void run();
    },
    [run],
  );

  return { status, flush: run };
}
