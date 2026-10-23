import { useCallback, useEffect, useRef, useState } from 'react';

import { errorText } from '@/shared/api/query';



export type AutosaveState = { status: 'idle' | 'saving' | 'saved' | 'error'; savedAt: string | null; error: string | null };

export function useAutosave<T>(save: (patch: T) => Promise<unknown>, delayMs = 1000) {
  const [state, setState] = useState<AutosaveState>({ status: 'idle', savedAt: null, error: null });
  const pending = useRef<T | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveRef = useRef(save);
  saveRef.current = save;

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const patch = pending.current;
    if (!patch) return;
    pending.current = null;
    setState((s) => ({ ...s, status: 'saving' }));
    try {
      await saveRef.current(patch);
      setState({ status: 'saved', savedAt: new Date().toISOString(), error: null });
    } catch (e) {
      setState({ status: 'error', savedAt: null, error: errorText(e) });
      throw e;
    }
  }, []);

  const schedule = useCallback(
    (patch: T, merge: (a: T, b: T) => T = (a, b) => ({ ...a, ...b })) => {
      pending.current = pending.current ? merge(pending.current, patch) : patch;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        void flush().catch(() => undefined);
      }, delayMs);
    },
    [delayMs, flush],
  );

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);

      if (pending.current) void saveRef.current(pending.current).catch(() => undefined);
    },
    [],
  );

  return { state, schedule, flush };
}
