import { request } from '@/shared/api/client';
import type { Paginated } from '@/shared/types/common';

import type { FeedItem } from './types';

export const feedApi = {
  list: (params: { type?: string; page?: number; page_size?: number } = {}) =>
    request<Paginated<FeedItem>>('/feed', { query: params }),
};
