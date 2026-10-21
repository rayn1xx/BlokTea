import { QueryClient } from '@tanstack/react-query';

import { ERRORS } from '@/shared/i18n/ru';

import { isApiError } from './client';
import { keys } from './queryKeys';

export const POLL_MS = 10_000;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5_000,
      refetchOnWindowFocus: true,

      retry: (count, error) => !(isApiError(error) && error.status >= 400 && error.status < 500) && count < 2,
    },
    mutations: { retry: false },
  },
});

export function invalidateApplication(id?: string) {
  void queryClient.invalidateQueries({ queryKey: ['applications'] });
  void queryClient.invalidateQueries({ queryKey: ['tasks'] });
  void queryClient.invalidateQueries({ queryKey: keys.home });
  void queryClient.invalidateQueries({ queryKey: keys.notifications });
  void queryClient.invalidateQueries({ queryKey: ['loans'] });
  void queryClient.invalidateQueries({ queryKey: ['documents'] });
  if (id) void queryClient.invalidateQueries({ queryKey: keys.application(id) });
}

export function errorText(error: unknown): string {
  if (!isApiError(error)) return ERRORS.generic;
  switch (error.code) {
    case 'NETWORK_ERROR':
      return ERRORS.network;
    case 'NO_COMPANY_ROLE':
      return ERRORS.noCompanyRole;
    case 'VERSION_CONFLICT':
      return ERRORS.versionConflict;
    case 'OFFER_EXPIRED':
      return ERRORS.offerExpired;
    case 'INVALID_CODE':
      return ERRORS.invalidCode;
    default:
      return error.message || ERRORS.generic;
  }
}

export function fieldErrors(error: unknown): Record<string, string> {
  if (isApiError(error, 'VALIDATION_ERROR')) return error.details as Record<string, string>;
  return {};
}
