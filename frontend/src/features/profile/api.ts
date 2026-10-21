import { request } from '@/shared/api/client';

import type { Home } from './types';

export const homeApi = {
  get: () => request<Home>('/home'),
};
