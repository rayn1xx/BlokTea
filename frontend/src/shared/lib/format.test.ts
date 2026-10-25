import { describe, expect, it } from 'vitest';

import { appNo, formatMoney, formatMonths, norm, plural } from './format';

describe('norm', () => {
  it('приравнивает «ё» к «е» и не учитывает регистр', () => {
    expect(norm('Фёдоров ПЁТР')).toBe('федоров петр');
  });

  it('поиск без «ё» находит строку с «ё» и наоборот', () => {
    expect(norm('Сергей Фёдоров').includes(norm('федоров'))).toBe(true);
    expect(norm('Сергей Федоров').includes(norm('фёдоров'))).toBe(true);
  });
});

describe('plural', () => {
  it.each([
    [1, 'год'],
    [2, 'года'],
    [5, 'лет'],
    [11, 'лет'],
    [21, 'год'],
    [22, 'года'],
    [112, 'лет'],
  ])('%i → %s', (n, word) => {
    expect(plural(n, 'год', 'года', 'лет')).toBe(word);
  });

  it('formatMonths склоняет месяцы', () => {
    expect(formatMonths(3)).toBe('3 месяца');
    expect(formatMonths(12)).toBe('12 месяцев');
  });
});

describe('formatMoney', () => {
  it('переводит копейки в рубли и разбивает разряды пробелами', () => {
    expect(formatMoney({ value: 150_000_000, currency: 'RUB' })).toBe('1 500 000 ₽');
  });

  it('показывает копейки только по запросу', () => {
    expect(formatMoney({ value: 12_345, currency: 'RUB' }, { kopecks: true })).toBe('123,45 ₽');
  });

  it('пустое значение даёт пустую строку', () => {
    expect(formatMoney(null)).toBe('');
  });
});

describe('appNo', () => {
  it('оставляет номер без ведущих нулей', () => {
    expect(appNo('CR-2026-000042')).toBe('№42');
  });

  it('возвращает строку без цифр как есть', () => {
    expect(appNo('черновик')).toBe('черновик');
  });
});
