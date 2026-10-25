import { request } from '@/shared/api/client';

import type { Task, TaskScope } from './types';

export const tasksApi = {
  list: (scope: TaskScope) => request<Task[]>('/tasks', { query: { scope } }),
  requestDocument: (body: { member_id: string; document_type: string; application_id?: string | null; comment?: string }) =>
    request<Task>('/tasks/request-document', { method: 'POST', body }),
  reassign: (id: string, memberId: string) =>
    request<Task>(`/tasks/${id}/reassign`, { method: 'POST', body: { member_id: memberId } }),
};
