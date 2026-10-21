import { useQuery } from '@tanstack/react-query';

import { keys } from '@/shared/api/queryKeys';

import { companyApi } from './api';

export const useCompanyProfile = () => useQuery({ queryKey: keys.companyProfile, queryFn: companyApi.profile });

export const useFinance = () => useQuery({ queryKey: keys.finance, queryFn: companyApi.financeSummary });

export const useReadiness = (amount?: number, term?: number) =>
  useQuery({
    queryKey: keys.readiness(amount, term),
    queryFn: () => companyApi.readiness({ amount, term_months: term }),
  });
