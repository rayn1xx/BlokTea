import { useQuery } from '@tanstack/react-query';

import { POLL_MS } from '@/shared/api/query';
import { keys } from '@/shared/api/queryKeys';

import { tasksApi } from './api';
import type { TaskScope } from './types';

export const useTasks = (scope: TaskScope) =>
  useQuery({ queryKey: keys.tasks(scope), queryFn: () => tasksApi.list(scope), refetchInterval: POLL_MS });
