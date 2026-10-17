import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { useAsync } from './useAsync';

const deferred = <T,>() => {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

describe('useAsync', () => {
  test('starts loading, then exposes the data', async () => {
    const { result } = renderHook(() => useAsync(async () => 'ok', []));

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toBe('ok');
    expect(result.current.error).toBeNull();
  });

  test('exposes a failure as a readable message', async () => {
    const { result } = renderHook(() => useAsync(async () => { throw new Error('boom'); }, []));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('boom');
    expect(result.current.data).toBeNull();
  });

  test('copes with a non-Error rejection', async () => {
    const { result } = renderHook(() => useAsync(async () => { throw 'weird'; }, []));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('Something went wrong');
  });

  test('reload fetches again and clears a previous error', async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValue('fine');
    const { result } = renderHook(() => useAsync(fn, []));
    await waitFor(() => expect(result.current.error).toBe('boom'));

    act(() => result.current.reload());

    await waitFor(() => expect(result.current.data).toBe('fine'));
    expect(result.current.error).toBeNull();
    expect(fn).toHaveBeenCalledTimes(2);
  });

  test('keeps showing old data while reloading, so the screen does not flash empty', async () => {
    const second = deferred<string>();
    const fn = vi.fn().mockResolvedValueOnce('first').mockReturnValueOnce(second.promise);
    const { result } = renderHook(() => useAsync(fn, []));
    await waitFor(() => expect(result.current.data).toBe('first'));

    act(() => result.current.reload());

    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBe('first');
    await act(async () => second.resolve('second'));
    expect(result.current.data).toBe('second');
  });

  test('a slow old request cannot overwrite a newer one', async () => {
    const slow = deferred<string>();
    const fast = deferred<string>();
    const fn = vi.fn().mockReturnValueOnce(slow.promise).mockReturnValueOnce(fast.promise);
    const { result, rerender } = renderHook(({ id }) => useAsync(() => fn(id), [id]), { initialProps: { id: 1 } });

    rerender({ id: 2 });
    await act(async () => fast.resolve('new'));
    await act(async () => slow.resolve('old'));

    expect(result.current.data).toBe('new');
  });

  test('a late failure of an outdated request is ignored', async () => {
    const slow = deferred<string>();
    const fast = deferred<string>();
    const fn = vi.fn().mockReturnValueOnce(slow.promise).mockReturnValueOnce(fast.promise);
    const { result, rerender } = renderHook(({ id }) => useAsync(() => fn(id), [id]), { initialProps: { id: 1 } });

    rerender({ id: 2 });
    await act(async () => fast.resolve('new'));
    await act(async () => slow.reject(new Error('stale failure')));

    expect(result.current.error).toBeNull();
    expect(result.current.data).toBe('new');
  });

  test('does not update state after unmount', async () => {
    const pending = deferred<string>();
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { unmount } = renderHook(() => useAsync(() => pending.promise, []));

    unmount();
    await act(async () => pending.resolve('late'));

    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });
});
