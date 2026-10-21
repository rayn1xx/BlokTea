import { useQuery } from '@tanstack/react-query';

import { keys } from '@/shared/api/queryKeys';

import { teamApi } from './api';

export const useMembers = () => useQuery({ queryKey: keys.members, queryFn: teamApi.members });

export const useSigningRules = () => useQuery({ queryKey: keys.signingRules, queryFn: teamApi.signingRules });
