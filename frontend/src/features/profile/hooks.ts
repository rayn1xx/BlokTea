import { useQuery } from '@tanstack/react-query';

import { keys } from '@/shared/api/queryKeys';

import { homeApi } from './api';

export const useHome = () => useQuery({ queryKey: keys.home, queryFn: homeApi.get });
