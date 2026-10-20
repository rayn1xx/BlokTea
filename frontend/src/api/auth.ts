import type { LoginRequest, TokenResponse } from '../models';

import { refreshAccessToken, request } from './client';
import { DEMO_CREDENTIALS, DEMO_TOKEN } from './demo';
import { clearToken, getToken, setToken } from './token';

export function login(body: LoginRequest): Promise<TokenResponse> {
  if (body.login === DEMO_CREDENTIALS.login && body.password === DEMO_CREDENTIALS.password) {
    return Promise.resolve(DEMO_TOKEN);
  }

  return request<TokenResponse>(
    '/auth/login',
    { method: 'POST', body: JSON.stringify(body) },
    { retryOnUnauthorized: false },
  );
}

export function saveToken(token: TokenResponse) {
  setToken(token.access_token);
}

// POST /api/v1/auth/refresh
export const refresh = refreshAccessToken;

// POST /api/v1/auth/logout — локальный токен удаляем в любом случае, даже если сервер не ответил
export async function logout() {
  const token = getToken();

  try {
    if (token && token !== DEMO_TOKEN.access_token) {
      await request<void>('/auth/logout', { method: 'POST' }, { retryOnUnauthorized: false });
    }
  } catch {
    // сессия на сервере могла уже истечь — для пользователя это не ошибка
  } finally {
    clearToken();
  }
}
