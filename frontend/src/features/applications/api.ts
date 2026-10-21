import type { Task } from '@/features/tasks/types';
import { request } from '@/shared/api/client';

import type { ApplicationDetail, ApplicationListParams, ApplicationPatch, ApplicationsListResponse, CreateApplicationRequest, Requirement, RequirementCode, RequirementsResponse } from './types';
import type { Challenge } from '@/shared/types/common';

export const applicationsApi = {
  list: (params: ApplicationListParams) =>
    request<ApplicationsListResponse>('/applications', { query: params }),
  create: (body: CreateApplicationRequest) =>
    request<ApplicationDetail>('/applications', { method: 'POST', body }),
  get: (id: string) => request<ApplicationDetail>(`/applications/${id}`),
  patch: (id: string, body: ApplicationPatch) =>
    request<ApplicationDetail>(`/applications/${id}`, { method: 'PATCH', body }),
  requirements: (id: string) => request<RequirementsResponse>(`/applications/${id}/requirements`),
  consentChallenge: (id: string, type: RequirementCode) =>
    request<Challenge>(`/applications/${id}/consents/${type}/challenge`, { method: 'POST' }),
  consentConfirm: (id: string, type: RequirementCode, body: { challenge_id: string; code: string }) =>
    request<Requirement>(`/applications/${id}/consents/${type}/confirm`, {
      method: 'POST',
      body,
      idempotent: true,
    }),
  submit: (id: string) =>
    request<ApplicationDetail>(`/applications/${id}/submit`, { method: 'POST', idempotent: true }),
  handoff: (id: string, memberId: string) =>
    request<Task>(`/applications/${id}/handoff`, {
      method: 'POST',
      body: { member_id: memberId },
    }),
  cancel: (id: string, reason?: string) =>
    request<ApplicationDetail>(`/applications/${id}/cancel`, {
      method: 'POST',
      body: { reason },
      idempotent: true,
    }),
  acceptOffer: (id: string) =>
    request<ApplicationDetail>(`/applications/${id}/offer/accept`, {
      method: 'POST',
      idempotent: true,
    }),
  declineOffer: (id: string, reason?: string) =>
    request<ApplicationDetail>(`/applications/${id}/offer/decline`, {
      method: 'POST',
      body: { reason },
      idempotent: true,
    }),
};
