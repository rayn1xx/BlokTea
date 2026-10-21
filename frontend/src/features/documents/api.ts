import { request } from '@/shared/api/client';
import type { LegalForm, ProductCode } from '@/shared/types/common';

import type { DocumentRef, DocumentType, FromLkRequest, MissingDocument } from './types';

export const documentsApi = {
  types: (params: { legal_form?: LegalForm; product_code?: ProductCode } = {}) =>
    request<DocumentType[]>('/document-types', { query: params }),
  list: (params: { scope?: 'company' | 'application'; application_id?: string; status?: string }) =>
    request<DocumentRef[]>('/documents', { query: params }),
  missing: () => request<{ items: MissingDocument[] }>('/documents/missing'),
  upload: (data: {
    file: File;
    document_type?: string;
    scope: 'company' | 'application';
    application_id?: string;
    info_request_id?: string;
  }) => {
    const form = new FormData();
    form.append('file', data.file);
    form.append('scope', data.scope);
    if (data.document_type) form.append('document_type', data.document_type);
    if (data.application_id) form.append('application_id', data.application_id);
    if (data.info_request_id) form.append('info_request_id', data.info_request_id);
    return request<DocumentRef>('/documents', { method: 'POST', body: form });
  },
  fromLk: (body: FromLkRequest) =>
    request<DocumentRef>('/documents/from-lk', { method: 'POST', body }),
  get: (id: string) => request<DocumentRef>(`/documents/${id}`),
  fileUrl: (id: string) => `/api/v1/documents/${id}/file`,
  newVersion: (id: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return request<DocumentRef>(`/documents/${id}/versions`, { method: 'POST', body: form });
  },
  analyze: (id: string) => request<DocumentRef>(`/documents/${id}/analyze`, { method: 'POST' }),
  remove: (id: string) => request<void>(`/documents/${id}`, { method: 'DELETE' }),
};
