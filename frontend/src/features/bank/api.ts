import type { Decision } from '@/features/applications/types';
import type { InfoRequest } from '@/features/info-requests/types';
import { request } from '@/shared/api/client';
import type { Paginated } from '@/shared/types/common';

import type { BankApplicationDetail, BankDashboard, BankDecisionRequest, BankQueueItem, BankQueueParams, CounterOfferOption, InfoRequestTemplate, RejectionReason, ScoringThresholds } from './types';

export const bankApi = {
  queue: (params: BankQueueParams) =>
    request<Paginated<BankQueueItem>>('/bank/applications', {
      query: { ...params, mine: params.mine ? 'true' : undefined },
    }),
  take: (id: string) =>
    request<BankApplicationDetail>(`/bank/applications/${id}/take`, {
      method: 'POST',
      idempotent: true,
    }),
  get: (id: string) => request<BankApplicationDetail>(`/bank/applications/${id}`),
  aiSummary: (id: string) =>
    request<BankApplicationDetail>(`/bank/applications/${id}/ai-summary`, { method: 'POST' }),
  rerunChecks: (id: string) =>
    request<BankApplicationDetail>(`/bank/applications/${id}/rerun-checks`, { method: 'POST' }),
  counterOfferOptions: (id: string) =>
    request<{ options: CounterOfferOption[] }>(`/bank/applications/${id}/counter-offer-options`),
  previewDecision: (id: string, body: BankDecisionRequest) =>
    request<{ client_view: Decision | InfoRequest }>(`/bank/applications/${id}/decision/preview`, {
      method: 'POST',
      body,
    }),
  decide: (id: string, body: BankDecisionRequest) =>
    request<BankApplicationDetail>(`/bank/applications/${id}/decision`, {
      method: 'POST',
      body,
      idempotent: true,
    }),
  infoRequestTemplates: () => request<InfoRequestTemplate[]>('/bank/info-request-templates'),
  rejectionReasons: () => request<RejectionReason[]>('/bank/rejection-reasons'),
  dashboard: () => request<BankDashboard>('/bank/dashboard', { query: { period: '7d' } }),
  scoringSettings: () => request<ScoringThresholds>('/bank/settings/scoring'),
  putScoringSettings: (body: ScoringThresholds) =>
    request<ScoringThresholds>('/bank/settings/scoring', { method: 'PUT', body }),
};
