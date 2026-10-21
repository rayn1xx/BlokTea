import { useQuery } from '@tanstack/react-query';

import { keys } from '@/shared/api/queryKeys';

import { feedApi } from './api';

export const useFeed = (size = 3) =>
  useQuery({ queryKey: keys.feed(size), queryFn: () => feedApi.list({ page: 1, page_size: size }) });
