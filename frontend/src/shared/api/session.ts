import { useEffect, useState } from 'react';

import { refreshAccessToken } from './client';
import { getToken } from './token';

type SessionState = 'checking' | 'in' | 'out';

let restoreAttempt: Promise<boolean> | null = null;

function restoreSession(): Promise<boolean> {
  restoreAttempt ??= refreshAccessToken()
    .then(() => true)
    .catch(() => false);
  return restoreAttempt;
}

export function resetSessionRestore() {
  restoreAttempt = null;
}

export function useSessionState(): SessionState {
  const [state, setState] = useState<SessionState>(() => (getToken() ? 'in' : 'checking'));

  useEffect(() => {
    if (getToken()) {
      setState('in');
      return;
    }
    let alive = true;
    void restoreSession().then((ok) => {
      if (alive) setState(ok && getToken() ? 'in' : 'out');
    });
    return () => {
      alive = false;
    };
  }, []);

  return state;
}
