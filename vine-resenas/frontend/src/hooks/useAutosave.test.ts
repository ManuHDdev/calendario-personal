import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAutosave } from './useAutosave';

describe('useAutosave', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('does not save the initial value', () => {
    const save = vi.fn().mockResolvedValue(undefined);
    renderHook(() => useAutosave('a', save));
    act(() => void vi.advanceTimersByTime(2000));
    expect(save).not.toHaveBeenCalled();
  });

  it('debounces: a single save with the last value after 800ms', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { result, rerender } = renderHook(({ v }) => useAutosave(v, save), { initialProps: { v: 'a' } });
    rerender({ v: 'ab' });
    act(() => void vi.advanceTimersByTime(500));
    rerender({ v: 'abc' });
    act(() => void vi.advanceTimersByTime(799));
    expect(save).not.toHaveBeenCalled();
    expect(result.current.status).toBe('saving');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith('abc');
    expect(result.current.status).toBe('saved');
  });

  it('flush saves immediately', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { result, rerender } = renderHook(({ v }) => useAutosave(v, save), { initialProps: { v: 'a' } });
    rerender({ v: 'b' });
    let ok = false;
    await act(async () => {
      ok = await result.current.flush();
    });
    expect(ok).toBe(true);
    expect(save).toHaveBeenCalledWith('b');
  });

  it('flushes pending changes on unmount', () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { rerender, unmount } = renderHook(({ v }) => useAutosave(v, save), { initialProps: { v: 'a' } });
    rerender({ v: 'b' });
    unmount();
    expect(save).toHaveBeenCalledWith('b');
  });

  it('reports errors and flush returns false', async () => {
    const save = vi.fn().mockRejectedValue(new Error('boom'));
    const { result, rerender } = renderHook(({ v }) => useAutosave(v, save), { initialProps: { v: 'a' } });
    rerender({ v: 'b' });
    let ok = true;
    await act(async () => {
      ok = await result.current.flush();
    });
    expect(ok).toBe(false);
    expect(result.current.status).toBe('error');
  });

  it('does nothing when disabled', () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { rerender } = renderHook(({ v }) => useAutosave(v, save, { enabled: false }), { initialProps: { v: 'a' } });
    rerender({ v: 'b' });
    act(() => void vi.advanceTimersByTime(2000));
    expect(save).not.toHaveBeenCalled();
  });
});
