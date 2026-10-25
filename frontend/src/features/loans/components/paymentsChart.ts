import type { LoanPayment } from '../types';

export const SERIES = [
  { key: 'principal', label: 'Основной долг', color: 'var(--a-red)' },
  { key: 'interest', label: 'Проценты', color: '#9a1b14' },
  { key: 'early', label: 'Досрочно', color: 'var(--a-blue)' },
] as const;

export type SeriesKey = (typeof SERIES)[number]['key'];

export function paymentTotal(p: LoanPayment) {
  return p.principal.value + p.interest.value + p.early.value;
}

export function niceMax(value: number) {
  if (value <= 0) return 1;
  const step = 10 ** Math.floor(Math.log10(value));
  const nice = [1, 2, 2.5, 5, 10].find((m) => m * step >= value) ?? 10;
  return nice * step;
}

export function formatShort(kopecks: number) {
  const rub = kopecks / 100;
  if (rub >= 1_000_000) return `${(rub / 1_000_000).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} млн`;
  if (rub >= 1_000) return `${(rub / 1_000).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} тыс.`;
  return `${Math.round(rub)}`;
}

export function paymentsByYear(payments: LoanPayment[]) {
  const years = [...new Set(payments.map((p) => p.date.slice(0, 4)))].sort().reverse();
  return { years, of: (year: string) => payments.filter((p) => p.date.startsWith(year)).sort((a, b) => a.date.localeCompare(b.date)) };
}
