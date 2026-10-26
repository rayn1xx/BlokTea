import type { ApplicationDetail, ApplicationSummary } from '@/features/applications/types';
import type { CompanyProfile, FinanceSummary } from '@/features/company/types';
import type { DocumentRef } from '@/features/documents/types';
import type { LoadCalc } from '@/features/matching/types';
import type { ApplicationStatus, LegalForm, Money, Person, ProductCode, TextSource } from '@/shared/types/common';

export type BankQueueItem = ApplicationSummary & {
  company: { id: string; short_name: string; legal_form: LegalForm; inn: string };
  score: number | null;
  risk_level: 'low' | 'medium' | 'high' | null;
  checks_status: 'ok' | 'warning' | 'stop';
  checks_hint: string | null;
  auto_decided: boolean;
  in_queue_minutes: number;
  assignee: Person | null;
};

export type CheckResult = {
  source: 'registry' | 'credit_bureau' | 'turnover' | 'fns_transparent' | 'load';
  status: 'ok' | 'warning' | 'stop' | 'error';
  summary: string;
  details: Record<string, unknown>;
  checked_at: string;
  is_mock: true;
};

export type ScoringThresholds = {
  approve_min: number;
  counter_offer_min: number;
  manual_review_min: number;
  load_threshold_percent: number;
  load_target_percent: number;
};

export type ScoringResult = {
  total: number;
  factors: {
    code: 'business_age' | 'credit_history' | 'debt_load' | 'industry' | 'turnover';
    title: string;
    value_text: string;
    points: number;
    max_points: number;
  }[];
  thresholds: ScoringThresholds;
  outcome: 'approved' | 'counter_offer' | 'manual_review' | 'rejected';
  stop_factors: string[];
};

export type BankApplicationDetail = ApplicationDetail & {
  company: CompanyProfile;
  finance: FinanceSummary;
  checks: CheckResult[];
  scoring: ScoringResult;
  documents: DocumentRef[];
  ai_summary: {
    text: string;
    risks: string[];
    to_check: string[];
    text_source: TextSource;
    generated_at: string;
  } | null;
  audit: { at: string; actor: string; action: string; details: string | null }[];
};

export type CounterOfferOption = {
  product_code: ProductCode;
  product_name: string;
  amount: Money;
  term_months: number;
  rate_percent: number;
  monthly_payment: Money;
  load: LoadCalc;
  score: number;
};

export type BankDecisionRequest =
  | { type: 'approve'; comment?: string }
  | {
      type: 'counter_offer';
      amount: Money;
      term_months: number;
      product_code?: ProductCode;
      rate_percent: number;
      reason_code: string;
      comment?: string;
    }
  | {
      type: 'request_info';
      template_code?: string;
      question: string;
      requested_document_types: string[];
      due_at: string;
      purpose_text?: string;
    }
  | { type: 'reject'; reason_codes: string[]; comment?: string };

export type BankDashboard = {
  period: '7d';
  by_status: Record<ApplicationStatus, number>;
  avg_decision_minutes: number;
  auto_decision_share: number;
  info_request_share: number;
};

export type BankQueueParams = {
  status?: ApplicationStatus[];
  risk?: 'high';
  checks?: 'stop';
  mine?: boolean;
  sort?: 'risk' | 'queue_time';
};

export type InfoRequestTemplate = {
  code: string;
  title: string;
  question: string;
  requested_document_types: string[];
};

export type RejectionReason = { code: string; title: string };
