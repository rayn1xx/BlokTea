import { request } from '@/shared/api/client';

import type { SigningState } from './types';
import type { Challenge } from '@/shared/types/common';

export const signingApi = {
  get: (id: string) => request<SigningState>(`/applications/${id}/signing`),
  challenge: (id: string) =>
    request<Challenge>(`/applications/${id}/signing/challenge`, { method: 'POST' }),
  confirm: (id: string, body: { challenge_id: string; code: string }) =>
    request<SigningState>(`/applications/${id}/signing/confirm`, {
      method: 'POST',
      body,
      idempotent: true,
    }),
  remind: (id: string, userId: string) =>
    request<void>(`/applications/${id}/signing/remind`, {
      method: 'POST',
      body: { user_id: userId },
    }),
};
