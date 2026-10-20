import type {
  ApplicationListParams,
  ApplicationListResponse,
  ApplicationSummary,
} from '../models';

import { request } from './client';
import { DEMO_TOKEN } from './demo';
import { DEMO_APPLICATIONS } from './demo-applications';
import { getToken } from './token';

// GET /api/v1/applications
export function getApplications(params: ApplicationListParams = {}): Promise<ApplicationListResponse> {
  if (getToken() === DEMO_TOKEN.access_token) {
    return getDemoApplications(params);
  }

  const query = new URLSearchParams();
  params.status?.forEach((status) => query.append('status', status));
  if (params.page) query.set('page', String(params.page));
  if (params.page_size) query.set('page_size', String(params.page_size));
  if (params.sort) query.set('sort', params.sort);

  const qs = query.toString();
  return request<ApplicationListResponse>(`/applications${qs ? `?${qs}` : ''}`);
}

// мок повторяет поведение бэкенда: фильтр по статусу, сортировка, пагинация
function getDemoApplications({
  status,
  page = 1,
  page_size = 10,
  sort = '-created_at',
}: ApplicationListParams): Promise<ApplicationListResponse> {
  const desc = sort.startsWith('-');
  const field = (desc ? sort.slice(1) : sort) as 'created_at' | 'updated_at' | 'requested_amount';

  const value = (item: ApplicationSummary) =>
    field === 'requested_amount' ? item.requested_amount.value : Date.parse(item[field]);

  const filtered = DEMO_APPLICATIONS.filter((item) => !status?.length || status.includes(item.status))
    .slice()
    .sort((a, b) => (desc ? value(b) - value(a) : value(a) - value(b)));

  const start = (page - 1) * page_size;

  // небольшая задержка, чтобы было видно состояние загрузки
  return new Promise((resolve) =>
    setTimeout(
      () =>
        resolve({
          items: filtered.slice(start, start + page_size),
          page,
          page_size,
          total: filtered.length,
        }),
      300,
    ),
  );
}
