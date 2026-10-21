import type { ApiErrorBody, ErrorCode } from '@/shared/types/common';

import { clearToken, getToken, setToken } from './token';

const API_BASE = '/api/v1';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: ErrorCode | 'NETWORK_ERROR' | 'UNKNOWN',
    message: string,
    public details: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

export function isApiError(e: unknown, code?: ApiError['code']): e is ApiError {
  return e instanceof ApiError && (code === undefined || e.code === code);
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean | string[] | undefined | null>;

  idempotent?: boolean;
  retryOnUnauthorized?: boolean;
};

function buildUrl(path: string, query: RequestOptions['query']) {
  const params = new URLSearchParams();
  Object.entries(query ?? {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    if (Array.isArray(value)) value.forEach((v) => params.append(key, v));
    else params.set(key, String(value));
  });
  const qs = params.toString();
  return `${API_BASE}${path}${qs ? `?${qs}` : ''}`;
}

async function send(path: string, options: RequestOptions): Promise<Response> {
  const token = getToken();
  const isForm = options.body instanceof FormData;

  const headers: Record<string, string> = {};
  if (!isForm && options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.idempotent) headers['Idempotency-Key'] = crypto.randomUUID();

  try {
    return await fetch(buildUrl(path, options.query), {
      method: options.method ?? 'GET',

      credentials: 'include',
      headers,
      body: isForm
        ? (options.body as FormData)
        : options.body !== undefined
          ? JSON.stringify(options.body)
          : undefined,
    });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'Нет связи с сервером');
  }
}

const CODE_BY_STATUS: Record<number, ErrorCode> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN_ACTION',
  404: 'NOT_FOUND',
  409: 'INVALID_TRANSITION',
  410: 'OFFER_EXPIRED',
  422: 'VALIDATION_ERROR',
};

async function parse<T>(response: Response): Promise<T> {
  if (response.ok) {
    if (response.status === 204) return undefined as T;
    const text = await response.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  let body: (ApiErrorBody & { detail?: unknown }) | null = null;
  try {
    body = (await response.json()) as ApiErrorBody & { detail?: unknown };
  } catch {
    body = null;
  }

  throw new ApiError(
    response.status,
    body?.error?.code ?? CODE_BY_STATUS[response.status] ?? 'UNKNOWN',
    body?.error?.message ?? (typeof body?.detail === 'string' ? body.detail : response.statusText),
    body?.error?.details ?? {},
  );
}

type RefreshResponse = { access_token: string; token_type: 'Bearer'; expires_in: number };

let refreshInFlight: Promise<RefreshResponse> | null = null;

export function refreshAccessToken(): Promise<RefreshResponse> {
  refreshInFlight ??= send('/auth/refresh', { method: 'POST' })
    .then((response) => parse<RefreshResponse>(response))
    .then((token) => {
      setToken(token.access_token);
      return token;
    })
    .finally(() => {
      refreshInFlight = null;
    });

  return refreshInFlight;
}

let onSessionExpired: () => void = () => undefined;

export function setSessionExpiredHandler(handler: () => void) {
  onSessionExpired = handler;
}

export async function requestFile(path: string, retry = true): Promise<Blob> {
  const response = await send(path, {});
  if (response.status === 401 && retry && getToken()) {
    try {
      await refreshAccessToken();
    } catch {
      clearToken();
      onSessionExpired();
      throw new ApiError(401, 'UNAUTHORIZED', 'Сессия закончилась');
    }
    return requestFile(path, false);
  }
  if (!response.ok) await parse(response);
  return response.blob();
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { retryOnUnauthorized = true } = options;
  const response = await send(path, options);

  if (response.status === 401 && retryOnUnauthorized && getToken()) {
    try {
      await refreshAccessToken();
    } catch {
      clearToken();
      onSessionExpired();
      throw new ApiError(401, 'UNAUTHORIZED', 'Сессия закончилась');
    }
    return request<T>(path, { ...options, retryOnUnauthorized: false });
  }

  return parse<T>(response);
}
