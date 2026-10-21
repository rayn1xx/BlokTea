import type { ApplicationCollateral, Decision, FormStep, TimelineEvent } from '@/features/applications/types';
import type { CheckResult, ScoringResult, ScoringThresholds } from '@/features/bank/types';
import type { CompanyProfile, FinanceSummary } from '@/features/company/types';
import type { DocumentRef } from '@/features/documents/types';
import type { InfoRequest } from '@/features/info-requests/types';
import type { Loan } from '@/features/loans/types';
import type { LoadCalc, MatchingSession, RecommendResponse } from '@/features/matching/types';
import type { Notification } from '@/features/notifications/types';
import type { Member, SigningRules } from '@/features/team/types';
import type { ApplicationStatus, Money, ProductCode, PurposeCode, SignerStatus, SigningDocumentType } from '@/shared/types/common';

import { DEFAULT_THRESHOLDS, rub, SEED_COMPANIES, SEED_FINANCE, SEED_LOANS, SEED_MEMBERS, SEED_SIGNING_RULES, type UserRecord, USERS } from './fixtures';

const STORAGE_KEY = 'alfa-credit-mock-db-v2';

export type AppRecord = {
  id: string;
  number: string;
  company_id: string;
  created_by: string;
  product_code: ProductCode;
  purpose_code: PurposeCode;
  purpose: string;
  requested_amount: Money;
  requested_term_months: number;
  approved_amount: Money | null;
  approved_term_months: number | null;
  rate_percent: number;
  status: ApplicationStatus;
  collateral: ApplicationCollateral | null;
  client_warning_accepted: boolean;
  load_at_submit: LoadCalc | null;
  form: { step: FormStep; data: Record<string, unknown>; saved_at: string };
  timeline: TimelineEvent[];
  info_requests: InfoRequest[];
  decision: Decision | null;
  signers: {
    order: number;
    user_id: string;
    document: SigningDocumentType;
    status: SignerStatus;
    signed_at: string | null;
  }[];
  consents: { consent_bki: boolean; consent_pd: boolean };
  version: number;
  created_at: string;
  updated_at: string;
  auto_check_at: number | null;
  handoff_to: string | null;
  bank: {
    assignee_user_id: string | null;
    queued_at: string | null;
    score: ScoringResult | null;
    checks: CheckResult[];
    auto_decided: boolean;
    ai_summary: {
      text: string;
      risks: string[];
      to_check: string[];
      text_source: 'llm' | 'template';
      generated_at: string;
    } | null;
    audit: { at: string; actor: string; action: string; details: string | null }[];
  };
};

export type DocRecord = DocumentRef & { company_id: string; analyze_at: number | null; data_url: string | null };

export type SessionRecord = MatchingSession & {
  company_id: string;
  user_id: string;
  last_recommendation: RecommendResponse | null;
};

export type CompanyRecord = Omit<CompanyProfile, 'available_actions'> & {
  onboarding_completed: boolean;
};

export type DbState = {
  users: UserRecord[];
  seq: { application: number; doc: number; misc: number };
  companies: Record<string, CompanyRecord>;
  members: (Member & { company_id: string })[];
  finance: Record<string, FinanceSummary>;
  signingRules: Record<string, SigningRules>;
  sessions: Record<string, SessionRecord>;
  applications: Record<string, AppRecord>;
  documents: Record<string, DocRecord>;
  loans: (Loan & { company_id: string })[];
  notifications: (Notification & { user_id: string })[];
  taskAssignees: Record<string, string>;
  handoffs: { id: string; application_id: string; to_user_id: string; from_user_id: string; created_at: string }[];
  invites: { code: string; member_id: string; expires_at: string }[];
  challenges: Record<string, { code: string; user_id: string; application_id: string; kind: string; expires_at: string }>;
  thresholds: ScoringThresholds;
  usedPreapproved: string[];
};

function seed(): DbState {
  const now = iso();
  return {
    users: structuredClone(USERS),
    seq: { application: 1043, doc: 1, misc: 1 },
    companies: structuredClone(SEED_COMPANIES),
    members: structuredClone(SEED_MEMBERS),
    finance: structuredClone(SEED_FINANCE),
    signingRules: structuredClone(SEED_SIGNING_RULES),
    sessions: {},
    applications: seedApplications(),
    documents: seedDocuments(),
    loans: structuredClone(SEED_LOANS),
    notifications: [
      {
        id: 'n-1',
        user_id: 'u-smirnov',
        created_at: now,
        read: false,
        title: 'Предодобренный лимит 1 200 000 ₽',
        text: 'Можно оформить до 30 ноября без подтверждения цели',
        application_id: null,
        route: '/home',
      },
      {
        id: 'n-2',
        user_id: 'u-smirnov',
        created_at: now,
        read: false,
        title: 'Новый сотрудник ждёт подтверждения',
        text: 'Ковалёв Дмитрий получил приглашение в кабинет',
        application_id: null,
        route: '/team',
      },
    ],
    taskAssignees: {},
    handoffs: [],
    invites: [{ code: '4821-KX', member_id: 'm-kovalev', expires_at: '2026-10-28T23:59:00+03:00' }],
    challenges: {},
    thresholds: { ...DEFAULT_THRESHOLDS },
    usedPreapproved: [],
  };
}

function baseApp(partial: Partial<AppRecord> & Pick<AppRecord, 'id' | 'number' | 'company_id' | 'status'>): AppRecord {
  const created = partial.created_at ?? '2026-09-10T10:00:00+03:00';
  return {
    created_by: 'u-smirnov',
    product_code: 'working_capital',
    purpose_code: 'working_capital',
    purpose: 'Закупка сырья',
    requested_amount: rub(1_000_000),
    requested_term_months: 12,
    approved_amount: null,
    approved_term_months: null,
    rate_percent: 15,
    collateral: null,
    client_warning_accepted: false,
    load_at_submit: null,
    form: { step: 'params', data: {}, saved_at: created },
    timeline: [
      {
        at: created,
        status: 'draft',
        title: 'Заявка создана',
        description: null,
        actor: { type: 'client', name: null },
      },
    ],
    info_requests: [],
    decision: null,
    signers: [],
    consents: { consent_bki: false, consent_pd: false },
    version: 1,
    created_at: created,
    updated_at: created,
    auto_check_at: null,
    handoff_to: null,
    bank: { assignee_user_id: null, queued_at: null, score: null, checks: [], auto_decided: false, ai_summary: null, audit: [] },
    ...partial,
  };
}

function seedApplications(): Record<string, AppRecord> {
  const list: AppRecord[] = [
    baseApp({
      id: 'app-1037',
      number: 'КЗ-2026-001037',
      company_id: 'c-mph',
      status: 'draft',
      created_by: 'u-les',
      product_code: 'overdraft',
      purpose_code: 'current_expenses',
      purpose: 'Кассовые разрывы',
      requested_amount: rub(600_000),
      requested_term_months: 12,
      rate_percent: 17,
      created_at: '2026-10-14T11:20:00+03:00',
      updated_at: '2026-10-14T11:20:00+03:00',
    }),
    baseApp({
      id: 'app-1029',
      number: 'КЗ-2026-001029',
      company_id: 'c-mph',
      status: 'rejected',
      product_code: 'credit_line',
      purpose_code: 'gov_contract',
      purpose: 'Исполнение госконтракта',
      requested_amount: rub(5_000_000),
      requested_term_months: 24,
      created_at: '2026-09-02T10:00:00+03:00',
      updated_at: '2026-09-05T16:00:00+03:00',
      decision: {
        type: 'rejected',
        decided_at: '2026-09-05T16:00:00+03:00',
        decided_by: 'underwriter',
        requested: { amount: rub(5_000_000), term_months: 24 },
        offered: null,
        offer_valid_until: null,
        factors: [
          { code: 'debt_load', title: 'Долговая нагрузка', impact: 'negative', text: 'Платежи заняли бы больше половины свободного денежного потока' },
          { code: 'business_age', title: 'Срок работы бизнеса', impact: 'positive', text: 'Компания давно работает' },
        ],
        explanation_text: 'Сейчас платёж по такой сумме слишком большой для оборотов компании',
        improve_tips: ['Уменьшите сумму до 2 000 000 ₽', 'Погасите часть текущих кредитов'],
        text_source: 'llm',
      },
    }),
    baseApp({
      id: 'app-1018',
      number: 'КЗ-2026-001018',
      company_id: 'c-mph',
      status: 'cancelled',
      product_code: 'express',
      purpose_code: 'repair',
      purpose: 'Ремонт цеха',
      requested_amount: rub(400_000),
      requested_term_months: 12,
      created_at: '2026-08-11T10:00:00+03:00',
      updated_at: '2026-08-12T09:00:00+03:00',
    }),

    baseApp({
      id: 'app-1040',
      number: 'КЗ-2026-001040',
      company_id: 'c-orlova',
      status: 'in_review',
      created_by: 'u-orlova',
      product_code: 'investment',
      purpose_code: 'equipment',
      purpose: 'Печь для пекарни',
      requested_amount: rub(900_000),
      requested_term_months: 24,
      created_at: '2026-10-20T15:10:00+03:00',
      updated_at: '2026-10-20T15:12:00+03:00',
      bank: {
        assignee_user_id: null,
        queued_at: '2026-10-20T15:12:00+03:00',
        score: null,
        checks: [],
        auto_decided: false,
        ai_summary: null,
        audit: [],
      },
    }),
  ];
  for (const app of list) {
    if (app.status !== 'draft') {
      app.timeline.push({
        at: app.updated_at,
        status: app.status,
        title: app.status === 'cancelled' ? 'Заявка отозвана' : app.status === 'rejected' ? 'Решение банка' : 'Заявка на рассмотрении',
        description: null,
        actor: { type: app.status === 'cancelled' ? 'client' : 'bank', name: null },
      });
    }
  }
  return Object.fromEntries(list.map((a) => [a.id, a]));
}

function seedDocuments(): Record<string, DocRecord> {
  const doc: DocRecord = {
    id: 'doc-1',
    company_id: 'c-mph',
    document_type: 'company_docs',
    title: 'Устав и решение о назначении директора',
    scope: 'company',
    application_id: null,
    info_request_id: null,
    file_name: 'ustav_mashpromhoz.pdf',
    size_bytes: 1_840_000,
    version: 1,
    uploaded_by: { user_id: 'u-smirnov', name: 'Смирнов П. И.', role: 'owner' },
    uploaded_at: '2026-06-10T12:00:00+03:00',
    origin: 'alfa_lk',
    status: 'accepted',
    status_reason: null,
    expires_at: null,
    analysis: {
      status: 'done',
      detected_type: 'company_docs',
      detected_type_confidence: 0.97,
      extracted_fields: [
        { key: 'inn', label: 'ИНН', value: '7700000001', confidence: 0.99 },
        { key: 'director', label: 'Директор', value: 'Смирнов Пётр Иванович', confidence: 0.95 },
      ],
      checks: [
        { code: 'inn_match', passed: true, text: 'ИНН совпадает с ИНН компании' },
        { code: 'type_match', passed: true, text: 'Тип документа определён верно' },
      ],
      issues: [],
      model: 'qwen2.5-vl-7b',
      text_source: 'llm',
      analyzed_at: '2026-06-10T12:01:00+03:00',
    },
    analyze_at: null,
    data_url: null,
  };
  return { [doc.id]: doc };
}

let state: DbState = load();

function load(): DbState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as DbState;
  } catch {
  }
  return seed();
}

export function db() {
  return state;
}

export function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
  }
}

export function resetDb() {
  state = seed();
  save();
}

export function iso(date = new Date()) {
  const msk = new Date(date.getTime() + 3 * 60 * 60 * 1000);
  return `${msk.toISOString().slice(0, 19)}+03:00`;
}

export function nextId(prefix: string) {
  state.seq.misc += 1;
  return `${prefix}-${Date.now().toString(36)}-${state.seq.misc}`;
}

export function notify(userIds: string[], n: Omit<Notification, 'id' | 'created_at' | 'read'>) {
  for (const userId of new Set(userIds)) {
    state.notifications.unshift({ ...n, id: nextId('n'), user_id: userId, created_at: iso(), read: false });
  }
}
