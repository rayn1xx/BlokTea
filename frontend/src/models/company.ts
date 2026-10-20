export type LegalForm = 'IP' | 'OOO';

export type RegistryStatus = 'active' | 'liquidating' | 'liquidated';

export type MspCategory = 'micro' | 'small';

export interface Verification {
  source: string;
  verified_at: string;
}

export interface Company {
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
  registry_status: RegistryStatus;
  msp_category: MspCategory | null;
  employees_count: number | null;
  verification: Verification;
  created_at: string;
  updated_at: string;
}
