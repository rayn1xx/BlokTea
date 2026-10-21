import { request } from '@/shared/api/client';

import type { MatchingSession, MatchingSessionPatch, RecommendResponse } from './types';

export const matchingApi = {
  create: () => request<MatchingSession>('/matching-sessions', { method: 'POST' }),

  get: (id: string) =>
    request<MatchingSession>(`/matching-sessions/${id}`, { method: 'PATCH', body: {} }),
  patch: (id: string, body: MatchingSessionPatch) =>
    request<MatchingSession>(`/matching-sessions/${id}`, { method: 'PATCH', body }),
  recommend: (id: string) =>
    request<RecommendResponse>(`/matching-sessions/${id}/recommend`, { method: 'POST' }),
};
