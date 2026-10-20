export interface LoginRequest {
  login: string;
  password: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
}
