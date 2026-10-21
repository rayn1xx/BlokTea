import type { ApplicationStatus, CollateralType, DataSource, Disbursement, DocumentStatus, NeedType, Permission, Preference, PurposeCode, ReadinessStatus, SignerStatus, SigningDocumentType, TaxRegime, Urgency, UserRole } from '@/shared/types/common';

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

export const PERMISSION_LABELS: Record<Permission, string> = {
  submit_applications: 'Подавать заявки',
  upload_documents: 'Загружать документы',
  sign: 'Подписывать',
  accept_offers: 'Принимать предложения банка',
  manage_team: 'Управлять командой',
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

export const NEED_TYPE_LABELS: Record<NeedType, string> = {
  one_time: 'Разовая',
  recurring: 'Регулярная',
};

export const DISBURSEMENT_LABELS: Record<Disbursement, string> = {
  lump_sum: 'Всей суммой сразу',
  tranches: 'Частями по мере необходимости',
};

export const URGENCY_LABELS: Record<Urgency, string> = {
  asap: 'Как можно скорее',
  week: 'В течение недели',
  not_urgent: 'Не срочно',
};

export const COLLATERAL_LABELS: Record<CollateralType, string> = {
  none: 'Без залога',
  real_estate: 'Недвижимость',
  vehicle_equipment: 'Транспорт или оборудование',
  purchased_asset: 'Покупаемое имущество',
};

export const PREFERENCE_LABELS: Record<Preference, string> = {
  lower_payment: 'Меньше платёж',
  lower_overpayment: 'Меньше переплата',
  flexibility: 'Гибкость',
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

export const SOURCE_EXPLAIN: Record<DataSource, string> = {
  registry: 'Сведения о компании берём из ЕГРЮЛ и ЕГРИП',
  alfa_lk: 'Поступления, расходы и кредиты в Альфе считаем по операциям в Альфа-Бизнесе',
  bki: 'Кредиты в других банках видим по данным бюро кредитных историй',
  fns: 'Налоговую задолженность проверяем в сервисе ФНС «Прозрачный бизнес»',
  multibank: 'Обороты в других банках подтягиваем через мультибанкинг',
  client: 'Эти данные вы указали сами',
  system: 'Рассчитали по данным выше',
};

export const DOCUMENT_STATUS: Record<DocumentStatus, { label: string; tone: StatusTone }> = {
  uploaded: { label: 'Загружен', tone: 'neutral' },
  analyzing: { label: 'Проверяем', tone: 'info' },
  accepted: { label: 'Принят', tone: 'positive' },
  rejected: { label: 'Отклонён', tone: 'negative' },
  expiring: { label: 'Скоро устареет', tone: 'attention' },
};

export const SIGNER_STATUS: Record<SignerStatus, { label: string; tone: StatusTone }> = {
  waiting: { label: 'Ожидает очереди', tone: 'neutral' },
  pending: { label: 'Ждём подпись', tone: 'attention' },
  signed: { label: 'Подписано', tone: 'positive' },
  declined: { label: 'Отказался', tone: 'negative' },
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
