import { queryClient } from '@/shared/api/query';
import { keys } from '@/shared/api/queryKeys';
import { useAutosave } from '@/shared/lib/useAutosave';

import { matchingApi } from './api';
import type { MatchingExtra, MatchingSession, MatchingSessionPatch } from './types';

export const STEPS = ['Задача', 'Финансы', 'Подробности', 'Рекомендация'];

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

export const TERM_OPTIONS = [6, 12, 18, 24, 36, 48, 60];

export function hasExtra(x: MatchingExtra) {
  return !!(x.expected_payments.length || x.other_bank_turnover_monthly || x.own_funds || x.collateral_details || x.preference);
}
