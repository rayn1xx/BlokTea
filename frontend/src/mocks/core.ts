import { HttpResponse } from 'msw';

import type { ApplicationDetail, ApplicationSummary, Decision } from '@/features/applications/types';
import type { SigningState } from '@/features/signing/types';
import type { Task, TaskScope } from '@/features/tasks/types';
import type { Member } from '@/features/team/types';
import type { ApplicationStatus, AvailableAction, ErrorCode, Permission, Person, UserRole } from '@/shared/types/common';

import { type AppRecord, db, type DocRecord, iso, notify, save } from './db';
import { DEFAULT_PERMISSIONS, PRODUCTS, type UserRecord } from './fixtures';
import { autoChecks, calcPayment, decisionFactors, defaultStatusText, formatRub, loadCalc, scoreApplication } from './logic';

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: ErrorCode,
    message: string,
    public details: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

export function fail(status: number, code: ErrorCode, message: string, details: Record<string, unknown> = {}): never {
  throw new HttpError(status, code, message, details);
}

export function errorResponse(e: unknown) {
  if (e instanceof HttpError) {
    return HttpResponse.json(
      { error: { code: e.code, message: e.message, details: e.details } },
      { status: e.status },
    );
  }
  console.error('[mocks]', e);
  return HttpResponse.json(
    { error: { code: 'BAD_REQUEST', message: 'Ошибка в моке', details: {} } },
    { status: 500 },
  );
}

export const TOKEN_PREFIX = 'mock-token.';

export function tokenFor(userId: string) {
  return `${TOKEN_PREFIX}${userId}.${Date.now().toString(36)}`;
}

export function currentUser(request: Request): UserRecord {
  const header = request.headers.get('Authorization') ?? '';
  const token = header.replace(/^Bearer\s+/, '');
  if (!token.startsWith(TOKEN_PREFIX)) fail(401, 'UNAUTHORIZED', 'Нужна авторизация');
  const userId = token.slice(TOKEN_PREFIX.length).split('.')[0];
  const user = db().users.find((u) => u.id === userId);
  if (!user) fail(401, 'UNAUTHORIZED', 'Нужна авторизация');
  return user;
}

export function memberOf(userId: string) {
  return db().members.find((m) => m.user_id === userId && m.status === 'active') ?? null;
}

export type ClientContext = { user: UserRecord; member: Member & { company_id: string }; companyId: string };

export function clientContext(request: Request): ClientContext {
  const user = currentUser(request);
  const member = memberOf(user.id);
  if (!user.company_id || !member) {
    fail(403, 'NO_COMPANY_ROLE', 'Нет доступа к компании. Обратитесь к собственнику бизнеса');
  }
  return { user, member, companyId: user.company_id };
}

export function bankContext(request: Request) {
  const user = currentUser(request);
  if (!user.bank_role) fail(403, 'FORBIDDEN_ACTION', 'Раздел только для сотрудников банка');
  return user;
}

export function has(member: Member, permission: Permission) {
  return member.permissions.includes(permission);
}

export function requirePermission(member: Member, permission: Permission) {
  if (!has(member, permission)) {
    const allowed = (Object.keys(DEFAULT_PERMISSIONS) as UserRole[]).filter((r) =>
      DEFAULT_PERMISSIONS[r].includes(permission),
    );
    fail(403, 'FORBIDDEN_ACTION', 'Действие недоступно для вашей роли', { allowed_roles: allowed });
  }
}

export function shortName(u: { last_name: string; first_name: string; middle_name: string | null }) {
  return `${u.last_name} ${u.first_name[0]}.${u.middle_name ? ` ${u.middle_name[0]}.` : ''}`;
}

export function person(userId: string): Person {
  const user = db().users.find((u) => u.id === userId);
  const m = db().members.find((x) => x.user_id === userId);
  return {
    user_id: userId,
    name: user ? shortName(user) : 'Сотрудник',
    role: m?.role ?? 'authorized_employee',
  };
}

export const ROLE_TITLES: Record<UserRole, string> = {
  owner: 'собственник',
  director: 'директор',
  cfo_or_accountant: 'бухгалтер',
  financing_employee: 'финансы',
  banking_employee: 'банковские продукты',
  authorized_employee: 'уполномоченный сотрудник',
};

function personTitle(userId: string) {
  const p = person(userId);
  const company = db().companies[db().users.find((u) => u.id === userId)?.company_id ?? ''];
  const isDirector = company?.company.director?.user_id === userId;
  return `${p.name} (${isDirector ? 'директор' : ROLE_TITLES[p.role]})`;
}

export function tick() {
  const now = Date.now();
  let changed = false;

  for (const app of Object.values(db().applications)) {
    if (app.status === 'submitted' && app.auto_check_at && now >= app.auto_check_at) {
      runAutoChecks(app);
      changed = true;
    }
  }

  for (const doc of Object.values(db().documents)) {
    if (doc.status === 'analyzing' && doc.analyze_at && now >= doc.analyze_at) {
      finishAnalysis(doc);
      changed = true;
    }
  }

  if (changed) save();
}

export function appLoad(app: AppRecord, amount = app.approved_amount ?? app.requested_amount, term = app.approved_term_months ?? app.requested_term_months) {
  const finance = db().finance[app.company_id];
  const payment = calcPayment(amount.value, term, app.rate_percent).monthly_payment.value;
  return loadCalc(finance, payment, db().thresholds);
}

export function ensureScoring(app: AppRecord) {
  if (app.bank.score) return app.bank.score;
  const company = db().companies[app.company_id].company;
  const finance = db().finance[app.company_id];
  const load = appLoad(app, app.requested_amount, app.requested_term_months);
  const hasOverdue = finance.debts.items.some((d) => d.overdue);
  app.bank.checks = autoChecks({ load, registryStatus: company.registry_status, hasOverdue, now: iso() });
  app.bank.score = scoreApplication({
    registrationDate: company.registration_date,
    finance,
    load,
    thresholds: db().thresholds,
    hasOverdue,
  });
  return app.bank.score;
}

function runAutoChecks(app: AppRecord) {
  app.auto_check_at = null;
  app.bank.score = null;
  const score = ensureScoring(app);
  setStatus(app, 'in_review', 'Проверка данных', 'Автопроверки: реестр, БКИ, обороты, ФНС', { type: 'system', name: null });
  app.bank.queued_at = iso();
  app.bank.audit.push({ at: iso(), actor: 'Система', action: 'Автопроверки и скоринг', details: `Балл ${score.total}` });

  if (score.outcome === 'approved') {
    app.bank.auto_decided = true;
    applyDecision(app, buildDecision(app, 'approved', 'auto'));
  } else if (score.outcome === 'rejected') {
    app.bank.auto_decided = true;
    applyDecision(app, buildDecision(app, 'rejected', 'auto'));
  }
}

export function buildDecision(
  app: AppRecord,
  type: Decision['type'],
  by: Decision['decided_by'],
  offer?: { amount: AppRecord['requested_amount']; term_months: number; product_code?: AppRecord['product_code']; rate_percent?: number },
): Decision {
  const score = ensureScoring(app);
  const factors = decisionFactors(score);
  const amount = offer?.amount ?? app.requested_amount;
  const term = offer?.term_months ?? app.requested_term_months;
  const code = offer?.product_code ?? app.product_code;
  const rate = offer?.rate_percent ?? app.rate_percent;
  const calc = calcPayment(amount.value, term, rate);
  const product = PRODUCTS.find((p) => p.code === code)!;
  const validUntil = new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString().slice(0, 10);

  const explanation: Record<Decision['type'], string> = {
    approved: 'Банк готов выдать кредит на условиях, которые вы просили',
    counter_offer: `Банк готов выдать ${formatRub(amount.value)} на ${term} мес. Так платёж по всем кредитам займёт меньше 30% свободного денежного потока, и бизнесу будет проще платить`,
    rejected: 'Сейчас платёж по такой сумме слишком большой для оборотов компании. Можно вернуться к заявке с другими условиями',
  };

  return {
    type,
    decided_at: iso(),
    decided_by: by,
    requested: { amount: app.requested_amount, term_months: app.requested_term_months },
    offered:
      type === 'rejected'
        ? null
        : {
            product: { code: product.code, name: product.name },
            amount,
            term_months: term,
            rate_percent: rate,
            monthly_payment: calc.monthly_payment,
            overpayment: calc.overpayment,
          },
    offer_valid_until: type === 'rejected' ? null : validUntil,
    factors,
    explanation_text: explanation[type],
    improve_tips:
      type === 'approved'
        ? []
        : [
            'Загрузите бухгалтерскую отчётность за 2025 год: она подтвердит выручку',
            'Погасите часть текущих кредитов, чтобы снизить нагрузку',
            'Увеличьте срок: платёж станет меньше',
          ],
    text_source: 'llm',
  };
}

export function applyDecision(app: AppRecord, decision: Decision) {
  app.decision = decision;
  if (decision.offered) {
    app.approved_amount = decision.offered.amount;
    app.approved_term_months = decision.offered.term_months;
    app.rate_percent = decision.offered.rate_percent;
    app.product_code = decision.offered.product.code;
  }
  const titles = { approved: 'Заявка одобрена', counter_offer: 'Банк предложил другие условия', rejected: 'Решение банка' };
  setStatus(app, decision.type, titles[decision.type], decision.explanation_text, {
    type: decision.decided_by === 'auto' ? 'system' : 'bank',
    name: null,
  });
  notify(companyUserIds(app.company_id, 'accept_offers').concat(app.created_by), {
    title: `${titles[decision.type]}: ${app.number}`,
    text: decision.explanation_text,
    application_id: app.id,
    route: `/applications/${app.id}`,
  });
}

export function setStatus(
  app: AppRecord,
  status: ApplicationStatus,
  title: string,
  description: string | null,
  actor: AppRecord['timeline'][number]['actor'],
) {
  app.status = status;
  app.updated_at = iso();
  app.version += 1;
  app.timeline.push({ at: app.updated_at, status, title, description, actor });
}

export function companyUserIds(companyId: string, permission?: Permission) {
  return db()
    .members.filter((m) => m.company_id === companyId && m.status === 'active' && m.user_id)
    .filter((m) => !permission || m.permissions.includes(permission))
    .map((m) => m.user_id!);
}

function guessType(doc: DocRecord) {
  const name = doc.file_name.toLowerCase();
  if (/(otchet|отчет|отчёт|balance|баланс|buh)/.test(name)) return 'fin_statements_2025';
  if (/(vypis|выпис|statement)/.test(name)) return 'other_bank_statements';
  if (/(zalog|залог|pts|птс)/.test(name)) return 'collateral_docs';
  if (/(ustav|устав)/.test(name)) return 'company_docs';
  if (/(decl|деклар)/.test(name)) return 'tax_return';
  return doc.document_type || 'fin_statements_2025';
}

export function finishAnalysis(doc: DocRecord) {
  const company = db().companies[doc.company_id].company;
  const detected = guessType(doc);
  const wrongInn = /(error|ошибк|chuzh|чуж)/.test(doc.file_name.toLowerCase());
  const llmStub = isLlmStub();

  if (llmStub) {
    doc.status = 'uploaded';
    doc.analysis = {
      status: 'unavailable',
      detected_type: null,
      detected_type_confidence: null,
      extracted_fields: [],
      checks: [],
      issues: [{ severity: 'info', text: 'Документ уйдёт на ручную проверку' }],
      model: null,
      text_source: 'template',
      analyzed_at: iso(),
    };
    doc.analyze_at = null;
    return;
  }

  doc.document_type = doc.document_type || detected;
  doc.status = wrongInn ? 'rejected' : 'accepted';
  doc.status_reason = wrongInn ? 'ИНН в документе не совпадает с ИНН компании' : null;
  doc.analysis = {
    status: 'done',
    detected_type: detected,
    detected_type_confidence: 0.93,
    extracted_fields: [
      { key: 'inn', label: 'ИНН', value: wrongInn ? '7799999999' : company.inn, confidence: 0.98 },
      { key: 'company', label: 'Организация', value: company.short_name, confidence: 0.95 },
      { key: 'period', label: 'Период', value: '2025 год', confidence: 0.9 },
    ],
    checks: [
      { code: 'inn_match', passed: !wrongInn, text: wrongInn ? 'ИНН в документе не совпадает с ИНН компании' : 'ИНН совпадает с ИНН компании' },
      { code: 'period_valid', passed: true, text: 'Период соответствует запросу' },
      { code: 'type_match', passed: true, text: 'Тип документа определён верно' },
      { code: 'signature_present', passed: true, text: 'Есть подпись и печать' },
    ],
    issues: wrongInn ? [{ severity: 'error', text: 'ИНН в документе не совпадает с ИНН компании' }] : [],
    model: 'qwen2.5-vl-7b',
    text_source: 'llm',
    analyzed_at: iso(),
  };
  doc.analyze_at = null;
}

export function isLlmStub() {
  try {
    return localStorage.getItem('mock-llm-stub') === 'true';
  } catch {
    return false;
  }
}

export function hasCompanyDoc(companyId: string, type: string) {
  return Object.values(db().documents).some(
    (d) => d.company_id === companyId && d.document_type === type && d.status !== 'rejected',
  );
}

const CANCELLABLE: ApplicationStatus[] = ['draft', 'submitted', 'in_review', 'info_requested', 'approved', 'counter_offer', 'signing'];

export function availableActions(app: AppRecord, member: Member): AvailableAction[] {
  const actions: AvailableAction[] = [];
  const submit = has(member, 'submit_applications');

  if (app.status === 'draft') {
    if (submit || app.handoff_to === member.user_id) actions.push('application.edit', 'consent.sign');
    if (submit) actions.push('application.submit');
    else if (has(member, 'upload_documents')) actions.push('application.handoff');
  }
  if (CANCELLABLE.includes(app.status) && submit) actions.push('application.cancel');
  if (has(member, 'upload_documents')) actions.push('document.upload');
  if (has(member, 'upload_documents') && member.role !== 'authorized_employee') actions.push('document.delete');
  if (app.status === 'info_requested' && has(member, 'upload_documents')) actions.push('info_request.respond');
  if ((app.status === 'approved' || app.status === 'counter_offer') && has(member, 'accept_offers')) {
    actions.push('offer.accept', 'offer.decline');
  }
  if (app.status === 'signing') {
    const signer = app.signers.find((s) => s.user_id === member.user_id && s.status !== 'signed');
    if (signer) actions.push('signing.sign');
    const rules = db().signingRules[app.company_id];
    if (rules.can_send_to_signing.includes(member.role)) actions.push('signing.remind');
  }
  return actions;
}

function awaitingFrom(app: AppRecord): Person | null {
  if (app.status === 'signing') {
    const next = app.signers.find((s) => s.status !== 'signed');
    return next ? person(next.user_id) : null;
  }
  if (app.status === 'approved' || app.status === 'counter_offer') {
    const owner = companyUserIds(app.company_id, 'accept_offers')[0];
    return owner ? person(owner) : null;
  }
  if (app.status === 'info_requested') {
    const rid = app.info_requests.find((r) => r.status === 'open')?.id;
    const assignee = rid ? db().taskAssignees[`ir:${rid}`] ?? app.created_by : app.created_by;
    return person(assignee);
  }
  if (app.status === 'draft' && app.handoff_to) return person(app.handoff_to);
  return null;
}

function requiredAction(app: AppRecord): string | null {
  switch (app.status) {
    case 'draft':
      return app.handoff_to ? 'Проверить и отправить заявку в банк' : 'Заполните заявку и отправьте в банк';
    case 'info_requested':
      return app.info_requests.find((r) => r.status === 'open')?.question ?? 'Ответьте на запрос банка';
    case 'approved':
      return 'Подтвердите условия, чтобы перейти к подписанию';
    case 'counter_offer':
      return 'Посмотрите предложение банка и примите решение';
    case 'signing':
      return 'Подпишите кредитный договор';
    default:
      return null;
  }
}

export function toSummary(app: AppRecord, member: Member | null): ApplicationSummary {
  const product = PRODUCTS.find((p) => p.code === app.product_code)!;
  return {
    id: app.id,
    number: app.number,
    product: { code: product.code, name: product.name },
    purpose: app.purpose,
    requested_amount: app.requested_amount,
    requested_term_months: app.requested_term_months,
    approved_amount: app.approved_amount,
    approved_term_months: app.approved_term_months,
    status: app.status,
    required_action: requiredAction(app),
    awaiting_from: awaitingFrom(app),
    available_actions: member ? availableActions(app, member) : [],
    created_at: app.created_at,
    updated_at: app.updated_at,
  };
}

export function signingState(app: AppRecord, userId: string | null): SigningState | null {
  if (!app.signers.length) return null;
  const mine = app.signers.find((s) => s.user_id === userId && s.status !== 'signed');
  const titles = { contract: 'Кредитный договор', surety: 'Договор поручительства', deal_approval: 'Одобрение сделки' };
  const docs = [...new Set(app.signers.map((s) => s.document))].map((type) => ({
    id: `sign-${app.id}-${type}`,
    title: titles[type],
    type,
    url: `/api/v1/documents/sign-${app.id}-${type}/file`,
  }));
  return {
    documents: docs,
    signers: app.signers.map((s) => ({
      order: s.order,
      person: person(s.user_id),
      document: s.document,
      status: s.status,
      signed_at: s.signed_at,
    })),
    signed_count: app.signers.filter((s) => s.status === 'signed').length,
    required_count: app.signers.length,
    can_current_user_sign: app.status === 'signing' && !!mine,
    current_user_document: mine?.document ?? null,
  };
}

export function toDetail(app: AppRecord, member: Member | null, userId: string | null): ApplicationDetail {
  const calc = calcPayment(
    (app.approved_amount ?? app.requested_amount).value,
    app.approved_term_months ?? app.requested_term_months,
    app.rate_percent,
  );
  return {
    ...toSummary(app, member),
    purpose_code: app.purpose_code,
    rate_percent: app.rate_percent,
    monthly_payment_estimate: calc.monthly_payment,
    load_at_submit: app.load_at_submit,
    client_warning_accepted: app.client_warning_accepted,
    collateral: app.collateral,
    form: app.form,
    timeline: app.timeline,
    status_text: defaultStatusText(app.status),
    info_requests: app.info_requests,
    decision: app.decision,
    signing: signingState(app, userId),
    version: app.version,
  };
}

export function findApp(id: string, companyId?: string) {
  const app = db().applications[id];
  if (!app || (companyId && app.company_id !== companyId)) fail(404, 'NOT_FOUND', 'Заявка не найдена');
  return app;
}

export function tasksFor(userId: string, companyId: string, scope: TaskScope): Task[] {
  const tasks: (Task & { assignee_id: string })[] = [];
  const apps = Object.values(db().applications).filter((a) => a.company_id === companyId);
  const member = memberOf(userId);

  for (const app of apps) {
    const ref = { id: app.id, number: app.number };

    for (const r of app.info_requests.filter((x) => x.status === 'open')) {
      const id = `ir:${r.id}`;
      const assignee = db().taskAssignees[id] ?? app.created_by;
      tasks.push({
        id,
        assignee_id: assignee,
        type: 'info_request',
        title: r.question,
        application: ref,
        assignee: person(assignee),
        waiting_for_text: assignee !== userId ? `Ждём: ${personTitle(assignee)}` : null,
        due_at: r.due_at,
        cta: { label: 'Загрузить', route: `/applications/${app.id}/info-requests/${r.id}` },
        available_actions: assignee === userId ? ['task.reassign'] : [],
        created_at: r.created_at,
      });
    }

    if (app.status === 'approved' || app.status === 'counter_offer') {
      const id = `offer:${app.id}`;
      const assignee = db().taskAssignees[id] ?? companyUserIds(companyId, 'accept_offers')[0];
      tasks.push({
        id,
        assignee_id: assignee,
        type: 'accept_offer',
        title: app.status === 'approved' ? `Заявка ${app.number} одобрена` : `Банк предложил другие условия по заявке ${app.number}`,
        application: ref,
        assignee: person(assignee),
        waiting_for_text: assignee !== userId ? `Решение принимает: ${personTitle(assignee)}` : null,
        due_at: app.decision?.offer_valid_until ?? null,
        cta: { label: 'Ознакомиться', route: `/applications/${app.id}` },
        available_actions: [],
        created_at: app.updated_at,
      });
    }

    if (app.status === 'signing') {
      for (const s of app.signers.filter((x) => x.status !== 'signed')) {
        const id = `sign:${app.id}:${s.user_id}`;
        tasks.push({
          id,
          assignee_id: s.user_id,
          type: 'sign',
          title: `Подписать ${s.document === 'contract' ? 'кредитный договор' : 'договор поручительства'} по заявке ${app.number}`,
          application: ref,
          assignee: person(s.user_id),
          waiting_for_text: s.user_id !== userId ? `Подписывает: ${personTitle(s.user_id)}` : null,
          due_at: null,
          cta: {
            label: s.user_id === userId ? 'Подписать' : 'Ознакомиться',
            route: `/applications/${app.id}/signing`,
          },
          available_actions: [],
          created_at: app.updated_at,
        });
      }
    }
  }

  for (const h of db().handoffs) {
    const app = db().applications[h.application_id];
    if (!app || app.company_id !== companyId || app.status !== 'draft') continue;
    const id = `handoff:${h.id}`;
    const assignee = db().taskAssignees[id] ?? h.to_user_id;
    tasks.push({
      id,
      assignee_id: assignee,
      type: 'send_application',
      title: `Проверить и отправить заявку ${app.number} в банк`,
      application: { id: app.id, number: app.number },
      assignee: person(assignee),
      waiting_for_text: assignee !== userId ? `Ждём: ${personTitle(assignee)}` : null,
      due_at: null,
      cta: { label: 'Отправить', route: `/applications/${app.id}/edit` },
      available_actions: assignee === userId ? ['task.reassign'] : [],
      created_at: h.created_at,
    });
  }

  if (member && has(member, 'manage_team')) {
    for (const m of db().members.filter((x) => x.company_id === companyId && x.status === 'pending_approval')) {
      tasks.push({
        id: `member:${m.id}`,
        assignee_id: userId,
        type: 'approve_member',
        title: `Подтвердите доступ: ${m.last_name} ${m.first_name}`,
        application: null,
        assignee: person(userId),
        waiting_for_text: null,
        due_at: null,
        cta: { label: 'Подтвердить', route: '/team' },
        available_actions: [],
        created_at: m.created_at,
      });
    }
  }

  const filtered = tasks.filter((t) => {
    if (scope === 'mine') return t.assignee_id === userId;
    if (scope === 'waiting_others') return t.assignee_id !== userId;
    return true;
  });

  return filtered
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map(({ assignee_id: _ignored, ...t }) => t);
}

export function newApplicationNumber() {
  const n = db().seq.application;
  db().seq.application += 1;
  return `КЗ-2026-${String(n).padStart(6, '0')}`;
}

export function newDocId() {
  db().seq.doc += 1;
  return `doc-${db().seq.doc}`;
}

export { nextId } from './db';
export { rub } from './fixtures';
