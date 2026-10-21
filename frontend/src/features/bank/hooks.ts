import { useQuery } from '@tanstack/react-query';

import { POLL_MS } from '@/shared/api/query';
import { keys } from '@/shared/api/queryKeys';

import { bankApi } from './api';
import type { BankQueueParams } from './types';

export const useBankQueue = (params: BankQueueParams) =>
  useQuery({
    queryKey: keys.bankQueue(params),
    queryFn: () => bankApi.queue(params),
    refetchInterval: POLL_MS,
    placeholderData: (prev) => prev,
  });

export const useBankApplication = (id: string) =>
  useQuery({ queryKey: keys.bankApplication(id), queryFn: () => bankApi.get(id) });
