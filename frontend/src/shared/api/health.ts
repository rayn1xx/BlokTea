import { useQuery } from '@tanstack/react-query';

import { request } from './client';
import { keys } from './queryKeys';

export type Health = {
  status: 'ok' | 'degraded';
  db: 'ok' | 'down';
  llm: 'up' | 'down' | 'stub';
  llm_models: { text: string | null; vision: string | null };
  mocks: { alfa_lk: 'ok' | 'down'; registry: 'ok' | 'down'; bki: 'ok' | 'down'; fns: 'ok' | 'down' };
  demo_mode: boolean;
};

export const healthApi = {
  get: () => request<Health>('/health', { retryOnUnauthorized: false }),
};

export const useHealth = () =>
  useQuery({ queryKey: keys.health, queryFn: healthApi.get, staleTime: 60_000, retry: false });
