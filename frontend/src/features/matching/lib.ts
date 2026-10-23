import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { errorText, queryClient } from '@/shared/api/query';
import { keys } from '@/shared/api/queryKeys';
import { useAutosave } from '@/shared/lib/useAutosave';

import { matchingApi } from './api';
import type { MatchingSession, MatchingSessionPatch } from './types';

export function mergePatch(a: MatchingSessionPatch, b: MatchingSessionPatch): MatchingSessionPatch {
  return {
    ...a,
    ...b,
    need: a.need || b.need ? { ...a.need, ...b.need } : undefined,
    extra: a.extra || b.extra ? { ...a.extra, ...b.extra } : undefined,
  };
}

export function useSessionAutosave(session: MatchingSession) {
  return useAutosave<MatchingSessionPatch>(async (patch) => {
    const updated = await matchingApi.patch(session.id, patch);
    queryClient.setQueryData(keys.matching(session.id), updated);
  });
}

export function useStartMatching() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const start = useMutation({
    mutationFn: matchingApi.create,
    onSuccess: (session) => navigate(`/match/${session.id}/step/1`),
    onError: (e) => setError(errorText(e)),
  });
  return { start: () => start.mutate(), pending: start.isPending, error };
}
