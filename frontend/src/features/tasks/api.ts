import { request } from '@/shared/api/client';

import type { Task, TaskScope } from './types';

export const tasksApi = {
  list: (scope: TaskScope) => request<Task[]>('/tasks', { query: { scope } }),
  reassign: (id: string, memberId: string) =>
    request<Task>(`/tasks/${id}/reassign`, { method: 'POST', body: { member_id: memberId } }),
};
