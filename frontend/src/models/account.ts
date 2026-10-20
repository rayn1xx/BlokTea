export type AccountOwnerType = 'company' | 'user';

export type AccountType = 'settlement' | 'current' | 'deposit' | 'credit';

export interface AccountSummary {
  id: string;
  owner_type: AccountOwnerType;
  type: AccountType;
  currency: string;
  name: string | null;
  is_primary: boolean;
  current_money: number;
}
