import { useQuery } from '@tanstack/react-query';

import { POLL_MS } from '@/shared/api/query';
import { keys } from '@/shared/api/queryKeys';

import { notificationsApi } from './api';

export const useNotifications = () =>
  useQuery({ queryKey: keys.notifications, queryFn: () => notificationsApi.list(), refetchInterval: POLL_MS });
