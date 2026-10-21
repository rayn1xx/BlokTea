import type { Company } from '@/features/profile/types';
import type { AvailableAction, CollateralType, Money, ReadinessStatus, Sourced, TaxRegime, TextSource } from '@/shared/types/common';

export type ExternalDebt = { lender: string; balance: Money; monthly_payment: Money };

export type CompanyProfile = {
  company: Company;
  registry: {
    source: 'EGRUL' | 'EGRIP';
    fetched_at: string;
    confirmed: boolean;
    issue_comment: string | null;
  };
  from_lk: {
    employees_count: Sourced<number | null>;
    monthly_inflow_avg: Sourced<Money>;
    tax_regime: Sourced<TaxRegime | null>;
    alfa_loans: Sourced<{ count: number; monthly_payment: Money }>;
  };
  client_input: {
    external_debts: ExternalDebt[];
    collateral_available: CollateralType[];
  };
  completeness_percent: number;
  available_actions: AvailableAction[];
};

export type RegistryConfirmRequest = { confirmed: boolean; issue_comment?: string };

export type CompanyDetailsPatch = {
  external_debts?: ExternalDebt[];
  collateral_available?: CollateralType[];
  employees_count?: number | null;
  monthly_inflow_avg?: Money;
  tax_regime?: TaxRegime | null;
};

export type FinanceDebt = {
  lender: string;
  source: 'alfa_lk' | 'bki' | 'client';
  balance: Money;
  monthly_payment: Money;
  overdue: boolean;
};

export type FinanceSummary = {
  period: { from: string; to: string };
  monthly_inflow_avg: Sourced<Money>;
  monthly_operating_outflow_avg: Sourced<Money>;
  free_cash_flow: Sourced<Money>;
  months: { month: string; inflow: Money; outflow: Money }[];
  seasonality: { low_months: number[]; text: string } | null;
  debts: { items: FinanceDebt[]; total_monthly_payment: Money };
  multibank_connected: boolean;
  stale: { reason: 'no_fin_statements_2025' | 'old_statement' | null; text: string | null };
  confirmed_at: string | null;
};

export type FinanceSummaryPatch = {
  monthly_inflow_avg?: Money;
  monthly_operating_outflow_avg?: Money;
  debts_add?: Omit<FinanceDebt, 'source' | 'overdue'>[];
  confirm?: true;
};

export type ReadinessItemCode =
  | 'business_age'
  | 'debt_load'
  | 'tax_debt'
  | 'credit_history'
  | 'documents'
  | 'turnover'
  | 'registry_status';

export type ReadinessItem = {
  code: ReadinessItemCode;
  title: string;
  status: ReadinessStatus;
  value_text: string;
  explanation: string;
  how_to_improve: string | null;
  action: {
    type: 'upload_document' | 'fill_details' | 'none';
    document_type: string | null;
    route: string | null;
  } | null;
};

export type ReadinessShort = {
  ok_count: number;
  total: number;
  items: Pick<ReadinessItem, 'code' | 'title' | 'status'>[];
};

export type Readiness = {
  level: 'high' | 'medium' | 'low';
  ok_count: number;
  total: number;
  items: ReadinessItem[];
  summary_text: string;
  text_source: TextSource;
  disclaimer: string;
  calculated_at: string;
};
