import type { Onboarding } from '@/features/profile/types';
import { request } from '@/shared/api/client';

import type { CompanyDetailsPatch, CompanyProfile, FinanceSummary, FinanceSummaryPatch, Readiness, RegistryConfirmRequest } from './types';

export const companyApi = {
  profile: () => request<CompanyProfile>('/company/profile'),
  confirmRegistry: (body: RegistryConfirmRequest) =>
    request<CompanyProfile>('/company/registry/confirm', { method: 'POST', body }),
  patchDetails: (body: CompanyDetailsPatch) =>
    request<CompanyProfile>('/company/details', { method: 'PATCH', body }),
  completeOnboarding: (skipped: boolean) =>
    request<Onboarding>('/onboarding/complete', { method: 'POST', body: { skipped } }),
  financeSummary: () => request<FinanceSummary>('/company/finance-summary'),
  patchFinanceSummary: (body: FinanceSummaryPatch) =>
    request<FinanceSummary>('/company/finance-summary', { method: 'PATCH', body }),
  readiness: (params: { amount?: number; term_months?: number } = {}) =>
    request<Readiness>('/company/readiness', { query: params }),
};
