import type { InfoRequest } from '@/features/info-requests/types';
import type { LoadCalc } from '@/features/matching/types';
import type { SigningState } from '@/features/signing/types';
import type { ApplicationStatus, AvailableAction, CollateralType, DataSource, Money, Paginated, Person, ProductCode, PurposeCode, TextSource } from '@/shared/types/common';

export type ApplicationSummary = {
  id: string;
  number: string;
  product: { code: ProductCode; name: string };
  purpose: string;
  requested_amount: Money;
  requested_term_months: number;
  approved_amount: Money | null;
  approved_term_months: number | null;
  status: ApplicationStatus;
  required_action: string | null;
  awaiting_from: Person | null;
  available_actions: AvailableAction[];
  created_at: string;
  updated_at: string;
};

export type ApplicationCounters = {
  drafts: number;
  in_bank: number;
  awaiting_signing: number;
  finished: number;
};

export type ApplicationsListResponse = Paginated<ApplicationSummary> & {
  counters: ApplicationCounters;
};

export type ApplicationSortField = 'created_at' | 'updated_at' | 'requested_amount';

export type ApplicationSort = ApplicationSortField | `-${ApplicationSortField}`;

export type ApplicationListParams = {
  status?: ApplicationStatus[];
  page?: number;
  page_size?: number;
  sort?: ApplicationSort;
};

export type CreateApplicationRequest = {
  source: 'recommendation' | 'catalog' | 'preapproved';
  matching_session_id?: string;
  recommendation_rank?: number;
  keep_requested?: boolean;
  offer_id?: string;
  product_code?: ProductCode;
  amount?: Money;
  term_months?: number;
  purpose_code?: PurposeCode;
  purpose?: string;
};

export type FormStep = 'params' | 'company' | 'finance' | 'collateral' | 'documents' | 'review';

export type ApplicationCollateral = {
  type: CollateralType;
  description: string | null;
  estimated_value: Money | null;
};

export type TimelineEvent = {
  at: string;
  status: ApplicationStatus;
  title: string;
  description: string | null;
  actor: { type: 'client' | 'bank' | 'system'; name: string | null };
};

export type StatusText = {
  now: string;
  next: string;
  actor: 'client' | 'bank' | 'system';
  due_at: string | null;
};

export type CallNote = {
  id: string;
  stage: ApplicationStatus;
  stage_title: string;
  called_at: string;
  duration_minutes: number | null;
  topic: string;
  summary: string;
  agreements: string[];
  next_step: string | null;
  next_step_due: string | null;
  author_name: string;
};

export type CallNoteCreate = {
  topic: string;
  summary: string;
  agreements: string[];
  next_step?: string;
  next_step_due?: string;
  duration_minutes?: number;
};

export type ApplicationDetail = ApplicationSummary & {
  purpose_code: PurposeCode;
  rate_percent: number;
  monthly_payment_estimate: Money;
  load_at_submit: LoadCalc | null;
  client_warning_accepted: boolean;
  collateral: ApplicationCollateral | null;
  form: { step: FormStep; data: Record<string, unknown>; saved_at: string };
  timeline: TimelineEvent[];
  status_text: StatusText;
  info_requests: InfoRequest[];
  calls: CallNote[];
  decision: Decision | null;
  signing: SigningState | null;
  version: number;
};

export type ApplicationPatch = {
  version: number;
  form?: { step?: FormStep; data?: Record<string, unknown> };
  amount?: Money;
  term_months?: number;
  collateral?: ApplicationCollateral | null;
};

export type RequirementCode =
  | 'consent_bki'
  | 'consent_pd'
  | 'company_docs'
  | 'fin_statements_2025'
  | 'other_bank_statements'
  | 'collateral_docs';

export type Requirement = {
  code: RequirementCode;
  title: string;
  necessity: 'required' | 'situational';
  status: 'done' | 'missing' | 'not_needed';
  source: DataSource | 'documents' | null;
  note: string | null;
  action: {
    type: 'sign' | 'upload' | 'pick_document' | 'none';
    document_type: string | null;
  } | null;
};

export type RequirementsResponse = { items: Requirement[]; can_submit: boolean };

export type DecisionFactor = {
  code: string;
  title: string;
  impact: 'positive' | 'negative' | 'neutral';
  text: string;
};

export type Decision = {
  type: 'approved' | 'counter_offer' | 'rejected';
  decided_at: string;
  decided_by: 'auto' | 'underwriter';
  requested: { amount: Money; term_months: number };
  offered: {
    product: { code: ProductCode; name: string };
    amount: Money;
    term_months: number;
    rate_percent: number;
    monthly_payment: Money;
    overpayment: Money;
  } | null;
  offer_valid_until: string | null;
  factors: DecisionFactor[];
  explanation_text: string;
  improve_tips: string[];
  text_source: TextSource;
};
