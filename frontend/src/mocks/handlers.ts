import { delay, http, HttpResponse, type HttpResponseResolver, passthrough, type PathParams } from 'msw';

import type { CreateApplicationRequest, Requirement, RequirementCode } from '@/features/applications/types';
import type { InviteAcceptRequest, LoginRequest } from '@/features/auth/types';
import type { BankDecisionRequest, BankQueueItem, ScoringThresholds } from '@/features/bank/types';
import type { CompanyDetailsPatch, CompanyProfile, FinanceSummaryPatch, RegistryConfirmRequest } from '@/features/company/types';
import type { DocumentRef } from '@/features/documents/types';
import type { InfoRequest } from '@/features/info-requests/types';
import type { MatchingSession, MatchingSessionPatch } from '@/features/matching/types';
import type { PaymentCalcRequest } from '@/features/products/types';
import type { Home } from '@/features/profile/types';
import type { TaskScope } from '@/features/tasks/types';
import type { InviteRequest, MemberPatch, SigningRules } from '@/features/team/types';
import type { ApplicationStatus, LegalForm, Money, ProductCode } from '@/shared/types/common';

import { appLoad, applyDecision, availableActions, bankContext, buildDecision, clientContext, companyUserIds, currentUser, ensureScoring, errorResponse, fail, findApp, finishAnalysis, has, hasCompanyDoc, isLlmStub, memberOf, newApplicationNumber, newDocId, nextId, person, requirePermission, setStatus, shortName, signingState, tasksFor, tick, toDetail, TOKEN_PREFIX, tokenFor, toSummary } from './core';
import { type AppRecord, db, type DocRecord, iso, notify, resetDb, save, type SessionRecord } from './db';
import { DEFAULT_PERMISSIONS, DEMO_SIGN_CODE, DOCUMENT_TYPES, FEED, INFO_REQUEST_TEMPLATES, PREAPPROVED, PRODUCTS, REJECTION_REASONS } from './fixtures';
import { calcPayment, readiness, recommend } from './logic';

const API = '/api/v1';

async function isDemoRequest(request: Request) {
  const path = new URL(request.url).pathname;
  if (path === `${API}/__mock/reset`) return true;
  if (path === `${API}/auth/login`) {
    const { login } = await request.clone().json().catch(() => ({ login: '' }));
    return db().users.some((u) => u.login === String(login ?? '').trim());
  }
  if (path === `${API}/auth/invite/accept`) {
    const { invite_code } = await request.clone().json().catch(() => ({ invite_code: '' }));
    return db().invites.some((i) => i.code === String(invite_code ?? '').trim().toUpperCase());
  }
  return (request.headers.get('Authorization') ?? '').startsWith(`Bearer ${TOKEN_PREFIX}`);
}

function route<P extends PathParams>(
  resolver: (args: Parameters<HttpResponseResolver<P>>[0]) => unknown,
): HttpResponseResolver<P> {
  return async (args) => {
    if (!(await isDemoRequest(args.request))) return passthrough();
    await delay(250);
    try {
      tick();
      const result = await resolver(args);
      save();
      if (result instanceof Response) return result;
      if (result === undefined) return new HttpResponse(null, { status: 204 });
      return HttpResponse.json(result as object);
    } catch (e) {
      return errorResponse(e);
    }
  };
}

const created = (body: unknown) => HttpResponse.json(body as object, { status: 201 });

async function body<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    return {} as T;
  }
}

function companyRecord(companyId: string) {
  return db().companies[companyId];
}

function legalForm(companyId: string): LegalForm {
  return companyRecord(companyId).company.legal_form;
}

const authHandlers = [
  http.post(
    `${API}/auth/login`,
    route(async ({ request }) => {
      const { login, password } = await body<LoginRequest>(request);
      const user = db().users.find((u) => u.login === login?.trim());
      if (!user || user.password !== password) fail(401, 'UNAUTHORIZED', 'Неверный логин или пароль');
      return { access_token: tokenFor(user.id), token_type: 'Bearer', expires_in: 900 };
    }),
  ),

  http.post(
    `${API}/auth/refresh`,
    route(({ request }) => {
      const user = currentUser(request);
      return { access_token: tokenFor(user.id), token_type: 'Bearer', expires_in: 900 };
    }),
  ),

  http.post(`${API}/auth/logout`, route(() => undefined)),

  http.post(
    `${API}/auth/invite/accept`,
    route(async ({ request }) => {
      const data = await body<InviteAcceptRequest>(request);
      const invite = db().invites.find((i) => i.code === data.invite_code?.trim().toUpperCase());
      if (!invite) fail(404, 'INVITE_NOT_FOUND', 'Код приглашения не найден');
      if (new Date(invite.expires_at) < new Date()) fail(410, 'INVITE_EXPIRED', 'Срок действия приглашения истёк');
      if (!data.password || data.password.length < 8) {
        fail(422, 'VALIDATION_ERROR', 'Проверьте поля', { password: 'Минимум 8 символов' });
      }
      const m = db().members.find((x) => x.id === invite.member_id)!;
      const login = m.login ?? `${m.first_name.toLowerCase()}.${m.last_name.toLowerCase()}`;
      const userId = `u-${m.id}`;
      if (!db().users.some((u) => u.id === userId)) {
        db().users.push({
          id: userId,
          login,
          password: data.password,
          last_name: data.last_name || m.last_name,
          first_name: data.first_name || m.first_name,
          middle_name: m.middle_name,
          birth_date: null,
          company_id: m.company_id,
          bank_role: null,
          position: 'Сотрудник',
        });
      }
      m.user_id = userId;
      m.login = login;
      m.status = 'pending_approval';
      db().invites = db().invites.filter((i) => i !== invite);
      notify(companyUserIds(m.company_id, 'manage_team'), {
        title: 'Новый сотрудник ждёт подтверждения',
        text: `${m.last_name} ${m.first_name} принял приглашение`,
        application_id: null,
        route: '/team',
      });
      return { status: 'pending_approval', login };
    }),
  ),
];

function buildHome(userId: string): Home {
  const user = db().users.find((u) => u.id === userId)!;
  const member = memberOf(user.id);
  const company = user.company_id ? companyRecord(user.company_id) : null;
  const permissions = member?.permissions ?? [];
  const isOwner = member?.role === 'owner';

  return {
    id: user.id,
    first_name: user.first_name,
    middle_name: user.middle_name,
    last_name: user.last_name,
    birth_date: user.birth_date,
    role: member?.role ?? null,
    permissions,
    home_profile: permissions.includes('submit_applications') ? 'entrepreneur' : 'accountant',
    bank_role: user.bank_role,
    company: member && company ? company.company : null,
    accounts:
      member && company
        ? [
            {
              id: `acc-${company.company.id}`,
              owner_type: 'company',
              type: 'settlement',
              currency: 'RUB',
              name: 'Расчётный счёт',
              is_primary: true,
              current_money: { value: company.company.id === 'c-mph' ? 184_250_000 : 41_300_000, currency: 'RUB' },
            },
          ]
        : [],
    onboarding: {
      completed: !isOwner || !company || company.onboarding_completed,
      progress_percent: company?.completeness_percent ?? 100,
      next_step:
        isOwner && company && !company.onboarding_completed
          ? company.registry.confirmed
            ? 'company_details'
            : 'registry_confirm'
          : null,
    },
    unread_notifications: db().notifications.filter((n) => n.user_id === user.id && !n.read).length,
  };
}

function companyProfile(companyId: string, member: { role: string; permissions: string[] }): CompanyProfile {
  const { onboarding_completed: _ignored, ...rest } = companyRecord(companyId);
  const actions: CompanyProfile['available_actions'] = [];
  if (member.role === 'owner') actions.push('company.confirm_registry');
  if (['owner', 'director', 'cfo_or_accountant'].includes(member.role)) actions.push('company.edit_details');
  return { ...rest, available_actions: actions };
}

function recalcCompleteness(companyId: string) {
  const c = companyRecord(companyId);
  let percent = 60;
  if (c.registry.confirmed) percent += 20;
  if (c.client_input.external_debts.length || c.client_input.collateral_available.length) percent += 10;
  if (c.onboarding_completed) percent += 10;
  c.completeness_percent = Math.min(percent, 100);
}

function sourced<T>(value: T) {
  return { value, source: 'client' as const, as_of: iso().slice(0, 10), editable: true };
}

const companyHandlers = [
  http.get(`${API}/home`, route(({ request }) => buildHome(currentUser(request).id))),

  http.get(
    `${API}/company/profile`,
    route(({ request }) => {
      const { member, companyId } = clientContext(request);
      return companyProfile(companyId, member);
    }),
  ),

  http.post(
    `${API}/company/registry/confirm`,
    route(async ({ request }) => {
      const { member, companyId } = clientContext(request);
      if (member.role !== 'owner') fail(403, 'FORBIDDEN_ACTION', 'Подтверждает собственник', { allowed_roles: ['owner'] });
      const data = await body<RegistryConfirmRequest>(request);
      if (!data.confirmed && !data.issue_comment?.trim()) {
        fail(422, 'VALIDATION_ERROR', 'Опишите, что не так', { issue_comment: 'Обязательное поле' });
      }
      const c = companyRecord(companyId);
      c.registry.confirmed = data.confirmed;
      c.registry.issue_comment = data.confirmed ? null : data.issue_comment!.trim();
      recalcCompleteness(companyId);
      return companyProfile(companyId, member);
    }),
  ),

  http.patch(
    `${API}/company/details`,
    route(async ({ request }) => {
      const { member, companyId } = clientContext(request);
      if (!['owner', 'director', 'cfo_or_accountant'].includes(member.role)) {
        fail(403, 'FORBIDDEN_ACTION', 'Недоступно для вашей роли', { allowed_roles: ['owner', 'director', 'cfo_or_accountant'] });
      }
      const data = await body<CompanyDetailsPatch>(request);
      const c = companyRecord(companyId);
      if (data.external_debts) c.client_input.external_debts = data.external_debts;
      if (data.collateral_available) c.client_input.collateral_available = data.collateral_available;
      if (data.employees_count !== undefined) c.from_lk.employees_count = sourced(data.employees_count);
      if (data.monthly_inflow_avg) c.from_lk.monthly_inflow_avg = sourced(data.monthly_inflow_avg);
      if (data.tax_regime !== undefined) c.from_lk.tax_regime = sourced(data.tax_regime);
      recalcCompleteness(companyId);
      return companyProfile(companyId, member);
    }),
  ),

  http.post(
    `${API}/onboarding/complete`,
    route(async ({ request }) => {
      const { member, companyId } = clientContext(request);
      if (member.role !== 'owner') fail(403, 'FORBIDDEN_ACTION', 'Только для собственника', { allowed_roles: ['owner'] });
      const { skipped } = await body<{ skipped: boolean }>(request);
      const c = companyRecord(companyId);
      c.onboarding_completed = true;
      if (!skipped) recalcCompleteness(companyId);
      return buildHome(member.user_id!).onboarding;
    }),
  ),

  http.get(
    `${API}/company/finance-summary`,
    route(({ request }) => db().finance[clientContext(request).companyId]),
  ),

  http.patch(
    `${API}/company/finance-summary`,
    route(async ({ request }) => {
      const { member, companyId } = clientContext(request);
      if (!['owner', 'director', 'cfo_or_accountant'].includes(member.role)) {
        fail(403, 'FORBIDDEN_ACTION', 'Недоступно для вашей роли', { allowed_roles: ['owner', 'director', 'cfo_or_accountant'] });
      }
      const data = await body<FinanceSummaryPatch>(request);
      const f = db().finance[companyId];
      if (data.monthly_inflow_avg) f.monthly_inflow_avg = sourced(data.monthly_inflow_avg);
      if (data.monthly_operating_outflow_avg) f.monthly_operating_outflow_avg = sourced(data.monthly_operating_outflow_avg);
      if (data.monthly_inflow_avg || data.monthly_operating_outflow_avg) {
        f.free_cash_flow = {
          ...f.free_cash_flow,
          value: { value: f.monthly_inflow_avg.value.value - f.monthly_operating_outflow_avg.value.value, currency: 'RUB' },
        };
      }
      if (data.debts_add?.length) {
        f.debts.items.push(...data.debts_add.map((d) => ({ ...d, source: 'client' as const, overdue: false })));
        f.debts.total_monthly_payment = {
          value: f.debts.items.reduce((s, d) => s + d.monthly_payment.value, 0),
          currency: 'RUB',
        };
      }
      if (data.confirm) f.confirmed_at = iso();
      return f;
    }),
  ),

  http.get(
    `${API}/company/readiness`,
    route(({ request }) => {
      const { companyId } = clientContext(request);
      const url = new URL(request.url);
      const amount = Number(url.searchParams.get('amount')) || undefined;
      const term = Number(url.searchParams.get('term_months')) || undefined;
      const c = companyRecord(companyId).company;
      return readiness({
        registrationDate: c.registration_date,
        registryStatus: c.registry_status,
        finance: db().finance[companyId],
        thresholds: db().thresholds,
        hasFinStatements: hasCompanyDoc(companyId, c.legal_form === 'IP' ? 'tax_return' : 'fin_statements_2025'),
        amount,
        term,
      });
    }),
  ),
];

const teamHandlers = [
  http.get(
    `${API}/company/members`,
    route(({ request }) => {
      const { companyId } = clientContext(request);
      return db()
        .members.filter((m) => m.company_id === companyId)
        .map(({ company_id: _ignored, ...m }) => m);
    }),
  ),

  http.post(
    `${API}/company/members/invite`,
    route(async ({ request }) => {
      const { member, companyId } = clientContext(request);
      requirePermission(member, 'manage_team');
      const data = await body<InviteRequest>(request);
      const errors: Record<string, string> = {};
      if (!data.last_name?.trim()) errors.last_name = 'Укажите фамилию';
      if (!data.first_name?.trim()) errors.first_name = 'Укажите имя';
      if (!data.role) errors.role = 'Выберите роль';
      if (!data.login_email?.includes('@')) errors.login_email = 'Укажите почту для входа';
      if (Object.keys(errors).length) fail(422, 'VALIDATION_ERROR', 'Проверьте поля', errors);

      const m = {
        id: nextId('m'),
        user_id: null,
        company_id: companyId,
        last_name: data.last_name.trim(),
        first_name: data.first_name.trim(),
        middle_name: data.middle_name?.trim() || null,
        role: data.role,
        permissions: data.permissions ?? DEFAULT_PERMISSIONS[data.role],
        status: 'invited' as const,
        has_alfa_business_access: false,
        login: data.login_email.trim(),
        created_at: iso(),
      };
      db().members.push(m);
      const code = `${Math.floor(1000 + Math.random() * 9000)}-${String.fromCharCode(65 + Math.floor(Math.random() * 26))}${String.fromCharCode(65 + Math.floor(Math.random() * 26))}`;
      const expires = new Date(Date.now() + 7 * 24 * 3600 * 1000);
      db().invites.push({ code, member_id: m.id, expires_at: iso(expires) });
      const { company_id: _ignored, ...memberOut } = m;
      return created({ member: memberOut, invite_code: code, expires_at: iso(expires) });
    }),
  ),

  http.patch(
    `${API}/company/members/:id`,
    route(async ({ request, params }) => {
      const { member, companyId } = clientContext(request);
      requirePermission(member, 'manage_team');
      const data = await body<MemberPatch>(request);
      const m = db().members.find((x) => x.id === params.id && x.company_id === companyId);
      if (!m) fail(404, 'NOT_FOUND', 'Сотрудник не найден');
      if (data.role) m.role = data.role;
      if (data.permissions) m.permissions = data.permissions;
      const { company_id: _ignored, ...out } = m;
      return out;
    }),
  ),

  http.post(
    `${API}/company/members/:id/approve`,
    route(({ request, params }) => {
      const { member, companyId } = clientContext(request);
      requirePermission(member, 'manage_team');
      const m = db().members.find((x) => x.id === params.id && x.company_id === companyId);
      if (!m) fail(404, 'NOT_FOUND', 'Сотрудник не найден');
      if (m.status !== 'pending_approval') fail(409, 'INVALID_TRANSITION', 'Сотрудник не ждёт подтверждения');
      m.status = 'active';
      m.has_alfa_business_access = true;
      const { company_id: _ignored, ...out } = m;
      return out;
    }),
  ),

  http.delete(
    `${API}/company/members/:id`,
    route(({ request, params }) => {
      const { member, companyId } = clientContext(request);
      requirePermission(member, 'manage_team');
      const m = db().members.find((x) => x.id === params.id && x.company_id === companyId);
      if (!m) fail(404, 'NOT_FOUND', 'Сотрудник не найден');
      if (m.user_id === member.user_id) fail(409, 'INVALID_TRANSITION', 'Нельзя удалить себя');
      m.status = 'disabled';
      return undefined;
    }),
  ),

  http.get(
    `${API}/company/signing-rules`,
    route(({ request }) => db().signingRules[clientContext(request).companyId]),
  ),

  http.put(
    `${API}/company/signing-rules`,
    route(async ({ request }) => {
      const { member, companyId } = clientContext(request);
      if (member.role !== 'owner') fail(403, 'FORBIDDEN_ACTION', 'Правила меняет собственник', { allowed_roles: ['owner'] });
      const data = await body<SigningRules>(request);
      const current = db().signingRules[companyId];
      if (data.version !== current.version) fail(409, 'VERSION_CONFLICT', 'Правила изменил другой сотрудник');
      db().signingRules[companyId] = { ...data, legal_form: current.legal_form, version: current.version + 1 };
      return db().signingRules[companyId];
    }),
  ),
];

const taskHandlers = [
  http.get(
    `${API}/tasks`,
    route(({ request }) => {
      const { user, companyId } = clientContext(request);
      const scope = (new URL(request.url).searchParams.get('scope') ?? 'all') as TaskScope;
      return tasksFor(user.id, companyId, scope);
    }),
  ),

  http.post(
    `${API}/tasks/:id/reassign`,
    route(async ({ request, params }) => {
      const { user, companyId } = clientContext(request);
      const { member_id } = await body<{ member_id: string }>(request);
      const taskId = decodeURIComponent(String(params.id));
      const task = tasksFor(user.id, companyId, 'all').find((t) => t.id === taskId);
      if (!task) fail(404, 'NOT_FOUND', 'Задача не найдена');
      const target = db().members.find((m) => m.id === member_id && m.company_id === companyId && m.status === 'active');
      if (!target?.user_id) fail(422, 'VALIDATION_ERROR', 'Сотрудник не найден', { member_id: 'Выберите сотрудника' });
      const needed = task.type === 'send_application' ? 'submit_applications' : 'upload_documents';
      if (!has(target, needed)) {
        fail(422, 'VALIDATION_ERROR', 'У сотрудника нет нужного права', { member_id: 'У сотрудника нет права на это действие' });
      }
      db().taskAssignees[taskId] = target.user_id;
      notify([target.user_id], {
        title: 'Вам передали задачу',
        text: task.title,
        application_id: task.application?.id ?? null,
        route: task.cta.route,
      });
      return tasksFor(target.user_id, companyId, 'mine').find((t) => t.id === taskId);
    }),
  ),
];

function newSession(companyId: string, userId: string): SessionRecord {
  return {
    id: nextId('ms'),
    company_id: companyId,
    user_id: userId,
    status: 'draft',
    step: 1,
    need: { purpose: null, amount: null, term_months: null, need_type: null, disbursement: null, urgency: null, collateral: null },
    finance_confirmed: false,
    extra: {
      expected_payments: [],
      other_bank_turnover_monthly: null,
      own_funds: null,
      collateral_details: null,
      preference: null,
      skipped: false,
    },
    updated_at: iso(),
    last_recommendation: null,
  };
}

function sessionOut(s: SessionRecord): MatchingSession {
  const { company_id: _a, user_id: _b, last_recommendation: _c, ...out } = s;
  return out;
}

function companyReadiness(companyId: string, amount?: number, term?: number) {
  const c = companyRecord(companyId).company;
  return readiness({
    registrationDate: c.registration_date,
    registryStatus: c.registry_status,
    finance: db().finance[companyId],
    thresholds: db().thresholds,
    hasFinStatements: hasCompanyDoc(companyId, c.legal_form === 'IP' ? 'tax_return' : 'fin_statements_2025'),
    amount,
    term,
  });
}

const productHandlers = [
  http.get(
    `${API}/products`,
    route(({ request }) => {
      currentUser(request);
      const lf = new URL(request.url).searchParams.get('legal_form') as LegalForm | null;
      return PRODUCTS.filter((p) => !lf || p.legal_forms.includes(lf));
    }),
  ),

  http.get(
    `${API}/products/:code`,
    route(({ request, params }) => {
      currentUser(request);
      const p = PRODUCTS.find((x) => x.code === params.code);
      if (!p) fail(404, 'NOT_FOUND', 'Продукт не найден');
      return p;
    }),
  ),

  http.post(
    `${API}/calculator/payment`,
    route(async ({ request }) => {
      const data = await body<PaymentCalcRequest>(request);
      if (!data.amount?.value || !data.term_months) {
        fail(422, 'VALIDATION_ERROR', 'Проверьте поля', { amount: 'Укажите сумму и срок' });
      }
      return calcPayment(data.amount.value, data.term_months, data.rate_percent);
    }),
  ),

  http.get(
    `${API}/offers/preapproved`,
    route(({ request }) => {
      const { companyId } = clientContext(request);
      const offer = PREAPPROVED[companyId];
      if (!offer || db().usedPreapproved.includes(offer.offer_id)) return new HttpResponse(null, { status: 204 });
      return offer;
    }),
  ),

  http.post(
    `${API}/matching-sessions`,
    route(({ request }) => {
      const { user, member, companyId } = clientContext(request);
      requirePermission(member, 'submit_applications');
      const s = newSession(companyId, user.id);
      db().sessions[s.id] = s;
      return created(sessionOut(s));
    }),
  ),

  http.patch(
    `${API}/matching-sessions/:id`,
    route(async ({ request, params }) => {
      const { companyId } = clientContext(request);
      const s = db().sessions[String(params.id)];
      if (!s || s.company_id !== companyId) fail(404, 'NOT_FOUND', 'Подбор не найден');
      const data = await body<MatchingSessionPatch>(request);
      if (data.need) s.need = { ...s.need, ...data.need };
      if (data.extra) s.extra = { ...s.extra, ...data.extra };
      if (data.finance_confirmed !== undefined) s.finance_confirmed = data.finance_confirmed;
      if (data.step) {
        if (data.step >= 2) {
          const missing = (['purpose', 'amount', 'term_months', 'need_type', 'disbursement', 'urgency'] as const).filter(
            (k) => s.need[k] === null || s.need[k] === undefined,
          );
          if (missing.length) {
            fail(422, 'VALIDATION_ERROR', 'Заполните обязательные поля', Object.fromEntries(missing.map((k) => [k, 'Обязательное поле'])));
          }
        }
        if (data.step >= 3 && !s.finance_confirmed) {
          fail(422, 'VALIDATION_ERROR', 'Подтвердите, что данные актуальны', { finance_confirmed: 'Отметьте галочку' });
        }
        s.step = data.step;
      }
      if (Object.keys(data).length) s.updated_at = iso();
      return sessionOut(s);
    }),
  ),

  http.post(
    `${API}/matching-sessions/:id/recommend`,
    route(async ({ request, params }) => {
      const { companyId } = clientContext(request);
      const s = db().sessions[String(params.id)];
      if (!s || s.company_id !== companyId) fail(404, 'NOT_FOUND', 'Подбор не найден');
      await delay(1200);
      const amount = s.need.amount?.value;
      const result = recommend(sessionOut(s), db().finance[companyId], db().thresholds, companyReadiness(companyId, amount, s.need.term_months ?? undefined));
      if (isLlmStub()) result.text_source = 'template';
      s.last_recommendation = result;
      s.status = 'completed';
      s.step = 4;
      return result;
    }),
  ),
];

const BANK_STATUSES: ApplicationStatus[] = ['submitted', 'in_review', 'info_requested'];

const SIGNING_STATUSES: ApplicationStatus[] = ['approved', 'counter_offer', 'signing'];

const FINISHED: ApplicationStatus[] = ['issued', 'rejected', 'cancelled'];

function requirements(app: AppRecord): { items: Requirement[]; can_submit: boolean } {
  const lf = legalForm(app.company_id);
  const items: Requirement[] = [
    {
      code: 'consent_bki',
      title: 'Согласие на запрос в бюро кредитных историй',
      necessity: 'required',
      status: app.consents.consent_bki ? 'done' : 'missing',
      source: app.consents.consent_bki ? 'client' : null,
      note: 'Подписывается кодом прямо в кабинете',
      action: { type: 'sign', document_type: null },
    },
    {
      code: 'consent_pd',
      title: 'Согласие на обработку персональных данных',
      necessity: 'required',
      status: app.consents.consent_pd ? 'done' : 'missing',
      source: app.consents.consent_pd ? 'client' : null,
      note: null,
      action: { type: 'sign', document_type: null },
    },
    {
      code: 'company_docs',
      title: lf === 'IP' ? 'Документы ИП' : 'Устав и решение о назначении директора',
      necessity: lf === 'IP' ? 'situational' : 'required',
      status: lf === 'IP' ? 'not_needed' : hasCompanyDoc(app.company_id, 'company_docs') ? 'done' : 'missing',
      source: lf === 'IP' ? null : 'alfa_lk',
      note: lf === 'IP' ? 'Для ИП данные берём из ЕГРИП' : 'Уже есть в Альфа-Бизнесе',
      action: lf === 'IP' ? null : { type: 'pick_document', document_type: 'company_docs' },
    },
    {
      code: 'fin_statements_2025',
      title: lf === 'IP' ? 'Налоговая декларация за 2025 год' : 'Бухгалтерская отчётность за 2025 год',
      necessity: 'situational',
      status: hasCompanyDoc(app.company_id, lf === 'IP' ? 'tax_return' : 'fin_statements_2025') ? 'done' : 'missing',
      source: 'documents',
      note: 'Банк запросит, если понадобится. С ней сумма может быть больше',
      action: { type: 'upload', document_type: lf === 'IP' ? 'tax_return' : 'fin_statements_2025' },
    },
    {
      code: 'other_bank_statements',
      title: 'Выписка по счёту в другом банке',
      necessity: 'situational',
      status: 'not_needed',
      source: 'bki',
      note: 'Счета в других банках учтены по данным БКИ',
      action: { type: 'upload', document_type: 'other_bank_statements' },
    },
    {
      code: 'collateral_docs',
      title: 'Документы по залогу',
      necessity: app.collateral && app.collateral.type !== 'none' ? 'required' : 'situational',
      status:
        app.collateral && app.collateral.type !== 'none'
          ? Object.values(db().documents).some((d) => d.application_id === app.id && d.document_type === 'collateral_docs')
            ? 'done'
            : 'missing'
          : 'not_needed',
      source: 'documents',
      note: app.collateral && app.collateral.type !== 'none' ? null : 'Нужны, только если выбран залог',
      action: { type: 'upload', document_type: 'collateral_docs' },
    },
  ];
  return {
    items,
    can_submit: items.filter((i) => i.necessity === 'required').every((i) => i.status === 'done'),
  };
}

function createApplication(companyId: string, userId: string, data: CreateApplicationRequest): AppRecord {
  let productCode: ProductCode = 'working_capital';
  let amount: Money;
  let term: number;
  let rate = 15;
  let warningAccepted = false;
  let purposeCode = data.purpose_code ?? 'working_capital';
  let purpose = data.purpose ?? 'Пополнение оборотных средств';
  let collateral: AppRecord['collateral'] = null;

  if (data.source === 'preapproved') {
    const offer = PREAPPROVED[companyId];
    if (!offer || offer.offer_id !== data.offer_id || db().usedPreapproved.includes(offer.offer_id)) {
      fail(410, 'OFFER_EXPIRED', 'Предложение больше не действует');
    }
    if (new Date(offer.valid_until) < new Date()) fail(410, 'OFFER_EXPIRED', 'Предложение истекло');
    db().usedPreapproved.push(offer.offer_id);
    productCode = offer.product.code;
    amount = offer.limit;
    term = offer.term_months;
    purpose = 'Предодобренный кредит';
  } else if (data.source === 'recommendation') {
    const s = db().sessions[data.matching_session_id ?? ''];
    if (!s || s.company_id !== companyId) fail(404, 'NOT_FOUND', 'Подбор не найден');
    const rec = s.last_recommendation;
    if (!rec) fail(409, 'INVALID_TRANSITION', 'Сначала получите рекомендацию');
    const all = [rec.primary, ...rec.alternatives];
    const chosen = all.find((r) => r.rank === (data.recommendation_rank ?? 1)) ?? rec.primary;
    productCode = chosen.product.code;
    rate = chosen.rate_percent;
    if (data.keep_requested) {
      amount = rec.requested.amount;
      term = rec.requested.term_months;
      warningAccepted = rec.warnings.some((w) => w.code === 'LOAD_ABOVE_THRESHOLD');
    } else {
      amount = chosen.amount;
      term = chosen.term_months;
    }
    purposeCode = s.need.purpose ?? purposeCode;
    purpose = data.purpose ?? PURPOSE_TITLES[purposeCode];
    if (s.need.collateral && s.need.collateral !== 'none') {
      collateral = {
        type: s.need.collateral,
        description: s.extra.collateral_details?.description ?? null,
        estimated_value: s.extra.collateral_details?.estimated_value ?? null,
      };
    }
  } else {
    const p = PRODUCTS.find((x) => x.code === data.product_code);
    if (!p) fail(422, 'VALIDATION_ERROR', 'Выберите продукт', { product_code: 'Обязательное поле' });
    if (!data.amount?.value || !data.term_months) {
      fail(422, 'VALIDATION_ERROR', 'Укажите сумму и срок', { amount: 'Обязательное поле', term_months: 'Обязательное поле' });
    }
    productCode = p.code;
    amount = data.amount;
    term = data.term_months;
    rate = Math.max(p.rate_from_percent, 15);
    purposeCode = data.purpose_code ?? p.purposes[0];
    purpose = data.purpose ?? PURPOSE_TITLES[purposeCode];
  }

  const now = iso();
  const app: AppRecord = {
    id: nextId('app'),
    number: newApplicationNumber(),
    company_id: companyId,
    created_by: userId,
    product_code: productCode,
    purpose_code: purposeCode,
    purpose,
    requested_amount: amount!,
    requested_term_months: term!,
    approved_amount: null,
    approved_term_months: null,
    rate_percent: rate,
    status: 'draft',
    collateral,
    client_warning_accepted: warningAccepted,
    load_at_submit: null,
    form: { step: 'params', data: {}, saved_at: now },
    timeline: [{ at: now, status: 'draft', title: 'Заявка создана', description: null, actor: { type: 'client', name: person(userId).name } }],
    info_requests: [],
    decision: null,
    signers: [],
    consents: { consent_bki: false, consent_pd: false },
    version: 1,
    created_at: now,
    updated_at: now,
    auto_check_at: null,
    handoff_to: null,
    bank: { assignee_user_id: null, queued_at: null, score: null, checks: [], auto_decided: false, ai_summary: null, audit: [] },
  };
  db().applications[app.id] = app;
  return app;
}

export const PURPOSE_TITLES: Record<string, string> = {
  equipment: 'Покупка оборудования',
  repair: 'Ремонт',
  current_expenses: 'Текущие расходы',
  working_capital: 'Пополнение оборотных средств',
  real_estate: 'Покупка недвижимости',
  gov_contract: 'Исполнение госконтракта',
  other: 'Другая цель',
};

function requireAction(app: AppRecord, member: Parameters<typeof availableActions>[1], action: ReturnType<typeof availableActions>[number]) {
  if (!availableActions(app, member).includes(action)) {
    const roles: Record<string, string[]> = {
      'offer.accept': ['owner', 'director'],
      'offer.decline': ['owner', 'director'],
      'application.submit': ['owner', 'director', 'financing_employee', 'banking_employee'],
      'application.cancel': ['owner', 'director', 'financing_employee', 'banking_employee'],
    };
    if (['application.submit', 'offer.accept', 'application.cancel'].includes(action) && !roles[action]?.includes(member.role)) {
      fail(403, 'FORBIDDEN_ACTION', 'Действие недоступно для вашей роли', { allowed_roles: roles[action] ?? [] });
    }
    fail(409, 'INVALID_TRANSITION', `Заявку в статусе ${app.status} нельзя изменить так`);
  }
}

function startSigning(app: AppRecord) {
  const rules = db().signingRules[app.company_id];
  const company = companyRecord(app.company_id).company;
  const members = db().members.filter((m) => m.company_id === app.company_id && m.status === 'active');
  const used = new Set<string>();

  app.signers = rules.signers
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((s) => {
      let userId = s.user_id;
      if (!userId && s.role) {
        userId =
          members.find((m) => m.role === s.role && m.user_id && !used.has(m.user_id))?.user_id ??
          company.director?.user_id ??
          null;
      }
      if (userId) used.add(userId);
      return { order: s.order, user_id: userId!, document: s.document, status: 'pending' as const, signed_at: null };
    })
    .filter((s) => s.user_id);

  notify(app.signers.map((s) => s.user_id), {
    title: `Подпишите документы по заявке ${app.number}`,
    text: 'Код подтверждения появится в кабинете',
    application_id: app.id,
    route: `/applications/${app.id}/signing`,
  });
}

function issueLoan(app: AppRecord) {
  const amount = app.approved_amount ?? app.requested_amount;
  const term = app.approved_term_months ?? app.requested_term_months;
  const calc = calcPayment(amount.value, term, app.rate_percent);
  const product = PRODUCTS.find((p) => p.code === app.product_code)!;
  db().loans.unshift({
    id: `loan-${app.id}`,
    company_id: app.company_id,
    application_id: app.id,
    product: { code: product.code, name: product.name },
    amount,
    balance: amount,
    rate_percent: app.rate_percent,
    term_months: term,
    next_payment: { date: calc.schedule[0].date, amount: calc.monthly_payment },
    overpayment_total: calc.overpayment,
    issued_to_account: '40702 •••• 4512',
    schedule: calc.schedule,
    source: 'system',
  });
}

const applicationHandlers = [
  http.get(
    `${API}/applications`,
    route(({ request }) => {
      const { member, companyId } = clientContext(request);
      const url = new URL(request.url);
      const statuses = url.searchParams.getAll('status') as ApplicationStatus[];
      const page = Math.max(1, Number(url.searchParams.get('page') ?? 1));
      const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get('page_size') ?? 10)));
      const sort = url.searchParams.get('sort') ?? '-created_at';
      const desc = sort.startsWith('-');
      const field = desc ? sort.slice(1) : sort;
      if (!['created_at', 'updated_at', 'requested_amount'].includes(field)) {
        fail(400, 'BAD_REQUEST', 'Неизвестное поле сортировки');
      }

      const all = Object.values(db().applications).filter((a) => a.company_id === companyId);
      const value = (a: AppRecord) => (field === 'requested_amount' ? a.requested_amount.value : Date.parse(a[field as 'created_at']));
      const filtered = all
        .filter((a) => !statuses.length || statuses.includes(a.status))
        .sort((a, b) => (desc ? value(b) - value(a) : value(a) - value(b)));

      const count = (list: ApplicationStatus[]) => all.filter((a) => list.includes(a.status)).length;
      return {
        items: filtered.slice((page - 1) * pageSize, page * pageSize).map((a) => toSummary(a, member)),
        page,
        page_size: pageSize,
        total: filtered.length,
        counters: {
          drafts: count(['draft']),
          in_bank: count(BANK_STATUSES),
          awaiting_signing: count(SIGNING_STATUSES),
          finished: count(FINISHED),
        },
      };
    }),
  ),

  http.post(
    `${API}/applications`,
    route(async ({ request }) => {
      const { user, member, companyId } = clientContext(request);
      requirePermission(member, 'submit_applications');
      const app = createApplication(companyId, user.id, await body<CreateApplicationRequest>(request));
      return created(toDetail(app, member, user.id));
    }),
  ),

  http.get(
    `${API}/applications/:id`,
    route(({ request, params }) => {
      const { user, member, companyId } = clientContext(request);
      return toDetail(findApp(String(params.id), companyId), member, user.id);
    }),
  ),

  http.patch(
    `${API}/applications/:id`,
    route(async ({ request, params }) => {
      const { user, member, companyId } = clientContext(request);
      const app = findApp(String(params.id), companyId);
      requireAction(app, member, 'application.edit');
      const data = await body<{ version: number; form?: { step?: string; data?: Record<string, unknown> }; amount?: Money; term_months?: number; collateral?: AppRecord['collateral'] }>(request);
      if (data.version !== app.version) fail(409, 'VERSION_CONFLICT', 'Заявку изменил другой сотрудник');
      if (data.form) {
        app.form = {
          step: (data.form.step as AppRecord['form']['step']) ?? app.form.step,
          data: { ...app.form.data, ...(data.form.data ?? {}) },
          saved_at: iso(),
        };
        if (typeof data.form.data?.purpose === 'string') app.purpose = data.form.data.purpose;
      }
      if (data.amount) app.requested_amount = data.amount;
      if (data.term_months) app.requested_term_months = data.term_months;
      if (data.collateral !== undefined) app.collateral = data.collateral;
      app.version += 1;
      app.updated_at = iso();
      return toDetail(app, member, user.id);
    }),
  ),

  http.get(
    `${API}/applications/:id/requirements`,
    route(({ request, params }) => requirements(findApp(String(params.id), clientContext(request).companyId))),
  ),

  http.post(
    `${API}/applications/:id/consents/:type/challenge`,
    route(({ request, params }) => {
      const { user, member, companyId } = clientContext(request);
      const app = findApp(String(params.id), companyId);
      requireAction(app, member, 'consent.sign');
      const id = nextId('ch');
      const expires = iso(new Date(Date.now() + 5 * 60 * 1000));
      db().challenges[id] = { code: DEMO_SIGN_CODE, user_id: user.id, application_id: app.id, kind: String(params.type), expires_at: expires };
      return { challenge_id: id, demo_code: DEMO_SIGN_CODE, expires_at: expires };
    }),
  ),

  http.post(
    `${API}/applications/:id/consents/:type/confirm`,
    route(async ({ request, params }) => {
      const { user, member, companyId } = clientContext(request);
      const app = findApp(String(params.id), companyId);
      const { challenge_id, code } = await body<{ challenge_id: string; code: string }>(request);
      const ch = db().challenges[challenge_id];
      if (!ch || ch.user_id !== user.id || ch.application_id !== app.id) fail(422, 'INVALID_CODE', 'Запросите код ещё раз');
      if (ch.code !== String(code).trim()) fail(422, 'INVALID_CODE', 'Неверный код');
      delete db().challenges[challenge_id];
      const type = String(params.type) as RequirementCode;
      if (type === 'consent_bki' || type === 'consent_pd') app.consents[type] = true;
      app.version += 1;
      app.updated_at = iso();
      return requirements(app).items.find((i) => i.code === type);
      void member;
    }),
  ),

  http.post(
    `${API}/applications/:id/submit`,
    route(({ request, params }) => {
      const { user, member, companyId } = clientContext(request);
      const app = findApp(String(params.id), companyId);
      requireAction(app, member, 'application.submit');
      const req = requirements(app);
      if (!req.can_submit) {
        fail(422, 'REQUIREMENTS_NOT_MET', 'Не выполнены условия отправки', {
          missing: req.items.filter((i) => i.necessity === 'required' && i.status !== 'done').map((i) => i.code),
        });
      }
      app.load_at_submit = appLoad(app, app.requested_amount, app.requested_term_months);
      app.handoff_to = null;
      setStatus(app, 'submitted', 'Заявка отправлена в банк', null, { type: 'client', name: person(user.id).name });
      app.auto_check_at = Date.now() + 5000;
      notify(companyUserIds(companyId).filter((id) => id !== user.id && id === app.created_by), {
        title: `Заявка ${app.number} отправлена в банк`,
        text: `Отправил: ${person(user.id).name}`,
        application_id: app.id,
        route: `/applications/${app.id}`,
      });
      return toDetail(app, member, user.id);
    }),
  ),

  http.post(
    `${API}/applications/:id/handoff`,
    route(async ({ request, params }) => {
      const { user, member, companyId } = clientContext(request);
      const app = findApp(String(params.id), companyId);
      requireAction(app, member, 'application.handoff');
      const { member_id } = await body<{ member_id: string }>(request);
      const target = db().members.find((m) => m.id === member_id && m.company_id === companyId && m.status === 'active');
      if (!target?.user_id || !has(target, 'submit_applications')) {
        fail(422, 'VALIDATION_ERROR', 'Выберите сотрудника с правом отправки', { member_id: 'У сотрудника нет права отправлять заявки' });
      }
      const h = { id: nextId('h'), application_id: app.id, to_user_id: target.user_id, from_user_id: user.id, created_at: iso() };
      db().handoffs.push(h);
      app.handoff_to = target.user_id;
      notify([target.user_id], {
        title: 'Вам передали заявку на отправку',
        text: `${person(user.id).name} подготовил заявку ${app.number}`,
        application_id: app.id,
        route: `/applications/${app.id}/edit`,
      });
      return tasksFor(target.user_id, companyId, 'mine').find((t) => t.id === `handoff:${h.id}`);
    }),
  ),

  http.post(
    `${API}/applications/:id/cancel`,
    route(async ({ request, params }) => {
      const { user, member, companyId } = clientContext(request);
      const app = findApp(String(params.id), companyId);
      requireAction(app, member, 'application.cancel');
      const { reason } = await body<{ reason?: string }>(request);
      setStatus(app, 'cancelled', 'Заявка отозвана', reason || null, { type: 'client', name: person(user.id).name });
      return toDetail(app, member, user.id);
    }),
  ),

  http.post(
    `${API}/applications/:id/offer/accept`,
    route(({ request, params }) => {
      const { user, member, companyId } = clientContext(request);
      const app = findApp(String(params.id), companyId);
      requireAction(app, member, 'offer.accept');
      if (app.decision?.offer_valid_until && new Date(app.decision.offer_valid_until) < new Date(iso().slice(0, 10))) {
        fail(410, 'OFFER_EXPIRED', 'Предложение истекло');
      }
      setStatus(app, 'signing', 'Предложение принято', 'Документы отправлены на подпись', { type: 'client', name: person(user.id).name });
      startSigning(app);
      return toDetail(app, member, user.id);
    }),
  ),

  http.post(
    `${API}/applications/:id/offer/decline`,
    route(async ({ request, params }) => {
      const { user, member, companyId } = clientContext(request);
      const app = findApp(String(params.id), companyId);
      requireAction(app, member, 'offer.decline');
      const { reason } = await body<{ reason?: string }>(request);
      setStatus(app, 'cancelled', 'Предложение банка отклонено', reason || null, { type: 'client', name: person(user.id).name });
      return toDetail(app, member, user.id);
    }),
  ),

  http.get(
    `${API}/applications/:id/info-requests/:rid`,
    route(({ request, params }) => {
      const app = findApp(String(params.id), clientContext(request).companyId);
      const r = app.info_requests.find((x) => x.id === params.rid);
      if (!r) fail(404, 'NOT_FOUND', 'Запрос не найден');
      return r;
    }),
  ),

  http.post(
    `${API}/applications/:id/info-requests/:rid/respond`,
    route(async ({ request, params }) => {
      const { user, member, companyId } = clientContext(request);
      const app = findApp(String(params.id), companyId);
      requireAction(app, member, 'info_request.respond');
      const r = app.info_requests.find((x) => x.id === params.rid);
      if (!r) fail(404, 'NOT_FOUND', 'Запрос не найден');
      if (r.status !== 'open') fail(409, 'INVALID_TRANSITION', 'На запрос уже ответили');
      const data = await body<{ document_ids: string[]; comment?: string }>(request);
      if (!data.document_ids?.length && !data.comment?.trim()) {
        fail(422, 'VALIDATION_ERROR', 'Приложите документ или напишите комментарий', { document_ids: 'Приложите документ' });
      }
      r.status = 'answered';
      r.response = { comment: data.comment?.trim() || null, document_ids: data.document_ids ?? [], answered_by: person(user.id), answered_at: iso() };
      if (!app.info_requests.some((x) => x.status === 'open')) {
        setStatus(app, 'in_review', 'Ответ на запрос банка', 'Банк продолжает рассмотрение', { type: 'client', name: person(user.id).name });
        app.bank.queued_at = iso();
        app.bank.audit.push({ at: iso(), actor: person(user.id).name, action: 'Клиент ответил на запрос', details: r.question });
      }
      return r;
    }),
  ),

  http.get(
    `${API}/applications/:id/signing`,
    route(({ request, params }) => {
      const { user, companyId } = clientContext(request);
      const app = findApp(String(params.id), companyId);
      const state = signingState(app, user.id);
      if (!state) fail(404, 'NOT_FOUND', 'Подписание ещё не началось');
      return state;
    }),
  ),

  http.post(
    `${API}/applications/:id/signing/challenge`,
    route(({ request, params }) => {
      const { user, member, companyId } = clientContext(request);
      const app = findApp(String(params.id), companyId);
      requireAction(app, member, 'signing.sign');
      const id = nextId('ch');
      const expires = iso(new Date(Date.now() + 5 * 60 * 1000));
      db().challenges[id] = { code: DEMO_SIGN_CODE, user_id: user.id, application_id: app.id, kind: 'signing', expires_at: expires };
      return { challenge_id: id, demo_code: DEMO_SIGN_CODE, expires_at: expires };
    }),
  ),

  http.post(
    `${API}/applications/:id/signing/confirm`,
    route(async ({ request, params }) => {
      const { user, member, companyId } = clientContext(request);
      const app = findApp(String(params.id), companyId);
      requireAction(app, member, 'signing.sign');
      const { challenge_id, code } = await body<{ challenge_id: string; code: string }>(request);
      const ch = db().challenges[challenge_id];
      if (!ch || ch.user_id !== user.id || ch.application_id !== app.id) fail(422, 'INVALID_CODE', 'Запросите код ещё раз');
      if (ch.code !== String(code).trim()) fail(422, 'INVALID_CODE', 'Неверный код');
      delete db().challenges[challenge_id];

      for (const s of app.signers.filter((x) => x.user_id === user.id && x.status !== 'signed')) {
        s.status = 'signed';
        s.signed_at = iso();
      }
      app.timeline.push({
        at: iso(),
        status: 'signing',
        title: 'Документ подписан',
        description: person(user.id).name,
        actor: { type: 'client', name: person(user.id).name },
      });
      app.version += 1;

      if (app.signers.every((s) => s.status === 'signed')) {
        setStatus(app, 'issued', 'Кредит выдан', 'Деньги зачислены на расчётный счёт', { type: 'system', name: null });
        issueLoan(app);
        notify(companyUserIds(companyId), {
          title: `Кредит по заявке ${app.number} выдан`,
          text: 'Деньги зачислены на расчётный счёт',
          application_id: app.id,
          route: `/loans/loan-${app.id}`,
        });
      }
      return signingState(app, user.id);
    }),
  ),

  http.post(
    `${API}/applications/:id/signing/remind`,
    route(async ({ request, params }) => {
      const { member, companyId } = clientContext(request);
      const app = findApp(String(params.id), companyId);
      requireAction(app, member, 'signing.remind');
      const { user_id } = await body<{ user_id: string }>(request);
      notify([user_id], {
        title: `Напоминание: подпишите документы по заявке ${app.number}`,
        text: `${person(member.user_id!).name} ждёт вашу подпись`,
        application_id: app.id,
        route: `/applications/${app.id}/signing`,
      });
      return undefined;
    }),
  ),

  http.get(
    `${API}/loans`,
    route(({ request }) => {
      const { companyId } = clientContext(request);
      return db()
        .loans.filter((l) => l.company_id === companyId)
        .map(({ company_id: _ignored, schedule: _s, ...l }) => ({ ...l, schedule: [] }));
    }),
  ),

  http.get(
    `${API}/loans/:id`,
    route(({ request, params }) => {
      const { companyId } = clientContext(request);
      const loan = db().loans.find((l) => l.id === params.id && l.company_id === companyId);
      if (!loan) fail(404, 'NOT_FOUND', 'Кредит не найден');
      const { company_id: _ignored, ...out } = loan;
      if (!out.schedule.length && out.next_payment) {
        const months = Math.max(1, Math.round(out.balance.value / out.next_payment.amount.value));
        out.schedule = calcPayment(out.balance.value, months, out.rate_percent, new Date(out.next_payment.date)).schedule.map((r, i) => ({
          ...r,
          date: new Date(new Date(out.next_payment!.date).getFullYear(), new Date(out.next_payment!.date).getMonth() + i, new Date(out.next_payment!.date).getDate()).toISOString().slice(0, 10),
        }));
      }
      return out;
    }),
  ),
];

function docOut(d: DocRecord): DocumentRef {
  const { company_id: _a, analyze_at: _b, data_url: _c, ...out } = d;
  return out;
}

const documentHandlers = [
  http.get(
    `${API}/document-types`,
    route(({ request }) => {
      currentUser(request);
      const url = new URL(request.url);
      const lf = url.searchParams.get('legal_form') as LegalForm | null;
      const product = url.searchParams.get('product_code') as ProductCode | null;
      return DOCUMENT_TYPES.filter((t) => (!lf || t.legal_forms.includes(lf)) && (!product || !t.required_for_products.length || t.required_for_products.includes(product)));
    }),
  ),

  http.get(
    `${API}/documents`,
    route(({ request }) => {
      const { companyId } = clientContext(request);
      const url = new URL(request.url);
      const scope = url.searchParams.get('scope');
      const appId = url.searchParams.get('application_id');
      const status = url.searchParams.get('status');
      return Object.values(db().documents)
        .filter((d) => d.company_id === companyId)
        .filter((d) => !scope || d.scope === scope)
        .filter((d) => !appId || d.application_id === appId)
        .filter((d) => !status || d.status === status)
        .sort((a, b) => b.uploaded_at.localeCompare(a.uploaded_at))
        .map(docOut);
    }),
  ),

  http.get(
    `${API}/documents/missing`,
    route(({ request }) => {
      const { companyId } = clientContext(request);
      const lf = legalForm(companyId);
      const items = [];
      const finType = lf === 'IP' ? 'tax_return' : 'fin_statements_2025';
      if (!hasCompanyDoc(companyId, finType)) {
        items.push({
          document_type: finType,
          title: DOCUMENT_TYPES.find((t) => t.code === finType)!.title,
          reason: 'Подтверждает выручку и помогает получить большую сумму',
          application_id: null,
        });
      }
      for (const app of Object.values(db().applications).filter((a) => a.company_id === companyId)) {
        for (const r of app.info_requests.filter((x) => x.status === 'open')) {
          for (const t of r.requested_document_types) {
            items.push({
              document_type: t,
              title: DOCUMENT_TYPES.find((d) => d.code === t)?.title ?? t,
              reason: `Банк запросил по заявке ${app.number}`,
              application_id: app.id,
            });
          }
        }
      }
      return { items };
    }),
  ),

  http.post(
    `${API}/documents`,
    route(async ({ request }) => {
      const { user, member, companyId } = clientContext(request);
      requirePermission(member, 'upload_documents');
      const form = await request.formData();
      const file = form.get('file');
      if (!(file instanceof File)) fail(422, 'VALIDATION_ERROR', 'Выберите файл', { file: 'Выберите файл' });
      if (file.size > 30 * 1024 * 1024) fail(422, 'VALIDATION_ERROR', 'Файл больше 30 МБ', { file: 'Файл больше 30 МБ' });

      const type = (form.get('document_type') as string | null) || '';
      const appId = (form.get('application_id') as string | null) || null;
      const irId = (form.get('info_request_id') as string | null) || null;
      const id = newDocId();
      const dataUrl = file.size < 400_000 ? await fileToDataUrl(file) : null;

      const doc: DocRecord = {
        id,
        company_id: companyId,
        document_type: type,
        title: DOCUMENT_TYPES.find((t) => t.code === type)?.title ?? file.name,
        scope: (form.get('scope') as 'company' | 'application') ?? 'company',
        application_id: appId,
        info_request_id: irId,
        file_name: file.name,
        size_bytes: file.size,
        version: 1,
        uploaded_by: person(user.id),
        uploaded_at: iso(),
        origin: 'upload',
        status: 'analyzing',
        status_reason: null,
        expires_at: null,
        analysis: {
          status: 'pending',
          detected_type: null,
          detected_type_confidence: null,
          extracted_fields: [],
          checks: [],
          issues: [],
          model: null,
          text_source: 'llm',
          analyzed_at: null,
        },
        analyze_at: Date.now() + 3000,
        data_url: dataUrl,
      };
      db().documents[id] = doc;

      if (!type) doc.title = file.name;
      return created(docOut(doc));
    }),
  ),

  http.post(
    `${API}/documents/from-lk`,
    route(async ({ request }) => {
      const { user, member, companyId } = clientContext(request);
      requirePermission(member, 'upload_documents');
      const data = await body<{ kind: string; period_from: string; period_to: string; info_request_id?: string }>(request);
      const titles: Record<string, [string, string]> = {
        bank_statement: ['bank_statement', 'Выписка по счёту в Альфа-Банке'],
        tax_data: ['tax_return', 'Налоговые данные из Альфа-Бизнеса'],
        fin_turnover: ['fin_statements_2025', 'Обороты по счетам из Альфа-Бизнеса'],
      };
      const [type, title] = titles[data.kind] ?? titles.bank_statement;
      const appId = data.info_request_id
        ? Object.values(db().applications).find((a) => a.info_requests.some((r) => r.id === data.info_request_id))?.id ?? null
        : null;
      const id = newDocId();
      const doc: DocRecord = {
        id,
        company_id: companyId,
        document_type: type,
        title: `${title} за ${data.period_from} - ${data.period_to}`,
        scope: appId ? 'application' : 'company',
        application_id: appId,
        info_request_id: data.info_request_id ?? null,
        file_name: `${type}_${data.period_from}_${data.period_to}.pdf`,
        size_bytes: 412_000,
        version: 1,
        uploaded_by: person(user.id),
        uploaded_at: iso(),
        origin: 'alfa_lk',
        status: 'accepted',
        status_reason: null,
        expires_at: null,
        analysis: null,
        analyze_at: null,
        data_url: null,
      };
      db().documents[id] = doc;
      finishAnalysis(doc);
      doc.document_type = type;
      return created(docOut(doc));
    }),
  ),

  http.get(
    `${API}/documents/:id`,
    route(({ request, params }) => {
      const { companyId } = clientContext(request);
      const d = db().documents[String(params.id)];
      if (!d || d.company_id !== companyId) fail(404, 'NOT_FOUND', 'Документ не найден');
      return docOut(d);
    }),
  ),

  http.get(
    `${API}/documents/:id/file`,
    route(({ request, params }) => {
      const { companyId } = clientContext(request);
      const id = String(params.id);
      if (id.startsWith('sign-')) {
        const [, appId, type] = id.match(/^sign-(.+)-(contract|surety|deal_approval)$/) ?? [];
        const app = findApp(appId, companyId);
        return HttpResponse.text(contractText(app, type), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
      }
      const d = db().documents[id];
      if (!d || d.company_id !== companyId) fail(404, 'NOT_FOUND', 'Документ не найден');
      if (d.data_url) {
        const [meta, data] = d.data_url.split(',');
        const mime = meta.match(/data:(.*);base64/)?.[1] ?? 'application/octet-stream';
        const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
        return new HttpResponse(bytes, { headers: { 'Content-Type': mime } });
      }
      return HttpResponse.text(`${d.title}\n\nДемо-документ: файл ${d.file_name} не хранится в моке.`, {
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }),
  ),

  http.post(
    `${API}/documents/:id/versions`,
    route(async ({ request, params }) => {
      const { user, member, companyId } = clientContext(request);
      requirePermission(member, 'upload_documents');
      const d = db().documents[String(params.id)];
      if (!d || d.company_id !== companyId) fail(404, 'NOT_FOUND', 'Документ не найден');
      const form = await request.formData();
      const file = form.get('file');
      if (!(file instanceof File)) fail(422, 'VALIDATION_ERROR', 'Выберите файл', { file: 'Выберите файл' });
      d.file_name = file.name;
      d.size_bytes = file.size;
      d.version += 1;
      d.uploaded_by = person(user.id);
      d.uploaded_at = iso();
      d.status = 'analyzing';
      d.status_reason = null;
      d.analysis = { status: 'pending', detected_type: null, detected_type_confidence: null, extracted_fields: [], checks: [], issues: [], model: null, text_source: 'llm', analyzed_at: null };
      d.analyze_at = Date.now() + 3000;
      d.data_url = file.size < 400_000 ? await fileToDataUrl(file) : null;
      return created(docOut(d));
    }),
  ),

  http.post(
    `${API}/documents/:id/analyze`,
    route(({ request, params }) => {
      const { member, companyId } = clientContext(request);
      requirePermission(member, 'upload_documents');
      const d = db().documents[String(params.id)];
      if (!d || d.company_id !== companyId) fail(404, 'NOT_FOUND', 'Документ не найден');
      d.status = 'analyzing';
      d.analysis = { status: 'pending', detected_type: null, detected_type_confidence: null, extracted_fields: [], checks: [], issues: [], model: null, text_source: 'llm', analyzed_at: null };
      d.analyze_at = Date.now() + 2500;
      return docOut(d);
    }),
  ),

  http.delete(
    `${API}/documents/:id`,
    route(({ request, params }) => {
      const { member, companyId } = clientContext(request);
      if (member.role === 'authorized_employee' || !has(member, 'upload_documents')) {
        fail(403, 'FORBIDDEN_ACTION', 'Удалять документы может собственник или бухгалтер', { allowed_roles: ['owner', 'director', 'cfo_or_accountant'] });
      }
      const d = db().documents[String(params.id)];
      if (!d || d.company_id !== companyId) fail(404, 'NOT_FOUND', 'Документ не найден');
      delete db().documents[d.id];
      return undefined;
    }),
  ),
];

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => resolve('');
    reader.readAsDataURL(file);
  });
}

function contractText(app: AppRecord, type: string) {
  const company = companyRecord(app.company_id).company;
  const amount = app.approved_amount ?? app.requested_amount;
  const term = app.approved_term_months ?? app.requested_term_months;
  const calc = calcPayment(amount.value, term, app.rate_percent);
  const fmt = (m: Money) => `${Math.round(m.value / 100).toLocaleString('ru-RU')} ₽`;
  const title = type === 'surety' ? 'ДОГОВОР ПОРУЧИТЕЛЬСТВА' : 'КРЕДИТНЫЙ ДОГОВОР';
  return [
    `${title} № ${app.number}`,
    '',
    'Демонстрационный документ прототипа. Не является офертой.',
    '',
    `Заёмщик: ${company.full_name}, ИНН ${company.inn}`,
    'Кредитор: АО «Альфа-Банк» (смоделировано)',
    '',
    `Сумма кредита: ${fmt(amount)}`,
    `Срок: ${term} мес.`,
    `Ставка: ${app.rate_percent}% годовых (условная)`,
    `Ежемесячный платёж: ${fmt(calc.monthly_payment)}`,
    `Переплата за весь срок: ${fmt(calc.overpayment)}`,
    '',
    type === 'surety'
      ? 'Поручитель отвечает перед кредитором за исполнение заёмщиком обязательств по кредитному договору.'
      : 'Заёмщик обязуется вернуть кредит и уплатить проценты по графику платежей.',
  ].join('\n');
}

const feedHandlers = [
  http.get(
    `${API}/feed`,
    route(({ request }) => {
      const { companyId } = clientContext(request);
      const url = new URL(request.url);
      const type = url.searchParams.get('type');
      const page = Number(url.searchParams.get('page') ?? 1);
      const size = Number(url.searchParams.get('page_size') ?? 10);
      const items = FEED[legalForm(companyId)].filter((f) => !type || f.type === type);
      return { items: items.slice((page - 1) * size, page * size), page, page_size: size, total: items.length };
    }),
  ),

  http.get(
    `${API}/notifications`,
    route(({ request }) => {
      const user = currentUser(request);
      const unread = new URL(request.url).searchParams.get('unread') === 'true';
      return db()
        .notifications.filter((n) => n.user_id === user.id && (!unread || !n.read))
        .map(({ user_id: _ignored, ...n }) => n);
    }),
  ),

  http.post(
    `${API}/notifications/:id/read`,
    route(({ request, params }) => {
      const user = currentUser(request);
      const n = db().notifications.find((x) => x.id === params.id && x.user_id === user.id);
      if (n) n.read = true;
      return undefined;
    }),
  ),

  http.post(
    `${API}/notifications/read-all`,
    route(({ request }) => {
      const user = currentUser(request);
      db().notifications.filter((n) => n.user_id === user.id).forEach((n) => (n.read = true));
      return undefined;
    }),
  ),
];

function queueItem(app: AppRecord): BankQueueItem {
  const score = ensureScoring(app);
  const company = companyRecord(app.company_id).company;
  const stop = app.bank.checks.some((c) => c.status === 'stop');
  const warn = app.bank.checks.find((c) => c.status === 'warning');
  const queuedAt = app.bank.queued_at ?? app.updated_at;
  return {
    ...toSummary(app, null),
    company: { id: company.id, short_name: company.short_name, legal_form: company.legal_form, inn: company.inn },
    score: score.total,
    risk_level: score.total >= 70 ? 'low' : score.total >= 55 ? 'medium' : 'high',
    checks_status: stop ? 'stop' : warn ? 'warning' : 'ok',
    checks_hint: stop ? 'стоп-фактор' : warn ? `внимание: ${warn.summary.toLowerCase()}` : null,
    auto_decided: app.bank.auto_decided,
    in_queue_minutes: Math.max(0, Math.round((Date.now() - Date.parse(queuedAt)) / 60000)),
    assignee: app.bank.assignee_user_id ? bankPerson(app.bank.assignee_user_id) : null,
  };
}

function bankPerson(userId: string) {
  const u = db().users.find((x) => x.id === userId)!;
  return { user_id: u.id, name: shortName(u), role: 'authorized_employee' as const };
}

function bankDetail(app: AppRecord) {
  ensureScoring(app);
  const company = companyRecord(app.company_id);
  return {
    ...toDetail(app, null, null),
    company: { ...company, available_actions: [] },
    finance: db().finance[app.company_id],
    checks: app.bank.checks,
    scoring: app.bank.score!,
    documents: Object.values(db().documents)
      .filter((d) => d.company_id === app.company_id && (!d.application_id || d.application_id === app.id))
      .map(docOut),
    ai_summary: app.bank.ai_summary,
    audit: app.bank.audit,
  };
}

function aiSummary(app: AppRecord) {
  const score = ensureScoring(app);
  const load = appLoad(app, app.requested_amount, app.requested_term_months);
  const company = companyRecord(app.company_id).company;
  const stub = isLlmStub();
  return {
    text: `${company.short_name} работает с ${company.registration_date.slice(0, 4)} года, просит ${Math.round(app.requested_amount.value / 100).toLocaleString('ru-RU')} ₽ на ${app.requested_term_months} мес. на «${app.purpose.toLowerCase()}». Балл ${score.total}. Нагрузка с новым платежом ${load.load_percent.toString().replace('.', ',')}%${load.load_percent > load.threshold_percent ? ', выше порога' : ''}. Кредитная история без просрочек, обороты стабильные с сезонным спадом.`,
    risks: load.load_percent > load.threshold_percent ? ['Нагрузка выше порога 30%', 'Нет отчётности за 2025 год'] : ['Сезонный спад поступлений'],
    to_check: ['Сверить обороты с выпиской', 'Уточнить планы по погашению кредита в другом банке'],
    text_source: stub ? ('template' as const) : ('llm' as const),
    generated_at: iso(),
  };
}

function decisionFromRequest(app: AppRecord, data: BankDecisionRequest) {
  if (data.type === 'approve') return buildDecision(app, 'approved', 'underwriter');
  if (data.type === 'reject') {
    const d = buildDecision(app, 'rejected', 'underwriter');
    const titles = data.reason_codes.map((c) => REJECTION_REASONS.find((r) => r.code === c)?.title).filter(Boolean);
    if (titles.length) d.explanation_text = `Сейчас не можем выдать кредит. Что повлияло: ${titles.join(', ').toLowerCase()}`;
    return d;
  }
  if (data.type === 'counter_offer') {
    return buildDecision(app, 'counter_offer', 'underwriter', {
      amount: data.amount,
      term_months: data.term_months,
      product_code: data.product_code,
      rate_percent: data.rate_percent,
    });
  }
  return null;
}

function infoRequestFrom(data: Extract<BankDecisionRequest, { type: 'request_info' }>): InfoRequest {
  return {
    id: nextId('ir'),
    created_at: iso(),
    due_at: data.due_at,
    question: data.question,
    purpose_text: data.purpose_text ?? null,
    requested_document_types: data.requested_document_types,
    lk_available: data.requested_document_types.some((t) => DOCUMENT_TYPES.find((d) => d.code === t)?.can_generate_from_lk),
    status: 'open',
    response: null,
  };
}

const bankHandlers = [
  http.get(
    `${API}/bank/applications`,
    route(({ request }) => {
      const user = bankContext(request);
      const url = new URL(request.url);
      const statuses = url.searchParams.getAll('status') as ApplicationStatus[];
      const risk = url.searchParams.get('risk');
      const checks = url.searchParams.get('checks');
      const mine = url.searchParams.get('mine') === 'true';
      const sort = url.searchParams.get('sort') ?? 'queue_time';

      let items = Object.values(db().applications)
        .filter((a) => BANK_STATUSES.includes(a.status) || a.bank.auto_decided)
        .filter((a) => !statuses.length || statuses.includes(a.status))
        .map(queueItem);
      if (mine) items = items.filter((i) => i.assignee?.user_id === user.id);
      if (risk === 'high') items = items.filter((i) => i.risk_level === 'high' || i.checks_status === 'warning');
      if (checks === 'stop') items = items.filter((i) => i.checks_status === 'stop');
      items.sort((a, b) =>
        sort === 'risk' ? (a.score ?? 0) - (b.score ?? 0) : b.in_queue_minutes - a.in_queue_minutes,
      );

      items.sort((a, b) => Number(a.auto_decided) - Number(b.auto_decided));
      return { items, page: 1, page_size: items.length, total: items.length };
    }),
  ),

  http.post(
    `${API}/bank/applications/:id/take`,
    route(({ request, params }) => {
      const user = bankContext(request);
      const app = findApp(String(params.id));
      if (!BANK_STATUSES.includes(app.status)) fail(409, 'INVALID_TRANSITION', 'Заявка уже не в очереди');
      app.bank.assignee_user_id = user.id;
      if (app.status === 'submitted') {
        app.auto_check_at = null;
        ensureScoring(app);
        setStatus(app, 'in_review', 'Заявку взял аналитик', null, { type: 'bank', name: shortName(user) });
      }
      app.bank.audit.push({ at: iso(), actor: shortName(user), action: 'Взял в работу', details: null });
      return bankDetail(app);
    }),
  ),

  http.get(
    `${API}/bank/applications/:id`,
    route(({ request, params }) => {
      bankContext(request);
      return bankDetail(findApp(String(params.id)));
    }),
  ),

  http.post(
    `${API}/bank/applications/:id/ai-summary`,
    route(async ({ request, params }) => {
      const user = bankContext(request);
      const app = findApp(String(params.id));
      await delay(900);
      app.bank.ai_summary = aiSummary(app);
      app.bank.audit.push({ at: iso(), actor: shortName(user), action: 'Обновил ИИ-резюме', details: null });
      return bankDetail(app);
    }),
  ),

  http.post(
    `${API}/bank/applications/:id/rerun-checks`,
    route(({ request, params }) => {
      const user = bankContext(request);
      const app = findApp(String(params.id));
      app.bank.score = null;
      ensureScoring(app);
      app.bank.audit.push({ at: iso(), actor: shortName(user), action: 'Повторил автопроверки', details: `Балл ${app.bank.score!.total}` });
      return bankDetail(app);
    }),
  ),

  http.get(
    `${API}/bank/applications/:id/counter-offer-options`,
    route(({ request, params }) => {
      bankContext(request);
      const app = findApp(String(params.id));
      const finance = db().finance[app.company_id];
      const t = db().thresholds;
      const free = finance.free_cash_flow.value.value;
      const current = finance.debts.total_monthly_payment.value;
      const maxPayment = (free * t.load_target_percent) / 100 - current;
      const options = [24, 36, 48]
        .map((term) => {
          let amount = app.requested_amount.value;
          while (calcPayment(amount, term, app.rate_percent).monthly_payment.value > maxPayment && amount > 10_000_000) amount -= 10_000_000;
          const calc = calcPayment(amount, term, app.rate_percent);
          return {
            product_code: app.product_code,
            amount: { value: amount, currency: 'RUB' as const },
            term_months: term,
            monthly_payment: calc.monthly_payment,
            load: appLoad(app, { value: amount, currency: 'RUB' }, term),
            score: 0,
          };
        })
        .filter((o, i, arr) => arr.findIndex((x) => x.amount.value === o.amount.value && x.term_months === o.term_months) === i);
      for (const o of options) {
        o.score = o.load.load_percent <= t.load_target_percent ? 78 : o.load.load_percent <= t.load_threshold_percent ? 68 : 58;
      }
      return { options };
    }),
  ),

  http.post(
    `${API}/bank/applications/:id/decision/preview`,
    route(async ({ request, params }) => {
      bankContext(request);
      const app = findApp(String(params.id));
      const data = await body<BankDecisionRequest>(request);
      if (data.type === 'request_info') return { client_view: infoRequestFrom(data) };
      return { client_view: decisionFromRequest(app, data) };
    }),
  ),

  http.post(
    `${API}/bank/applications/:id/decision`,
    route(async ({ request, params }) => {
      const user = bankContext(request);
      const app = findApp(String(params.id));
      if (app.status !== 'in_review' && app.status !== 'submitted') {
        fail(409, 'INVALID_TRANSITION', 'Решение можно принять только по заявке на рассмотрении');
      }
      const data = await body<BankDecisionRequest>(request);
      const errors: Record<string, string> = {};
      if (data.type === 'counter_offer') {
        if (!data.amount?.value) errors.amount = 'Укажите сумму';
        if (!data.term_months) errors.term_months = 'Укажите срок';
        if (!data.reason_code) errors.reason_code = 'Выберите причину';
      }
      if (data.type === 'request_info') {
        if (!data.question?.trim()) errors.question = 'Напишите вопрос';
        if (!data.requested_document_types?.length) errors.requested_document_types = 'Выберите документы';
        if (!data.due_at) errors.due_at = 'Укажите срок';
      }
      if (data.type === 'reject' && !data.reason_codes?.length) errors.reason_codes = 'Выберите причину';
      if (Object.keys(errors).length) fail(422, 'VALIDATION_ERROR', 'Проверьте поля', errors);

      app.bank.assignee_user_id ??= user.id;
      if (data.type === 'request_info') {
        const r = infoRequestFrom(data);
        app.info_requests.push(r);
        setStatus(app, 'info_requested', 'Банк запросил информацию', r.question, { type: 'bank', name: null });
        notify(companyUserIds(app.company_id, 'upload_documents').filter((id) => id === app.created_by || id === (db().taskAssignees[`ir:${r.id}`] ?? app.created_by)), {
          title: `Банк просит уточнить данные по заявке ${app.number}`,
          text: r.question,
          application_id: app.id,
          route: `/applications/${app.id}/info-requests/${r.id}`,
        });
      } else {
        applyDecision(app, decisionFromRequest(app, data)!);
      }
      app.bank.audit.push({ at: iso(), actor: shortName(user), action: `Решение: ${data.type}`, details: 'comment' in data ? data.comment ?? null : null });
      return bankDetail(app);
    }),
  ),

  http.get(`${API}/bank/info-request-templates`, route(({ request }) => (bankContext(request), INFO_REQUEST_TEMPLATES))),
  http.get(`${API}/bank/rejection-reasons`, route(({ request }) => (bankContext(request), REJECTION_REASONS))),

  http.get(
    `${API}/bank/dashboard`,
    route(({ request }) => {
      bankContext(request);
      const apps = Object.values(db().applications);
      const statuses: ApplicationStatus[] = ['draft', 'submitted', 'in_review', 'info_requested', 'approved', 'counter_offer', 'rejected', 'signing', 'issued', 'cancelled'];
      const decided = apps.filter((a) => a.decision);
      return {
        period: '7d',
        by_status: Object.fromEntries(statuses.map((s) => [s, apps.filter((a) => a.status === s).length])),
        avg_decision_minutes: 47,
        auto_decision_share: decided.length ? decided.filter((a) => a.bank.auto_decided).length / decided.length : 0.38,
        info_request_share: apps.length ? apps.filter((a) => a.info_requests.length).length / apps.length : 0.12,
      };
    }),
  ),

  http.get(`${API}/bank/settings/scoring`, route(({ request }) => (bankContext(request), db().thresholds))),

  http.put(
    `${API}/bank/settings/scoring`,
    route(async ({ request }) => {
      const user = bankContext(request);
      if (user.bank_role !== 'bank_admin') fail(403, 'FORBIDDEN_ACTION', 'Настройки меняет администратор', { allowed_roles: [] });
      db().thresholds = await body<ScoringThresholds>(request);
      return db().thresholds;
    }),
  ),
];

const serviceHandlers = [
  http.get(
    `${API}/health`,
    route(() => ({
      status: 'ok',
      db: 'ok',
      llm: isLlmStub() ? 'stub' : 'up',
      llm_models: isLlmStub() ? { text: null, vision: null } : { text: 'qwen2.5-7b-instruct', vision: 'qwen2.5-vl-7b' },
      mocks: { alfa_lk: 'ok', registry: 'ok', bki: 'ok', fns: 'ok' },
      demo_mode: true,
    })),
  ),

  http.post(`${API}/__mock/reset`, route(() => (resetDb(), undefined))),
];

export const handlers = [
  ...authHandlers,
  ...companyHandlers,
  ...teamHandlers,
  ...taskHandlers,
  ...productHandlers,
  ...applicationHandlers,
  ...documentHandlers,
  ...feedHandlers,
  ...bankHandlers,
  ...serviceHandlers,
];
