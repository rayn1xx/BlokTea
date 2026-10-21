import { request } from '@/shared/api/client';

import type { InfoRequest } from './types';

export const infoRequestsApi = {
  get: (applicationId: string, rid: string) =>
    request<InfoRequest>(`/applications/${applicationId}/info-requests/${rid}`),
  respond: (applicationId: string, rid: string, body: { document_ids: string[]; comment?: string }) =>
    request<InfoRequest>(`/applications/${applicationId}/info-requests/${rid}/respond`, {
      method: 'POST',
      body,
    }),
};
