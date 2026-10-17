import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react';

interface AsyncState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
}

export const errorMessage = (error: unknown) => (error instanceof Error ? error.message : 'Something went wrong');

/**
 * Runs `load` whenever `deps` change. Results of outdated runs are dropped, so a slow
 * request can never overwrite a newer one or touch an unmounted component.
 */
export function useAsync<T>(load: () => Promise<T>, deps: DependencyList) {
  const [state, setState] = useState<AsyncState<T>>({ data: null, error: null, loading: true });
  const [version, setVersion] = useState(0);
  const loadRef = useRef(load);
  loadRef.current = load;
  const keepData = useRef(false);

  useEffect(() => {
    let current = true;
    const keep = keepData.current;
    keepData.current = false;
    setState(s => ({ data: keep ? s.data : null, error: null, loading: true }));

    loadRef.current().then(
      data => { if (current) setState({ data, error: null, loading: false }); },
      error => { if (current) setState(s => ({ data: s.data, error: errorMessage(error), loading: false })); },
    );
    return () => { current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, version]);

  /** Fetch again but keep showing the current data meanwhile. */
  const reload = useCallback(() => {
    keepData.current = true;
    setVersion(v => v + 1);
  }, []);

  return { ...state, reload };
}
