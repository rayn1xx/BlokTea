import { request } from '@/shared/api/client';
import { resetSessionRestore } from '@/shared/api/session';
import { clearToken, getToken } from '@/shared/api/token';

import type { InviteAcceptRequest, InviteAcceptResponse, LoginRequest, TokenResponse } from './types';

export const authApi = {
  login: (body: LoginRequest) =>
    request<TokenResponse>('/auth/login', { method: 'POST', body, retryOnUnauthorized: false }),

  logout: async () => {
    try {
      if (getToken()) {
        await request<void>('/auth/logout', { method: 'POST', retryOnUnauthorized: false });
      }
    } catch {
    } finally {
      clearToken();
      resetSessionRestore();
    }
  },

  acceptInvite: (body: InviteAcceptRequest) =>
    request<InviteAcceptResponse>('/auth/invite/accept', {
      method: 'POST',
      body,
      retryOnUnauthorized: false,
    }),
};
