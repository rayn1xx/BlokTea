import type { ApplicationStatus, CollateralType, DataSource, DocumentStatus, PurposeCode, ReadinessStatus, SigningDocumentType, TaxRegime, UserRole } from '@/shared/types/common';

export type StatusTone = 'neutral' | 'info' | 'attention' | 'positive' | 'negative' | 'purple';

export const STATUS: Record<ApplicationStatus, { label: string; tone: StatusTone; now: string }> = {
  draft: { label: 'Черновик', tone: 'neutral', now: 'Заявка не отправлена' },
  submitted: { label: 'Отправлена', tone: 'info', now: 'Банк скоро возьмёт заявку в работу' },
  in_review: { label: 'На рассмотрении', tone: 'info', now: 'Проверяем данные и считаем решение. От вас ничего не нужно' },
  info_requested: { label: 'Нужны уточнения', tone: 'attention', now: 'Банку не хватает информации, ответьте на запрос' },
  approved: { label: 'Одобрена', tone: 'positive', now: 'Можно переходить к подписанию' },
  counter_offer: { label: 'Предложение банка', tone: 'attention', now: 'Банк готов выдать кредит на других условиях' },
  rejected: { label: 'Отказ', tone: 'negative', now: 'Посмотрите, что повлияло и что можно улучшить' },
  signing: { label: 'Подписание', tone: 'purple', now: 'Ждём подписи по правилам компании' },
  issued: { label: 'Кредит выдан', tone: 'positive', now: 'Деньги на счёте' },
  cancelled: { label: 'Отозвана', tone: 'neutral', now: 'Заявка отозвана' },
};

export const APPLICATION_GROUPS: {
  id: 'drafts' | 'in_bank' | 'awaiting_signing' | 'finished';
  label: string;
  statuses: ApplicationStatus[];
}[] = [
  { id: 'drafts', label: 'Черновики', statuses: ['draft'] },
  { id: 'in_bank', label: 'На рассмотрении', statuses: ['submitted', 'in_review', 'info_requested'] },
  { id: 'awaiting_signing', label: 'Ожидают подписания', statuses: ['approved', 'counter_offer', 'signing'] },
  { id: 'finished', label: 'Завершённые', statuses: ['issued', 'rejected', 'cancelled'] },
];

export const ROLE_LABELS: Record<UserRole, string> = {
  owner: 'Собственник бизнеса',
  director: 'Генеральный директор',
  cfo_or_accountant: 'Финансовый директор или бухгалтер',
  financing_employee: 'Сотрудник, отвечающий за финансирование',
  banking_employee: 'Сотрудник, работающий с банковскими продуктами',
  authorized_employee: 'Уполномоченный сотрудник',
};

export const ROLE_SHORT: Record<UserRole, string> = {
  owner: 'собственник',
  director: 'директор',
  cfo_or_accountant: 'бухгалтер',
  financing_employee: 'финансирование',
  banking_employee: 'банковские продукты',
  authorized_employee: 'уполномоченный сотрудник',
};

export const PURPOSE_LABELS: Record<PurposeCode, string> = {
  equipment: 'Покупка оборудования',
  repair: 'Ремонт',
  current_expenses: 'Текущие расходы',
  working_capital: 'Пополнение оборотных средств',
  real_estate: 'Покупка недвижимости',
  gov_contract: 'Исполнение госконтракта',
  other: 'Другое',
};

export const COLLATERAL_LABELS: Record<CollateralType, string> = {
  none: 'Без залога',
  real_estate: 'Недвижимость',
  vehicle_equipment: 'Транспорт или оборудование',
  purchased_asset: 'Покупаемое имущество',
};

export const TAX_REGIME_LABELS: Record<TaxRegime, string> = {
  osn: 'ОСН',
  usn_income: 'УСН «доходы»',
  usn_income_expense: 'УСН «доходы минус расходы»',
  patent: 'Патент',
  ausn: 'АУСН',
};

export const SOURCE_LABELS: Record<DataSource, string> = {
  registry: 'ЕГРЮЛ / ЕГРИП',
  alfa_lk: 'Альфа-Бизнес',
  bki: 'Бюро кредитных историй',
  fns: 'ФНС',
  multibank: 'Счета в других банках',
  client: 'Вы указали',
  system: 'Расчёт',
};

export const DOCUMENT_STATUS: Record<DocumentStatus, { label: string; tone: StatusTone }> = {
  uploaded: { label: 'Загружен', tone: 'neutral' },
  analyzing: { label: 'Проверяем', tone: 'info' },
  accepted: { label: 'Принят', tone: 'positive' },
  rejected: { label: 'Отклонён', tone: 'negative' },
  expiring: { label: 'Скоро устареет', tone: 'attention' },
};

export const SIGNING_DOCUMENT_LABELS: Record<SigningDocumentType, string> = {
  contract: 'Кредитный договор',
  surety: 'Договор поручительства',
  deal_approval: 'Одобрение сделки',
};

export const READINESS_STATUS: Record<ReadinessStatus, { label: string; tone: StatusTone }> = {
  ok: { label: 'Хорошо', tone: 'positive' },
  warning: { label: 'Можно улучшить', tone: 'attention' },
  fail: { label: 'Мешает', tone: 'negative' },
  unknown: { label: 'Нет данных', tone: 'neutral' },
};

export const ERRORS = {
  generic: 'Что-то пошло не так. Попробуйте ещё раз',
  network: 'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз',
  noCompanyRole: 'Нет доступа к компании. Обратитесь к собственнику бизнеса',
  versionConflict: 'Заявку изменил другой сотрудник, проверьте данные',
  offerExpired: 'Предложение истекло, подайте заявку снова: данные подставятся сами',
  invalidCode: 'Неверный код',
  loginFailed: 'Неверная почта или пароль',
};

export const TEXTS = {
  loginHint: 'В реальном продукте кабинет открывается внутри Альфа-Бизнеса без повторного входа',
  notADecision: 'Это ориентир, а не решение банка',
  aiBadge: 'Сформировано ИИ',
  aiCheck: 'Проверьте данные',
  aiBankNote: 'Сформировано ИИ, решение принимает аналитик',
  accountantBanner: 'Подбор и подача заявок недоступны для вашей роли. Права выдаёт собственник в разделе «Команда»',
  ownerDecides: 'Решение принимает собственник или директор',
  demoData: 'Демонстрационные данные',
  mockCheck: 'мок',
};

export const APP_STATUS: Record<ApplicationStatus, { label: string; pill: 'grey' | 'green' | 'yellow' | 'red' | 'blue'; next: string }> = {
  draft: { label: 'Черновик', pill: 'grey', next: 'Заполнены параметры кредита' },
  submitted: { label: 'Отправлена', pill: 'blue', next: 'Банк скоро возьмёт заявку в работу' },
  in_review: { label: 'На проверке', pill: 'grey', next: 'Сейчас действует банк' },
  info_requested: { label: 'Нужен документ', pill: 'grey', next: 'Банк запросил документ' },
  approved: { label: 'Одобрена', pill: 'green', next: 'Подтвердите условия' },
  counter_offer: { label: 'Предложение банка', pill: 'yellow', next: 'Банк предложил другие условия' },
  rejected: { label: 'Не одобрена', pill: 'grey', next: 'Посмотрите причины решения' },
  signing: { label: 'Готова к подписанию', pill: 'green', next: 'Ожидается подпись' },
  issued: { label: 'Кредит выдан', pill: 'green', next: 'Перейти к условиям и графику' },
  cancelled: { label: 'Отозвана', pill: 'grey', next: 'Рассмотрение прекращено' },
};

export const CANCEL_REASONS = [
  'Нашли другое финансирование',
  'Изменились планы бизнеса',
  'Не устроили условия',
  'Подам новую заявку с другими параметрами',
  'Другое',
];
