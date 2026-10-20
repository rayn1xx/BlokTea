import type { User } from '../models';

import { request } from './client';
import { DEMO_PROFILE, DEMO_TOKEN } from './demo';
import { getToken } from './token';

export function getHome(): Promise<User> {
  if (getToken() === DEMO_TOKEN.access_token) {
    return Promise.resolve(DEMO_PROFILE);
  }

  return request<User>('/home');
}
