import { useQuery } from '@tanstack/react-query';

import { POLL_MS } from '@/shared/api/query';
import { keys } from '@/shared/api/queryKeys';

import { signingApi } from './api';

export const useSigning = (id: string) =>
  useQuery({ queryKey: keys.signing(id), queryFn: () => signingApi.get(id), refetchInterval: POLL_MS });
