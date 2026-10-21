import type { ReadinessShort } from '@/features/company/types';
import type { Product } from '@/features/products/types';
import type { CollateralType, Disbursement, FitLevel, Money, NeedType, Preference, PurposeCode, TextSource, Urgency } from '@/shared/types/common';

export type MatchingNeed = {
  purpose: PurposeCode | null;
  amount: Money | null;
  term_months: number | null;
  need_type: NeedType | null;
  disbursement: Disbursement | null;
  urgency: Urgency | null;
  collateral: CollateralType | null;
};

export type MatchingExtra = {
  expected_payments: {
    counterparty: string;
    amount: Money;
    date: string;
    source: 'alfa_lk' | 'client';
  }[];
  other_bank_turnover_monthly: Money | null;
  own_funds: Money | null;
  collateral_details: {
    type: CollateralType;
    description: string;
    estimated_value: Money;
  } | null;
  preference: Preference | null;
  skipped: boolean;
};

export type MatchingSession = {
  id: string;
  status: 'draft' | 'completed';
  step: 1 | 2 | 3 | 4;
  need: MatchingNeed;
  finance_confirmed: boolean;
  extra: MatchingExtra;
  updated_at: string;
};

export type MatchingSessionPatch = {
  need?: Partial<MatchingNeed>;
  extra?: Partial<MatchingExtra>;
  finance_confirmed?: boolean;
  step?: 1 | 2 | 3 | 4;
};

export type LoadCalc = {
  free_cash_flow: Money;
  current_payments: Money;
  new_payment: Money;
  load_percent: number;
  threshold_percent: number;
  target_percent: number;
};

export type Recommendation = {
  rank: number;
  product: Pick<Product, 'code' | 'name' | 'is_fictional'>;
  amount: Money;
  term_months: number;
  rate_percent: number;
  monthly_payment: Money;
  overpayment: Money;
  load: LoadCalc;
  fit: FitLevel;
  fit_label: string;
  reasons: { code: string; text: string; data_ref: string | null }[];
};

export type RecommendWarning = {
  code: 'LOAD_ABOVE_THRESHOLD' | 'TERM_EXTENDED' | 'COLLATERAL_NEEDED' | 'DATA_STALE';
  text: string;
  suggested: { amount: Money; term_months: number } | null;
};

export type RecommendResponse = {
  session_id: string;
  is_preliminary: boolean;
  primary: Recommendation;
  alternatives: Recommendation[];
  requested: { amount: Money; term_months: number; load: LoadCalc };
  warnings: RecommendWarning[];
  readiness: ReadinessShort;
  submit_requirements_text: string;
  text_source: TextSource;
};
