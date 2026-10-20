import type { TokenResponse } from '../models';

import { DEMO_TOKEN } from './demo';
import { clearToken, getToken, setToken } from './token';

const API_BASE = '/api/v1';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

function send(path: string, init: RequestInit = {}): Promise<Response> {
  const token = getToken();

  return fetch(`${API_BASE}${path}`, {
    ...init,
    // refresh-токен живёт в httpOnly-cookie, браузер отправляет его сам
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
}

async function parse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new ApiError(response.status, response.statusText);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

// один общий запрос на обновление, даже если 401 пришёл сразу нескольким запросам
let refreshInFlight: Promise<TokenResponse> | null = null;

export function refreshAccessToken(): Promise<TokenResponse> {
  if (getToken() === DEMO_TOKEN.access_token) {
    return Promise.resolve(DEMO_TOKEN);
  }

  refreshInFlight ??= send('/auth/refresh', { method: 'POST' })
    .then((response) => parse<TokenResponse>(response))
    .then((token) => {
      setToken(token.access_token);
      return token;
    })
    .finally(() => {
      refreshInFlight = null;
    });

  return refreshInFlight;
}

export async function request<T>(
  path: string,
  init: RequestInit = {},
  { retryOnUnauthorized = true } = {},
): Promise<T> {
  const response = await send(path, init);

  // access-токен истёк — обновляем его и повторяем запрос один раз
  if (response.status === 401 && retryOnUnauthorized && getToken()) {
    try {
      await refreshAccessToken();
    } catch {
      clearToken();
      throw new ApiError(401, 'Unauthorized');
    }

    return request<T>(path, init, { retryOnUnauthorized: false });
  }

  return parse<T>(response);
}
