import type { AccountSummary } from './account';
import type { Company } from './company';

export type UserRole =
  | 'owner'
  | 'director'
  | 'cfo'
  | 'accountant'
  | 'finance_employee'
  | 'authorized_employee';

export interface User {
  id: string;
  first_name: string;
  middle_name: string | null;
  birth_date: string | null;
  role: UserRole | null;
  company: Company | null;
  accounts: AccountSummary[];
}
