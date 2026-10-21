import { request } from '@/shared/api/client';

import type { Loan } from './types';

export const loansApi = {
  list: () => request<Loan[]>('/loans'),
  get: (id: string) => request<Loan>(`/loans/${id}`),
};
