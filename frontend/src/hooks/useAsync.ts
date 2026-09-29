import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Minimal data-fetching hook: loading / error / data + reload, with stale-response
 * protection so a slow earlier request can't overwrite a newer one.
 */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[], opts: { pollMs?: number } = {}) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(
    async (silent = false) => {
      const id = ++seq.current;
      if (!silent) setLoading(true);
      try {
        const result = await fn();
        if (id === seq.current) {
          setData(result);
          setError(null);
        }
      } catch (e) {
        if (id === seq.current) setError((e as Error).message);
      } finally {
        if (id === seq.current) setLoading(false);
      }
    },
    deps,
  );

  useEffect(() => {
    void run();
    if (!opts.pollMs) return;
    const t = setInterval(() => void run(true), opts.pollMs);
    return () => clearInterval(t);
  }, [run, opts.pollMs]);

  return { data, error, loading, reload: run };
}
