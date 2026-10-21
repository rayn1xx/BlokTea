import { request } from '@/shared/api/client';

import type { InviteRequest, InviteResponse, Member, MemberPatch, SigningRules } from './types';

export const teamApi = {
  members: () => request<Member[]>('/company/members'),
  invite: (body: InviteRequest) =>
    request<InviteResponse>('/company/members/invite', { method: 'POST', body }),
  patch: (id: string, body: MemberPatch) =>
    request<Member>(`/company/members/${id}`, { method: 'PATCH', body }),
  approve: (id: string) =>
    request<Member>(`/company/members/${id}/approve`, { method: 'POST', idempotent: true }),
  remove: (id: string) => request<void>(`/company/members/${id}`, { method: 'DELETE' }),
  signingRules: () => request<SigningRules>('/company/signing-rules'),
  putSigningRules: (body: SigningRules) =>
    request<SigningRules>('/company/signing-rules', { method: 'PUT', body }),
};
