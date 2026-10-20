// TODO: временная заглушка, пока бэкенд не готов — удалить файл, когда заработают /auth/login и /home
import type { TokenResponse, User } from '../models';

export const DEMO_CREDENTIALS = { login: 'ivanov@test.local', password: 'demo123' };

export const DEMO_TOKEN: TokenResponse = {
  access_token: 'demo-access-token',
  token_type: 'Bearer',
  expires_in: 900,
};

export const DEMO_PROFILE: User = {
  id: '7f3c2a9e-1b4d-4e8a-9c21-5d6f7a8b9c01',
  first_name: 'Иван',
  middle_name: 'Петрович',
  birth_date: '1985-04-12',
  role: "owner",
  company: null,
  accounts: [],
};
