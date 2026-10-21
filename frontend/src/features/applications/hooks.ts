import { useQuery } from '@tanstack/react-query';

import { POLL_MS } from '@/shared/api/query';
import { keys } from '@/shared/api/queryKeys';

import { applicationsApi } from './api';
import type { ApplicationListParams } from './types';

export const useApplications = (params: ApplicationListParams, poll = false) =>
  useQuery({
    queryKey: keys.applications(params),
    queryFn: () => applicationsApi.list(params),
    refetchInterval: poll ? POLL_MS : false,
    placeholderData: (prev) => prev,
  });

export const useApplication = (id: string, poll = false) =>
  useQuery({
    queryKey: keys.application(id),
    queryFn: () => applicationsApi.get(id),
    refetchInterval: poll ? POLL_MS : false,
  });

export const useRequirements = (id: string) =>
  useQuery({ queryKey: keys.requirements(id), queryFn: () => applicationsApi.requirements(id) });
