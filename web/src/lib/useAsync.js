import { useCallback, useEffect, useRef, useState } from 'react';
import { describeError } from './api';

export function useAsync(fn, deps = []) {
  const [state, set] = useState({ data: null, loading: true, error: null });
  const seq = useRef(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(async () => {
    const id = ++seq.current;
    set((s) => ({ ...s, loading: true, error: null }));
    try { const data = await fn(); if (id === seq.current) set({ data, loading: false, error: null }); }
    catch (e) { if (id === seq.current) set({ data: null, loading: false, error: describeError(e) }); }
  }, deps);
  useEffect(() => { run(); }, [run]);
  return { ...state, reload: run };
}
