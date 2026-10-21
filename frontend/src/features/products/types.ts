import type { Disbursement, LegalForm, Money, NeedType, ProductCode, PurposeCode } from '@/shared/types/common';

export type Product = {
  code: ProductCode;
  name: string;
  description: string;
  purposes: PurposeCode[];
  need_types: NeedType[];
  disbursement: Disbursement[];
  amount_min: Money;
  amount_max: Money;
  term_min_months: number;
  term_max_months: number;
  rate_from_percent: number;
  collateral: 'none' | 'optional' | 'required';
  min_business_age_months: number;
  legal_forms: LegalForm[];
  suits: string[];
  not_suits: string[];
  required_document_types: string[];
  decision_time_text: string;
  is_fictional: boolean;
  source_note: string | null;
};

export type PaymentScheduleRow = {
  n: number;
  date: string;
  payment: Money;
  principal: Money;
  interest: Money;
  balance: Money;
};

export type PaymentCalcRequest = {
  amount: Money;
  term_months: number;
  rate_percent: number;
  schedule: 'annuity';
};

export type PaymentCalcResponse = {
  monthly_payment: Money;
  total_payment: Money;
  overpayment: Money;
  schedule: PaymentScheduleRow[];
};

export type PreapprovedOffer = {
  offer_id: string;
  product: Pick<Product, 'code' | 'name'>;
  limit: Money;
  term_months: number;
  valid_until: string;
  conditions_fixed: boolean;
  source: 'alfa_lk';
};
