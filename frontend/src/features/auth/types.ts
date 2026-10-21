export type LoginRequest = { login: string; password: string };

export type TokenResponse = { access_token: string; token_type: 'Bearer'; expires_in: number };

export type InviteAcceptRequest = {
  invite_code: string;
  password: string;
  first_name?: string;
  last_name?: string;
};

export type InviteAcceptResponse = { status: 'pending_approval'; login: string };
