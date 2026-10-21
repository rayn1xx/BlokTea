import type { BankRole, HomeProfile, LegalForm, Money, Permission, Person, UserRole } from '@/shared/types/common';

export type Company = {
  id: string;
  legal_form: LegalForm;
  inn: string;
  ogrn: string;
  kpp: string | null;
  full_name: string;
  short_name: string;
  registration_date: string;
  okved_main: string;
  okved_additional: string[];
  legal_address: string;
  registry_status: 'active' | 'liquidating' | 'liquidated';
  msp_category: 'micro' | 'small' | 'medium' | null;
  employees_count: number | null;
  director: Person | null;
  verification: { source: string; verified_at: string };
  created_at: string;
  updated_at: string;
};

export type AccountSummary = {
  id: string;
  owner_type: 'company' | 'user';
  type: 'settlement' | 'current' | 'deposit' | 'credit';
  currency: string;
  name: string | null;
  is_primary: boolean;
  current_money: Money;
};

export type Onboarding = {
  completed: boolean;
  progress_percent: number;
  next_step: 'registry_confirm' | 'company_details' | null;
};

export type Home = {
  id: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  birth_date: string | null;
  role: UserRole | null;
  permissions: Permission[];
  home_profile: HomeProfile;
  bank_role: BankRole | null;
  company: Company | null;
  accounts: AccountSummary[];
  onboarding: Onboarding;
  unread_notifications: number;
};
