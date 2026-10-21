import type { DecisionFactor, StatusText } from '@/features/applications/types';
import type { CheckResult, ScoringResult, ScoringThresholds } from '@/features/bank/types';
import type { FinanceSummary, Readiness, ReadinessItem } from '@/features/company/types';
import type { LoadCalc, MatchingSession, Recommendation, RecommendResponse, RecommendWarning } from '@/features/matching/types';
import type { PaymentCalcResponse } from '@/features/products/types';
import type { ApplicationStatus, FitLevel, Money, ProductCode } from '@/shared/types/common';

import { PRODUCTS } from './fixtures';

export const DEFAULT_RATE = 15;

const money = (value: number): Money => ({ value: Math.round(value), currency: 'RUB' });

export function annuityPayment(amount: number, months: number, ratePercent: number) {
  const r = ratePercent / 100 / 12;
  if (r === 0) return Math.round(amount / months);
  return Math.round((amount * r) / (1 - Math.pow(1 + r, -months)));
}

export function calcPayment(
  amount: number,
  months: number,
  ratePercent: number,
  startDate = new Date(),
): PaymentCalcResponse {
  const payment = annuityPayment(amount, months, ratePercent);
  const r = ratePercent / 100 / 12;
  let balance = amount;
  const schedule = [];

  for (let n = 1; n <= months; n++) {
    const interest = Math.round(balance * r);
    const isLast = n === months;
    const principal = isLast ? balance : payment - interest;
    balance -= principal;
    const date = new Date(startDate.getFullYear(), startDate.getMonth() + n, Math.min(startDate.getDate(), 28));
    schedule.push({
      n,
      date: date.toISOString().slice(0, 10),
      payment: money(isLast ? principal + interest : payment),
      principal: money(principal),
      interest: money(interest),
      balance: money(Math.max(balance, 0)),
    });
  }

  const total = schedule.reduce((sum, row) => sum + row.payment.value, 0);

  const overpayment = payment * months - amount;

  return {
    monthly_payment: money(payment),
    total_payment: money(total),
    overpayment: money(overpayment),
    schedule,
  };
}

export function loadCalc(
  finance: FinanceSummary,
  newPayment: number,
  thresholds: ScoringThresholds,
): LoadCalc {
  const free = finance.free_cash_flow.value.value;
  const current = finance.debts.total_monthly_payment.value;
  const load = free > 0 ? ((newPayment + current) / free) * 100 : 100;
  return {
    free_cash_flow: money(free),
    current_payments: money(current),
    new_payment: money(newPayment),
    load_percent: Math.round(load * 10) / 10,
    threshold_percent: thresholds.load_threshold_percent,
    target_percent: thresholds.load_target_percent,
  };
}

export function businessAgeMonths(registrationDate: string, now = new Date()) {
  const reg = new Date(registrationDate);
  return (now.getFullYear() - reg.getFullYear()) * 12 + (now.getMonth() - reg.getMonth());
}

function loadPoints(load: number) {
  if (load <= 26.5) return 20;
  if (load <= 30) return 14;
  if (load <= 40) return 4;
  return 0;
}

export function scoreApplication(params: {
  registrationDate: string;
  finance: FinanceSummary;
  load: LoadCalc;
  thresholds: ScoringThresholds;
  hasOverdue: boolean;
}): ScoringResult {
  const age = businessAgeMonths(params.registrationDate);
  const turnover = params.finance.monthly_inflow_avg.value.value / 100;

  const factors: ScoringResult['factors'] = [
    {
      code: 'business_age',
      title: 'Срок работы бизнеса',
      value_text: `${Math.floor(age / 12)} лет`,
      points: age >= 36 ? 20 : age >= 12 ? 12 : 4,
      max_points: 20,
    },
    {
      code: 'credit_history',
      title: 'Кредитная история',
      value_text: params.hasOverdue ? 'есть просрочки' : 'без просрочек',
      points: params.hasOverdue ? 5 : 18,
      max_points: 25,
    },
    {
      code: 'debt_load',
      title: 'Долговая нагрузка',
      value_text: `${params.load.load_percent.toString().replace('.', ',')}%`,
      points: loadPoints(params.load.load_percent),
      max_points: 25,
    },
    {
      code: 'industry',
      title: 'Отрасль',
      value_text: 'средний риск',
      points: 10,
      max_points: 15,
    },
    {
      code: 'turnover',
      title: 'Обороты по счёту',
      value_text: `${Math.round(turnover / 1000).toLocaleString('ru-RU')} тыс. ₽ в месяц`,
      points: turnover >= 1_000_000 ? 10 : 6,
      max_points: 15,
    },
  ];

  const total = factors.reduce((sum, f) => sum + f.points, 0);
  const stopFactors = params.hasOverdue ? ['Просроченная задолженность'] : [];
  const t = params.thresholds;

  let outcome: ScoringResult['outcome'];
  if (stopFactors.length || total < t.manual_review_min) outcome = 'rejected';
  else if (total >= t.approve_min) outcome = 'approved';
  else if (total >= t.counter_offer_min) outcome = 'counter_offer';
  else outcome = 'manual_review';

  return { total, factors, thresholds: t, outcome, stop_factors: stopFactors };
}

export function decisionFactors(scoring: ScoringResult): DecisionFactor[] {
  return scoring.factors.map((f) => {
    const share = f.points / f.max_points;
    const impact = share >= 0.7 ? 'positive' : share <= 0.3 ? 'negative' : 'neutral';
    const texts: Record<string, string> = {
      business_age: 'Компания давно работает, это повышает доверие',
      credit_history: 'Вы платите по кредитам вовремя',
      debt_load:
        impact === 'negative'
          ? 'Платежи по всем кредитам заняли бы больше 30% свободного денежного потока'
          : 'Платежи по кредитам укладываются в свободный денежный поток',
      industry: 'Отрасль со средним уровнем риска',
      turnover: 'Поступления на счёт стабильные',
    };
    return { code: f.code, title: f.title, impact, text: texts[f.code] ?? f.value_text };
  });
}

export function autoChecks(params: {
  load: LoadCalc;
  registryStatus: string;
  hasOverdue: boolean;
  now: string;
}): CheckResult[] {
  const loadStatus =
    params.load.load_percent > params.load.threshold_percent ? 'warning' : 'ok';
  return [
    {
      source: 'registry',
      status: params.registryStatus === 'active' ? 'ok' : 'stop',
      summary: params.registryStatus === 'active' ? 'Компания действует, данные совпадают' : 'Компания в процессе ликвидации',
      details: { status: params.registryStatus },
      checked_at: params.now,
      is_mock: true,
    },
    {
      source: 'credit_bureau',
      status: params.hasOverdue ? 'stop' : 'ok',
      summary: params.hasOverdue ? 'Есть просрочка больше 30 дней' : 'Просрочек нет, 3 действующих кредита',
      details: { active_loans: 3, overdue_days_max: params.hasOverdue ? 45 : 0 },
      checked_at: params.now,
      is_mock: true,
    },
    {
      source: 'turnover',
      status: 'ok',
      summary: 'Обороты по счёту стабильны, сезонный спад в январе и феврале',
      details: {},
      checked_at: params.now,
      is_mock: true,
    },
    {
      source: 'fns_transparent',
      status: 'ok',
      summary: 'Налоговой задолженности нет, адрес не массовый',
      details: {},
      checked_at: params.now,
      is_mock: true,
    },
    {
      source: 'load',
      status: loadStatus,
      summary: `Нагрузка ${params.load.load_percent.toString().replace('.', ',')}% при пороге ${params.load.threshold_percent}%`,
      details: { load_percent: params.load.load_percent },
      checked_at: params.now,
      is_mock: true,
    },
  ];
}

export function pickProduct(session: MatchingSession): ProductCode {
  const { purpose, need_type, disbursement, amount } = session.need;
  if (need_type === 'recurring') return amount && amount.value > 500_000_000 ? 'credit_line' : 'overdraft';
  if (disbursement === 'tranches') return 'credit_line';
  if (purpose === 'equipment' || purpose === 'repair') return 'investment';
  if (purpose === 'gov_contract') return 'credit_line';
  if (amount && amount.value <= 100_000_000 && purpose === 'other') return 'express';
  return 'working_capital';
}

function productInfo(code: ProductCode) {
  const p = PRODUCTS.find((x) => x.code === code)!;
  return { code: p.code, name: p.name, is_fictional: p.is_fictional, rate: Math.max(p.rate_from_percent, DEFAULT_RATE) };
}

function fit(load: number, thresholds: ScoringThresholds): { fit: FitLevel; fit_label: string } {
  if (load <= thresholds.load_target_percent) return { fit: 'high', fit_label: 'Высокий шанс' };
  if (load <= thresholds.load_threshold_percent) return { fit: 'medium', fit_label: 'Средний шанс' };
  return { fit: 'low', fit_label: 'На границе' };
}

function buildRecommendation(
  rank: number,
  code: ProductCode,
  amount: number,
  term: number,
  finance: FinanceSummary,
  thresholds: ScoringThresholds,
  reasons: Recommendation['reasons'],
): Recommendation {
  const p = productInfo(code);
  const calc = calcPayment(amount, term, p.rate);
  const load = loadCalc(finance, calc.monthly_payment.value, thresholds);
  return {
    rank,
    product: { code: p.code, name: p.name, is_fictional: p.is_fictional },
    amount: money(amount),
    term_months: term,
    rate_percent: p.rate,
    monthly_payment: calc.monthly_payment,
    overpayment: calc.overpayment,
    load,
    ...fit(load.load_percent, thresholds),
    reasons,
  };
}

function fitToTarget(amount: number, term: number, maxTerm: number, finance: FinanceSummary, thresholds: ScoringThresholds, rate: number) {
  const current = finance.debts.total_monthly_payment.value;
  const free = finance.free_cash_flow.value.value;
  const maxPayment = (free * thresholds.load_target_percent) / 100 - current;

  let t = term;
  while (annuityPayment(amount, t, rate) > maxPayment && t < maxTerm) t = Math.min(maxTerm, t + 12);

  let a = amount;
  while (annuityPayment(a, t, rate) > maxPayment && a > 10_000_000) a -= 10_000_000;

  return { amount: a, term: t };
}

export function recommend(
  session: MatchingSession,
  finance: FinanceSummary,
  thresholds: ScoringThresholds,
  readiness: Readiness,
): RecommendResponse {
  const amount = session.need.amount?.value ?? 100_000_000;
  const term = session.need.term_months ?? 12;
  const code = pickProduct(session);
  const product = PRODUCTS.find((p) => p.code === code)!;
  const rate = productInfo(code).rate;

  const requestedCalc = calcPayment(amount, term, rate);
  const requestedLoad = loadCalc(finance, requestedCalc.monthly_payment.value, thresholds);

  const baseReasons: Recommendation['reasons'] = [
    {
      code: 'purpose_fit',
      text: `${product.name} подходит под вашу цель`,
      data_ref: 'need.purpose',
    },
    {
      code: 'business_age',
      text: 'Бизнес работает больше 3 лет',
      data_ref: 'company.registration_date',
    },
  ];
  if (finance.seasonality) {
    baseReasons.push({
      code: 'seasonality',
      text: 'Учли спад поступлений в январе и феврале',
      data_ref: 'finance.seasonality',
    });
  }

  const warnings: RecommendWarning[] = [];
  let primary: Recommendation;
  const alternatives: Recommendation[] = [];

  if (requestedLoad.load_percent > thresholds.load_threshold_percent) {
    const fitted = fitToTarget(amount, term, Math.max(product.term_max_months, 36), finance, thresholds, rate);
    primary = buildRecommendation(1, code, fitted.amount, fitted.term, finance, thresholds, [
      ...baseReasons,
      {
        code: 'load_fit',
        text: 'Платёж укладывается в свободный денежный поток с запасом',
        data_ref: 'finance.free_cash_flow',
      },
    ]);
    warnings.push({
      code: 'LOAD_ABOVE_THRESHOLD',
      text: `С суммой ${formatRub(amount)} на ${term} мес. платежи по всем кредитам займут ${requestedLoad.load_percent
        .toString()
        .replace('.', ',')}% свободного денежного потока. Банк чаще одобряет до ${thresholds.load_threshold_percent}%`,
      suggested: { amount: primary.amount, term_months: primary.term_months },
    });
    if (fitted.term !== term) {
      warnings.push({
        code: 'TERM_EXTENDED',
        text: `Срок увеличен до ${fitted.term} мес., чтобы снизить ежемесячный платёж`,
        suggested: null,
      });
    }
    alternatives.push(
      buildRecommendation(2, code, amount, term, finance, thresholds, [
        { code: 'as_requested', text: 'Ровно та сумма и срок, которые вы указали', data_ref: 'need.amount' },
      ]),
    );
  } else {
    primary = buildRecommendation(1, code, amount, term, finance, thresholds, [
      ...baseReasons,
      {
        code: 'load_ok',
        text: 'Нагрузка в пределах нормы',
        data_ref: 'finance.free_cash_flow',
      },
    ]);
  }

  const altCode: ProductCode =
    code === 'credit_line' ? 'overdraft' : code === 'overdraft' ? 'credit_line' : 'credit_line';
  const alt = PRODUCTS.find((p) => p.code === altCode)!;
  const altAmount = Math.min(Math.max(primary.amount.value, alt.amount_min.value), alt.amount_max.value);
  alternatives.push(
    buildRecommendation(alternatives.length + 2, altCode, altAmount, Math.min(Math.max(primary.term_months, alt.term_min_months), alt.term_max_months), finance, thresholds, [
      { code: 'flexible', text: 'Можно брать деньги частями и платить проценты только за использованное', data_ref: null },
    ]),
  );

  if (finance.stale.reason) {
    warnings.push({ code: 'DATA_STALE', text: finance.stale.text ?? 'Данные устарели', suggested: null });
  }

  return {
    session_id: session.id,
    is_preliminary: session.extra.skipped,
    primary,
    alternatives: alternatives.slice(0, 2),
    requested: { amount: money(amount), term_months: term, load: requestedLoad },
    warnings,
    readiness: {
      ok_count: readiness.ok_count,
      total: readiness.total,
      items: readiness.items.map(({ code, title, status }) => ({ code, title, status })),
    },
    submit_requirements_text:
      'Для отправки нужно: согласие на запрос в бюро кредитных историй и согласие на обработку персональных данных. Остальное подставим из Альфа-Бизнеса',
    text_source: 'llm',
  };
}

export function readiness(params: {
  registrationDate: string;
  registryStatus: string;
  finance: FinanceSummary;
  thresholds: ScoringThresholds;
  hasFinStatements: boolean;
  amount?: number;
  term?: number;
}): Readiness {
  const age = businessAgeMonths(params.registrationDate);
  const newPayment = params.amount && params.term ? annuityPayment(params.amount, params.term, DEFAULT_RATE) : 0;
  const load = loadCalc(params.finance, newPayment, params.thresholds);
  const loadStatus = load.load_percent <= params.thresholds.load_target_percent ? 'ok' : load.load_percent <= params.thresholds.load_threshold_percent ? 'warning' : 'fail';

  const items: ReadinessItem[] = [
    {
      code: 'business_age',
      title: 'Срок работы бизнеса',
      status: age >= 12 ? 'ok' : 'warning',
      value_text: `${Math.floor(age / 12)} лет ${age % 12} мес.`,
      explanation: 'Банки охотнее кредитуют бизнес, который работает больше года',
      how_to_improve: null,
      action: null,
    },
    {
      code: 'debt_load',
      title: 'Долговая нагрузка',
      status: loadStatus,
      value_text: `${load.load_percent.toString().replace('.', ',')}%`,
      explanation: `Доля платежей по кредитам в свободном денежном потоке. Банк ориентируется на ${params.thresholds.load_threshold_percent}%`,
      how_to_improve: loadStatus === 'ok' ? null : 'Уменьшите сумму или увеличьте срок, чтобы снизить платёж',
      action: null,
    },
    {
      code: 'tax_debt',
      title: 'Налоговая задолженность',
      status: 'ok',
      value_text: 'нет',
      explanation: 'По данным сервиса ФНС «Прозрачный бизнес»',
      how_to_improve: null,
      action: null,
    },
    {
      code: 'credit_history',
      title: 'Кредитная история',
      status: 'ok',
      value_text: 'без просрочек',
      explanation: 'По данным бюро кредитных историй',
      how_to_improve: null,
      action: null,
    },
    {
      code: 'documents',
      title: 'Документы',
      status: params.hasFinStatements ? 'ok' : 'warning',
      value_text: params.hasFinStatements ? 'всё есть' : 'нет отчётности за 2025',
      explanation: 'Отчётность подтверждает выручку и помогает получить большую сумму',
      how_to_improve: params.hasFinStatements ? null : 'Загрузите бухгалтерскую отчётность за 2025 год',
      action: params.hasFinStatements
        ? null
        : { type: 'upload_document', document_type: 'fin_statements_2025', route: '/documents' },
    },
    {
      code: 'turnover',
      title: 'Обороты по счёту',
      status: 'ok',
      value_text: `${formatRub(params.finance.monthly_inflow_avg.value.value)} в месяц`,
      explanation: 'Средние поступления за 12 месяцев',
      how_to_improve: null,
      action: null,
    },
    {
      code: 'registry_status',
      title: 'Статус в реестре',
      status: params.registryStatus === 'active' ? 'ok' : 'fail',
      value_text: params.registryStatus === 'active' ? 'действует' : 'ликвидация',
      explanation: 'По данным ЕГРЮЛ или ЕГРИП',
      how_to_improve: null,
      action: null,
    },
  ];

  const ok = items.filter((i) => i.status === 'ok').length;
  const fails = items.filter((i) => i.status === 'fail').length;

  return {
    level: fails ? 'low' : ok >= 6 ? 'high' : 'medium',
    ok_count: ok,
    total: items.length,
    items,
    summary_text: fails
      ? 'Есть факторы, которые мешают получить кредит. Посмотрите, что можно улучшить'
      : ok >= 6
        ? 'Вы хорошо готовы к кредиту'
        : 'В целом вы готовы к кредиту, но есть что улучшить',
    text_source: 'llm',
    disclaimer: 'Это ориентир, а не решение банка',
    calculated_at: new Date().toISOString(),
  };
}

export function formatRub(kopecks: number) {
  return `${Math.round(kopecks / 100).toLocaleString('ru-RU')} ₽`;
}

export function defaultStatusText(status: ApplicationStatus): StatusText {
  const map: Record<ApplicationStatus, Omit<StatusText, 'due_at'>> = {
    draft: { now: 'Заявка не отправлена', next: 'Заполните данные и отправьте заявку в банк', actor: 'client' },
    submitted: { now: 'Банк скоро возьмёт заявку в работу', next: 'Проверим данные компании и кредитную историю', actor: 'system' },
    in_review: { now: 'Проверяем данные и считаем решение. От вас ничего не нужно', next: 'Покажем решение здесь же', actor: 'bank' },
    info_requested: { now: 'Банку не хватает информации, ответьте на запрос', next: 'После ответа продолжим рассмотрение', actor: 'client' },
    approved: { now: 'Можно переходить к подписанию', next: 'Подпишите договор по правилам компании', actor: 'client' },
    counter_offer: { now: 'Банк готов выдать кредит на других условиях', next: 'Примите предложение или откажитесь от него', actor: 'client' },
    rejected: { now: 'Сейчас не можем выдать кредит', next: 'Посмотрите, что повлияло и что можно улучшить', actor: 'bank' },
    signing: { now: 'Ждём подписи по правилам компании', next: 'После всех подписей деньги поступят на счёт', actor: 'client' },
    issued: { now: 'Деньги на счёте', next: 'Платите по графику', actor: 'system' },
    cancelled: { now: 'Заявка отозвана', next: 'Можно подать новую заявку', actor: 'client' },
  };
  return { ...map[status], due_at: null };
}
