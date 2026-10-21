import { useQuery } from '@tanstack/react-query';

import { keys } from '@/shared/api/queryKeys';
import type { LegalForm } from '@/shared/types/common';

import { productsApi } from './api';

export const useProducts = (lf?: LegalForm) =>
  useQuery({ queryKey: keys.products(lf), queryFn: () => productsApi.list(lf) });

export const usePreapproved = () => useQuery({ queryKey: keys.preapproved, queryFn: productsApi.preapproved });
