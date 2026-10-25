import type { Money } from '@/shared/types/common';

export function formatMoney(money: Money | null | undefined, { kopecks = false } = {}) {
  if (!money) return '';
  const rubles = money.value / 100;
  const text = rubles.toLocaleString('ru-RU', {
    minimumFractionDigits: kopecks && money.value % 100 ? 2 : 0,
    maximumFractionDigits: kopecks ? 2 : 0,
  });
  return `${text.replace(/ /g, ' ')} ₽`;
}

export function rubToMoney(rubles: number): Money {
  return { value: Math.round(rubles) * 100, currency: 'RUB' };
}

const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

const MONTHS_FULL = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

const MONTHS_NOMINATIVE = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];

function parse(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value);
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return '';
  const d = parse(value);
  const time = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}, ${time}`;
}

export function formatDate(value: string | null | undefined) {
  if (!value) return '';
  const d = parse(value);
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}

export function formatDayMonth(value: string | null | undefined) {
  if (!value) return '';
  const d = parse(value);
  return `${d.getDate()} ${MONTHS_FULL[d.getMonth()]}`;
}

export function formatMonth(value: string) {
  const [y, m] = value.split('-').map(Number);
  return `${MONTHS_NOMINATIVE[m - 1]} ${y}`;
}

export function monthName(m: number) {
  return MONTHS_NOMINATIVE[m - 1];
}

export function formatTime(value: string) {
  return parse(value).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

export function plural(n: number, one: string, few: string, many: string) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

export function formatMonths(n: number) {
  return `${n} ${plural(n, 'месяц', 'месяца', 'месяцев')}`;
}

export function formatPercent(value: number, digits = 1) {
  return `${value.toFixed(digits).replace('.', ',').replace(/,0$/, '')}%`;
}

export function formatMinutes(total: number) {
  if (total < 60) return `${total} мин`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h < 24) return m ? `${h} ч ${m} мин` : `${h} ч`;
  const d = Math.floor(h / 24);
  return `${d} ${plural(d, 'день', 'дня', 'дней')}`;
}

export function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} МБ`;
}

export function formatNumberInput(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return '';
  return value.toLocaleString('ru-RU').replace(/ /g, ' ');
}

export function parseNumberInput(value: string) {
  const digits = value.replace(/[^\d]/g, '');
  return digits ? Number(digits) : null;
}

export function formatLongDate(value: string | null | undefined) {
  if (!value) return '';
  const d = parse(value);
  return `${d.getDate()} ${MONTHS_FULL[d.getMonth()]} ${d.getFullYear()}`;
}

export function formatShortDateTime(value: string | null | undefined) {
  if (!value) return '';
  const d = parse(value);
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}., ${formatTime(value)}`;
}

export function formatNumericDate(value: string | null | undefined) {
  if (!value) return '';
  const d = parse(value);
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
}

export function appNo(number: string) {
  const digits = number.match(/(\d+)$/)?.[1];
  return digits ? `№${Number(digits)}` : number;
}

export function norm(value: string) {
  return value.toLowerCase().replace(/ё/g, 'е');
}
