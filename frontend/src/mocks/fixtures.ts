import type { InfoRequestTemplate, RejectionReason, ScoringThresholds } from '@/features/bank/types';
import type { CompanyProfile, FinanceSummary } from '@/features/company/types';
import type { DocumentType } from '@/features/documents/types';
import type { FeedItem } from '@/features/feed/types';
import type { Loan } from '@/features/loans/types';
import type { PreapprovedOffer, Product } from '@/features/products/types';
import type { Member, SigningRules } from '@/features/team/types';
import type { BankRole, LegalForm, Permission, UserRole } from '@/shared/types/common';

export const DEMO_PASSWORD = 'alfa2026';

export const DEMO_INVITE_CODE = '4821-KX';

export const DEMO_SIGN_CODE = '4821';

export const rub = (rubles: number) => ({ value: Math.round(rubles * 100), currency: 'RUB' as const });

export const DEFAULT_PERMISSIONS: Record<UserRole, Permission[]> = {
  owner: ['submit_applications', 'upload_documents', 'sign', 'accept_offers', 'manage_team'],
  director: ['submit_applications', 'upload_documents', 'sign', 'accept_offers'],
  cfo_or_accountant: ['upload_documents', 'sign'],
  financing_employee: ['submit_applications', 'upload_documents'],
  banking_employee: ['submit_applications', 'upload_documents'],
  authorized_employee: ['upload_documents'],
};

export type UserRecord = {
  id: string;
  login: string;
  password: string;
  last_name: string;
  first_name: string;
  middle_name: string | null;
  birth_date: string | null;
  company_id: string | null;
  bank_role: BankRole | null;
  position: string;
};

export const USERS: UserRecord[] = [
  {
    id: 'u-smirnov',
    login: 'petr.smirnov@test.local',
    password: DEMO_PASSWORD,
    last_name: 'Смирнов',
    first_name: 'Пётр',
    middle_name: 'Иванович',
    birth_date: '1978-05-14',
    company_id: 'c-mph',
    bank_role: null,
    position: 'Собственник, генеральный директор',
  },
  {
    id: 'u-petrov',
    login: 'sergey.petrov@test.local',
    password: DEMO_PASSWORD,
    last_name: 'Петров',
    first_name: 'Сергей',
    middle_name: 'Александрович',
    birth_date: '1981-09-02',
    company_id: 'c-mph',
    bank_role: null,
    position: 'Собственник',
  },
  {
    id: 'u-malkina',
    login: 'anna.malkina@test.local',
    password: DEMO_PASSWORD,
    last_name: 'Малькина',
    first_name: 'Анна',
    middle_name: 'Викторовна',
    birth_date: '1988-01-23',
    company_id: 'c-mph',
    bank_role: null,
    position: 'Главный бухгалтер',
  },
  {
    id: 'u-les',
    login: 'irina.les@test.local',
    password: DEMO_PASSWORD,
    last_name: 'Лес',
    first_name: 'Ирина',
    middle_name: 'Олеговна',
    birth_date: '1992-11-30',
    company_id: 'c-mph',
    bank_role: null,
    position: 'Менеджер по финансированию',
  },
  {
    id: 'u-orlova',
    login: 'maria.orlova@test.local',
    password: DEMO_PASSWORD,
    last_name: 'Орлова',
    first_name: 'Мария',
    middle_name: 'Сергеевна',
    birth_date: '1990-03-08',
    company_id: 'c-orlova',
    bank_role: null,
    position: 'Индивидуальный предприниматель',
  },
  {
    id: 'u-analyst',
    login: 'analyst@test.local',
    password: DEMO_PASSWORD,
    last_name: 'Кузнецова',
    first_name: 'Елена',
    middle_name: 'Павловна',
    birth_date: null,
    company_id: null,
    bank_role: 'underwriter',
    position: 'Кредитный аналитик',
  },
  {
    id: 'u-bank-admin',
    login: 'bank.admin@test.local',
    password: DEMO_PASSWORD,
    last_name: 'Захаров',
    first_name: 'Олег',
    middle_name: 'Игоревич',
    birth_date: null,
    company_id: null,
    bank_role: 'bank_admin',
    position: 'Администратор кредитного процесса',
  },
  {
    id: 'u-norole',
    login: 'no.role@test.local',
    password: DEMO_PASSWORD,
    last_name: 'Гусев',
    first_name: 'Антон',
    middle_name: null,
    birth_date: null,
    company_id: 'c-mph',
    bank_role: null,
    position: 'Сотрудник без роли',
  },
];

export const DEMO_ACCOUNTS: { login: string; title: string }[] = [
  { login: 'petr.smirnov@test.local', title: 'Смирнов П. И., собственник и директор ООО' },
  { login: 'sergey.petrov@test.local', title: 'Петров С. А., второй собственник, поручитель' },
  { login: 'anna.malkina@test.local', title: 'Малькина А. В., бухгалтер, без подачи заявок' },
  { login: 'irina.les@test.local', title: 'Лес И. О., сотрудник по финансированию' },
  { login: 'maria.orlova@test.local', title: 'ИП Орлова М. С.' },
  { login: 'analyst@test.local', title: 'Аналитик банка' },
  { login: 'bank.admin@test.local', title: 'Администратор банка' },
  { login: 'no.role@test.local', title: 'Сотрудник без роли в компании' },
];

const t = (iso: string) => `${iso}+03:00`;

export const SEED_MEMBERS: (Member & { company_id: string })[] = [
  member('m-smirnov', 'u-smirnov', 'c-mph', 'owner', 'Смирнов', 'Пётр', 'Иванович', 'petr.smirnov@test.local'),
  member('m-petrov', 'u-petrov', 'c-mph', 'owner', 'Петров', 'Сергей', 'Александрович', 'sergey.petrov@test.local'),
  member('m-malkina', 'u-malkina', 'c-mph', 'cfo_or_accountant', 'Малькина', 'Анна', 'Викторовна', 'anna.malkina@test.local'),
  member('m-les', 'u-les', 'c-mph', 'financing_employee', 'Лес', 'Ирина', 'Олеговна', 'irina.les@test.local'),
  {
    ...member('m-kovalev', null, 'c-mph', 'banking_employee', 'Ковалёв', 'Дмитрий', 'Андреевич', 'dmitry.kovalev@test.local'),
    status: 'invited',
    has_alfa_business_access: false,
  },
  member('m-orlova', 'u-orlova', 'c-orlova', 'owner', 'Орлова', 'Мария', 'Сергеевна', 'maria.orlova@test.local'),
];

function member(
  id: string,
  userId: string | null,
  companyId: string,
  role: UserRole,
  last: string,
  first: string,
  middle: string | null,
  login: string | null,
): Member & { company_id: string } {
  return {
    id,
    user_id: userId,
    company_id: companyId,
    last_name: last,
    first_name: first,
    middle_name: middle,
    role,
    permissions: DEFAULT_PERMISSIONS[role],
    status: 'active',
    has_alfa_business_access: true,
    login,
    created_at: t('2024-02-01T10:00:00'),
  };
}

export const SEED_COMPANIES: Record<string, Omit<CompanyProfile, 'available_actions'> & {
  onboarding_completed: boolean;
}> = {
  'c-mph': {
    onboarding_completed: false,
    company: {
      id: 'c-mph',
      legal_form: 'OOO',
      inn: '7700000001',
      ogrn: '1150000000001',
      kpp: '770001001',
      full_name: 'Общество с ограниченной ответственностью «Машпромхоз»',
      short_name: 'ООО «Машпромхоз»',
      registration_date: '2015-03-12',
      okved_main: '25.62 Обработка металлических изделий механическая',
      okved_additional: ['25.11 Производство строительных металлических конструкций', '33.12 Ремонт машин и оборудования'],
      legal_address: 'г. Москва, ул. Заводская, д. 7, стр. 2',
      registry_status: 'active',
      msp_category: 'micro',
      employees_count: 18,
      director: { user_id: 'u-smirnov', name: 'Смирнов П. И.', role: 'owner' },
      verification: { source: 'ЕГРЮЛ', verified_at: t('2026-10-20T09:00:00') },
      created_at: t('2024-02-01T10:00:00'),
      updated_at: t('2026-10-20T09:00:00'),
    },
    registry: { source: 'EGRUL', fetched_at: t('2026-10-20T09:00:00'), confirmed: false, issue_comment: null },
    from_lk: {
      employees_count: { value: 18, source: 'alfa_lk', as_of: '2026-10-01', editable: true },
      monthly_inflow_avg: { value: rub(2_100_000), source: 'alfa_lk', as_of: '2026-09-30', editable: true },
      tax_regime: { value: 'usn_income_expense', source: 'alfa_lk', as_of: '2026-10-01', editable: true },
      alfa_loans: {
        value: { count: 2, monthly_payment: rub(46_000) },
        source: 'alfa_lk',
        as_of: '2026-10-20',
        editable: false,
      },
    },
    client_input: { external_debts: [], collateral_available: [] },
    completeness_percent: 60,
  },
  'c-orlova': {
    onboarding_completed: true,
    company: {
      id: 'c-orlova',
      legal_form: 'IP',
      inn: '500100000002',
      ogrn: '318500000000002',
      kpp: null,
      full_name: 'Индивидуальный предприниматель Орлова Мария Сергеевна',
      short_name: 'ИП Орлова М. С.',
      registration_date: '2018-06-04',
      okved_main: '56.10 Деятельность ресторанов и услуги по доставке продуктов питания',
      okved_additional: ['47.24 Торговля розничная хлебом и кондитерскими изделиями'],
      legal_address: 'Московская обл., г. Химки, ул. Лесная, д. 3',
      registry_status: 'active',
      msp_category: 'micro',
      employees_count: 6,
      director: { user_id: 'u-orlova', name: 'Орлова М. С.', role: 'owner' },
      verification: { source: 'ЕГРИП', verified_at: t('2026-10-19T09:00:00') },
      created_at: t('2023-04-10T10:00:00'),
      updated_at: t('2026-10-19T09:00:00'),
    },
    registry: { source: 'EGRIP', fetched_at: t('2026-10-19T09:00:00'), confirmed: true, issue_comment: null },
    from_lk: {
      employees_count: { value: 6, source: 'alfa_lk', as_of: '2026-10-01', editable: true },
      monthly_inflow_avg: { value: rub(780_000), source: 'alfa_lk', as_of: '2026-09-30', editable: true },
      tax_regime: { value: 'patent', source: 'alfa_lk', as_of: '2026-10-01', editable: true },
      alfa_loans: {
        value: { count: 0, monthly_payment: rub(0) },
        source: 'alfa_lk',
        as_of: '2026-10-20',
        editable: false,
      },
    },
    client_input: { external_debts: [], collateral_available: [] },
    completeness_percent: 100,
  },
};

function monthsSeries(inflow: number, outflow: number, low: number[]) {
  const result = [];

  for (let i = 0; i < 12; i++) {
    const date = new Date(2025, 9 + i, 1);
    const m = date.getMonth() + 1;
    const k = low.includes(m) ? 0.72 : 1 + ((i % 3) - 1) * 0.04;
    result.push({
      month: `${date.getFullYear()}-${String(m).padStart(2, '0')}`,
      inflow: rub(Math.round((inflow * k) / 1000) * 1000),
      outflow: rub(Math.round((outflow * (low.includes(m) ? 0.85 : 1)) / 1000) * 1000),
    });
  }
  return result;
}

export const SEED_FINANCE: Record<string, FinanceSummary> = {
  'c-mph': {
    period: { from: '2025-10-01', to: '2026-09-30' },
    monthly_inflow_avg: { value: rub(2_100_000), source: 'alfa_lk', as_of: '2026-09-30', editable: true },
    monthly_operating_outflow_avg: { value: rub(1_450_000), source: 'alfa_lk', as_of: '2026-09-30', editable: true },
    free_cash_flow: { value: rub(650_000), source: 'system', as_of: '2026-09-30', editable: false },
    months: monthsSeries(2_100_000, 1_450_000, [1, 2]),
    seasonality: { low_months: [1, 2], text: 'Спад поступлений в январе и феврале' },
    debts: {
      items: [
        { lender: 'Альфа-Банк, кредит 500 000 ₽', source: 'alfa_lk', balance: rub(200_000), monthly_payment: rub(31_800), overdue: false },
        { lender: 'Альфа-Банк, кредит 150 000 ₽', source: 'alfa_lk', balance: rub(80_000), monthly_payment: rub(14_200), overdue: false },
        { lender: 'Другой банк (по данным БКИ)', source: 'bki', balance: rub(1_350_000), monthly_payment: rub(72_400), overdue: false },
      ],
      total_monthly_payment: rub(118_400),
    },
    multibank_connected: false,
    stale: {
      reason: 'no_fin_statements_2025',
      text: 'Бухгалтерской отчётности за 2025 год пока нет. Без неё сумма может быть ниже',
    },
    confirmed_at: null,
  },
  'c-orlova': {
    period: { from: '2025-10-01', to: '2026-09-30' },
    monthly_inflow_avg: { value: rub(780_000), source: 'alfa_lk', as_of: '2026-09-30', editable: true },
    monthly_operating_outflow_avg: { value: rub(560_000), source: 'alfa_lk', as_of: '2026-09-30', editable: true },
    free_cash_flow: { value: rub(220_000), source: 'system', as_of: '2026-09-30', editable: false },
    months: monthsSeries(780_000, 560_000, []),
    seasonality: null,
    debts: { items: [], total_monthly_payment: rub(0) },
    multibank_connected: false,
    stale: { reason: null, text: null },
    confirmed_at: null,
  },
};

export const SEED_SIGNING_RULES: Record<string, SigningRules> = {
  'c-mph': {
    legal_form: 'OOO',
    can_send_to_signing: ['owner', 'director', 'financing_employee'],
    signers: [
      { order: 1, document: 'contract', user_id: 'u-smirnov', role: null, required: true },
      { order: 2, document: 'surety', user_id: 'u-petrov', role: 'owner', required: true },
    ],
    version: 1,
  },
  'c-orlova': {
    legal_form: 'IP',
    can_send_to_signing: ['owner'],
    signers: [{ order: 1, document: 'contract', user_id: null, role: 'owner', required: true }],
    version: 1,
  },
};

export const SEED_LOANS: (Loan & { company_id: string })[] = [
  {
    id: 'loan-alfa-1',
    company_id: 'c-mph',
    application_id: null,
    product: { code: 'working_capital', name: 'Кредит на пополнение оборотных средств' },
    amount: rub(500_000),
    balance: rub(200_000),
    rate_percent: 16.5,
    term_months: 18,
    next_payment: { date: '2026-11-27', amount: rub(31_800) },
    overpayment_total: rub(72_400),
    issued_to_account: '40702 •••• 4512',
    schedule: [],
    source: 'alfa_lk',
  },
  {
    id: 'loan-alfa-2',
    company_id: 'c-mph',
    application_id: null,
    product: { code: 'express', name: 'Экспресс-кредит' },
    amount: rub(150_000),
    balance: rub(80_000),
    rate_percent: 18,
    term_months: 12,
    next_payment: { date: '2026-11-20', amount: rub(14_200) },
    overpayment_total: rub(20_400),
    issued_to_account: '40702 •••• 4512',
    schedule: [],
    source: 'alfa_lk',
  },
];

export const PREAPPROVED: Record<string, PreapprovedOffer> = {
  'c-mph': {
    offer_id: 'offer-pre-1',
    product: { code: 'working_capital', name: 'Кредит на пополнение оборотных средств' },
    limit: rub(1_200_000),
    term_months: 24,
    valid_until: '2026-11-30',
    conditions_fixed: true,
    source: 'alfa_lk',
  },
};

export const PRODUCTS: Product[] = [
  {
    code: 'working_capital',
    name: 'Кредит на пополнение оборотных средств',
    description: 'Деньги на закупку товара, сырья и текущие расходы бизнеса',
    purposes: ['working_capital', 'current_expenses', 'gov_contract'],
    need_types: ['one_time'],
    disbursement: ['lump_sum'],
    amount_min: rub(300_000),
    amount_max: rub(30_000_000),
    term_min_months: 3,
    term_max_months: 36,
    rate_from_percent: 15,
    collateral: 'optional',
    min_business_age_months: 6,
    legal_forms: ['OOO', 'IP'],
    suits: ['Разовая закупка', 'Кассовый разрыв на несколько месяцев'],
    not_suits: ['Покупка недвижимости'],
    required_document_types: ['company_docs', 'fin_statements_2025'],
    decision_time_text: 'Решение за 1 рабочий день',
    is_fictional: false,
    source_note: 'По данным агрегаторов, 07.2026; сверить с alfabank.ru',
  },
  {
    code: 'investment',
    name: 'Кредит на оборудование',
    description: 'Покупка и модернизация оборудования, транспорта и техники',
    purposes: ['equipment', 'repair'],
    need_types: ['one_time'],
    disbursement: ['lump_sum', 'tranches'],
    amount_min: rub(500_000),
    amount_max: rub(100_000_000),
    term_min_months: 12,
    term_max_months: 84,
    rate_from_percent: 14.5,
    collateral: 'optional',
    min_business_age_months: 12,
    legal_forms: ['OOO', 'IP'],
    suits: ['Покупка станков и техники', 'Ремонт производственной линии'],
    not_suits: ['Текущие расходы'],
    required_document_types: ['company_docs', 'fin_statements_2025', 'collateral_docs'],
    decision_time_text: 'Решение за 2-3 рабочих дня',
    is_fictional: false,
    source_note: 'По данным агрегаторов, 07.2026; сверить с alfabank.ru',
  },
  {
    code: 'overdraft',
    name: 'Овердрафт',
    description: 'Можно уходить в минус по счёту и закрывать кассовые разрывы',
    purposes: ['current_expenses', 'working_capital'],
    need_types: ['recurring'],
    disbursement: ['tranches'],
    amount_min: rub(100_000),
    amount_max: rub(5_000_000),
    term_min_months: 12,
    term_max_months: 12,
    rate_from_percent: 17,
    collateral: 'none',
    min_business_age_months: 6,
    legal_forms: ['OOO', 'IP'],
    suits: ['Регулярные кассовые разрывы', 'Оплата поставщикам до поступлений'],
    not_suits: ['Крупные разовые покупки'],
    required_document_types: [],
    decision_time_text: 'Решение в день обращения',
    is_fictional: false,
    source_note: 'По данным агрегаторов, 07.2026; сверить с alfabank.ru',
  },
  {
    code: 'credit_line',
    name: 'Кредитная линия',
    description: 'Лимит, из которого можно брать деньги частями под разные задачи',
    purposes: ['working_capital', 'gov_contract', 'current_expenses'],
    need_types: ['recurring', 'one_time'],
    disbursement: ['tranches'],
    amount_min: rub(1_000_000),
    amount_max: rub(150_000_000),
    term_min_months: 12,
    term_max_months: 36,
    rate_from_percent: 15.5,
    collateral: 'optional',
    min_business_age_months: 12,
    legal_forms: ['OOO', 'IP'],
    suits: ['Финансирование контрактов', 'Закупки частями'],
    not_suits: ['Одна небольшая покупка'],
    required_document_types: ['company_docs', 'fin_statements_2025'],
    decision_time_text: 'Решение за 2-3 рабочих дня',
    is_fictional: false,
    source_note: 'По данным агрегаторов, 07.2026; сверить с alfabank.ru',
  },
  {
    code: 'express',
    name: 'Экспресс-кредит',
    description: 'Небольшая сумма без залога и почти без документов',
    purposes: ['current_expenses', 'repair', 'other'],
    need_types: ['one_time'],
    disbursement: ['lump_sum'],
    amount_min: rub(100_000),
    amount_max: rub(1_000_000),
    term_min_months: 3,
    term_max_months: 24,
    rate_from_percent: 19,
    collateral: 'none',
    min_business_age_months: 6,
    legal_forms: ['OOO', 'IP'],
    suits: ['Срочная небольшая сумма'],
    not_suits: ['Суммы больше 1 000 000 ₽'],
    required_document_types: [],
    decision_time_text: 'Предварительное решение за 15 минут',
    is_fictional: true,
    source_note: null,
  },
  {
    code: 'any_purpose',
    name: 'Кредит на любые цели',
    description: 'Без подтверждения цели, деньги на расчётный счёт',
    purposes: ['other', 'current_expenses', 'repair'],
    need_types: ['one_time'],
    disbursement: ['lump_sum'],
    amount_min: rub(300_000),
    amount_max: rub(10_000_000),
    term_min_months: 6,
    term_max_months: 36,
    rate_from_percent: 18,
    collateral: 'none',
    min_business_age_months: 12,
    legal_forms: ['OOO', 'IP'],
    suits: ['Цель сложно подтвердить документами'],
    not_suits: ['Нужна минимальная ставка'],
    required_document_types: ['company_docs'],
    decision_time_text: 'Решение за 1 рабочий день',
    is_fictional: false,
    source_note: 'По данным агрегаторов, 07.2026; сверить с alfabank.ru',
  },
  {
    code: 'gov_program',
    name: 'Кредит по льготной программе',
    description: 'Пониженная ставка за счёт господдержки малого бизнеса',
    purposes: ['equipment', 'working_capital', 'real_estate'],
    need_types: ['one_time'],
    disbursement: ['lump_sum', 'tranches'],
    amount_min: rub(1_000_000),
    amount_max: rub(50_000_000),
    term_min_months: 12,
    term_max_months: 60,
    rate_from_percent: 11,
    collateral: 'required',
    min_business_age_months: 12,
    legal_forms: ['OOO'],
    suits: ['Производство', 'Обрабатывающие отрасли'],
    not_suits: ['Торговля', 'Срочные деньги'],
    required_document_types: ['company_docs', 'fin_statements_2025', 'collateral_docs'],
    decision_time_text: 'Решение до 5 рабочих дней',
    is_fictional: true,
    source_note: null,
  },
];

export const DOCUMENT_TYPES: DocumentType[] = [
  {
    code: 'company_docs',
    title: 'Устав и решение о назначении директора',
    legal_forms: ['OOO'],
    required_for_products: ['working_capital', 'investment', 'credit_line', 'any_purpose', 'gov_program'],
    scope: 'company',
    accepted_formats: ['pdf', 'jpg', 'png'],
    max_size_mb: 20,
    max_age_days: null,
    can_generate_from_lk: true,
  },
  {
    code: 'fin_statements_2025',
    title: 'Бухгалтерская отчётность за 2025 год',
    legal_forms: ['OOO'],
    required_for_products: ['working_capital', 'investment', 'credit_line', 'gov_program'],
    scope: 'company',
    accepted_formats: ['pdf', 'xlsx'],
    max_size_mb: 20,
    max_age_days: 365,
    can_generate_from_lk: false,
  },
  {
    code: 'tax_return',
    title: 'Налоговая декларация за 2025 год',
    legal_forms: ['IP'],
    required_for_products: ['working_capital', 'investment', 'credit_line'],
    scope: 'company',
    accepted_formats: ['pdf', 'xml'],
    max_size_mb: 20,
    max_age_days: 365,
    can_generate_from_lk: true,
  },
  {
    code: 'other_bank_statements',
    title: 'Выписка по счёту в другом банке за 6 месяцев',
    legal_forms: ['OOO', 'IP'],
    required_for_products: [],
    scope: 'application',
    accepted_formats: ['pdf', 'xlsx', 'txt'],
    max_size_mb: 20,
    max_age_days: 30,
    can_generate_from_lk: false,
  },
  {
    code: 'bank_statement',
    title: 'Выписка по счёту в Альфа-Банке',
    legal_forms: ['OOO', 'IP'],
    required_for_products: [],
    scope: 'application',
    accepted_formats: ['pdf'],
    max_size_mb: 20,
    max_age_days: 30,
    can_generate_from_lk: true,
  },
  {
    code: 'collateral_docs',
    title: 'Документы по залогу',
    legal_forms: ['OOO', 'IP'],
    required_for_products: ['gov_program'],
    scope: 'application',
    accepted_formats: ['pdf', 'jpg', 'png'],
    max_size_mb: 30,
    max_age_days: null,
    can_generate_from_lk: false,
  },
  {
    code: 'patent',
    title: 'Патент на применение ПСН',
    legal_forms: ['IP'],
    required_for_products: [],
    scope: 'company',
    accepted_formats: ['pdf', 'jpg'],
    max_size_mb: 10,
    max_age_days: null,
    can_generate_from_lk: false,
  },
];

export const FEED: Record<LegalForm, FeedItem[]> = {
  OOO: [
    {
      id: 'feed-1',
      type: 'program',
      title: 'Льготные кредиты для обрабатывающих производств',
      body: 'Программа поддержки снижает ставку для компаний с ОКВЭД раздела C. Можно направить деньги на оборудование и пополнение оборотных средств.',
      published_at: t('2026-10-18T10:00:00'),
      tags: ['господдержка', 'производство'],
      relevance_reason: 'Показано, потому что: ваш ОКВЭД 25.62 относится к обработке металла',
      cta: { label: 'Посмотреть продукт', route: '/products/gov_program' },
    },
    {
      id: 'feed-2',
      type: 'tip',
      title: 'Как спад в январе и феврале влияет на кредит',
      body: 'Если поступления в начале года ниже, банк смотрит на средние обороты. Срок подлиннее снижает платёж в слабые месяцы.',
      published_at: t('2026-10-15T12:00:00'),
      tags: ['совет', 'сезонность'],
      relevance_reason: 'Показано, потому что: у вас спад поступлений в январе и феврале',
      cta: { label: 'Подобрать кредит', route: '/home' },
    },
    {
      id: 'feed-3',
      type: 'industry',
      title: 'Цены на металлопрокат: что ждать в ноябре',
      body: 'Поставщики предупреждают о росте цен на 3-5%. Закупку сырья к концу года стоит планировать заранее.',
      published_at: t('2026-10-12T09:30:00'),
      tags: ['отрасль'],
      relevance_reason: 'Показано, потому что: вы закупаете металл для производства',
      cta: null,
    },
    {
      id: 'feed-4',
      type: 'product_update',
      title: 'Овердрафт теперь до 5 000 000 ₽',
      body: 'Лимит овердрафта для микропредприятий увеличен. Заявку можно подать прямо в кабинете.',
      published_at: t('2026-10-05T11:00:00'),
      tags: ['продукт'],
      relevance_reason: 'Показано, потому что: вы микропредприятие',
      cta: { label: 'Подробнее', route: '/products/overdraft' },
    },
  ],
  IP: [
    {
      id: 'feed-ip-1',
      type: 'tip',
      title: 'Кредит для ИП на патенте: какие документы нужны',
      body: 'Для ИП на патенте банк смотрит обороты по счёту и патент. Отчётность как у ООО не нужна.',
      published_at: t('2026-10-17T10:00:00'),
      tags: ['ИП', 'документы'],
      relevance_reason: 'Показано, потому что: вы ИП на патентной системе',
      cta: { label: 'Готовые варианты', route: '/products' },
    },
    {
      id: 'feed-ip-2',
      type: 'program',
      title: 'Поддержка общепита в Московской области',
      body: 'Региональная программа компенсирует часть ставки по кредитам на оборудование для кафе и ресторанов.',
      published_at: t('2026-10-10T10:00:00'),
      tags: ['господдержка', 'общепит'],
      relevance_reason: 'Показано, потому что: ваш ОКВЭД 56.10, регион Московская область',
      cta: null,
    },
    {
      id: 'feed-ip-3',
      type: 'product_update',
      title: 'Экспресс-кредит без визита в банк',
      body: 'Сумма до 1 000 000 ₽, предварительное решение за 15 минут.',
      published_at: t('2026-10-02T10:00:00'),
      tags: ['продукт'],
      relevance_reason: 'Показано, потому что: у вас нет действующих кредитов',
      cta: { label: 'Подробнее', route: '/products/express' },
    },
  ],
};

export const INFO_REQUEST_TEMPLATES: InfoRequestTemplate[] = [
  {
    code: 'fin_statements',
    title: 'Отчётность за 2025 год',
    question: 'Приложите бухгалтерскую отчётность за 2025 год',
    requested_document_types: ['fin_statements_2025'],
  },
  {
    code: 'other_bank',
    title: 'Выписка из другого банка',
    question: 'Приложите выписку по счёту в другом банке за последние 6 месяцев',
    requested_document_types: ['other_bank_statements'],
  },
  {
    code: 'collateral',
    title: 'Документы по залогу',
    question: 'Приложите документы, подтверждающие право собственности на залог',
    requested_document_types: ['collateral_docs'],
  },
];

export const REJECTION_REASONS: RejectionReason[] = [
  { code: 'high_load', title: 'Высокая долговая нагрузка' },
  { code: 'low_turnover', title: 'Недостаточные обороты' },
  { code: 'credit_history', title: 'Негативная кредитная история' },
  { code: 'tax_debt', title: 'Задолженность по налогам' },
  { code: 'business_age', title: 'Небольшой срок работы бизнеса' },
  { code: 'docs_mismatch', title: 'Документы не подтверждают данные заявки' },
];

export const DEFAULT_THRESHOLDS: ScoringThresholds = {
  approve_min: 70,
  counter_offer_min: 55,
  manual_review_min: 45,
  load_threshold_percent: 30,
  load_target_percent: 26.5,
};

export const BANK_ROLE_TITLES: Record<BankRole, string> = {
  underwriter: 'Кредитный аналитик',
  bank_admin: 'Администратор',
};
