import { useQuery } from '@tanstack/react-query';

import { keys } from '@/shared/api/queryKeys';

import { loansApi } from './api';

export const useLoans = () => useQuery({ queryKey: keys.loans, queryFn: loansApi.list });

export const useLoan = (id: string) => useQuery({ queryKey: keys.loan(id), queryFn: () => loansApi.get(id) });
