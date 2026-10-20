import type { LoginRequest, TokenResponse } from '../models';

import { request } from './client';

const TOKEN_KEY = 'access_token';

export function login(body: LoginRequest): Promise<TokenResponse> {
  return request<TokenResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function saveToken(token: TokenResponse) {
  sessionStorage.setItem(TOKEN_KEY, token.access_token);
}
