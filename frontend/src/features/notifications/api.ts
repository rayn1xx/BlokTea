import { request } from '@/shared/api/client';

import type { Notification } from './types';

export const notificationsApi = {
  list: (unread?: boolean) =>
    request<Notification[]>('/notifications', { query: { unread: unread ? 'true' : undefined } }),
  read: (id: string) => request<void>(`/notifications/${id}/read`, { method: 'POST' }),
  readAll: () => request<void>('/notifications/read-all', { method: 'POST' }),
};
