import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { LoanPayment } from '../types';
import { PaymentsHistory } from './PaymentsHistory';
import { formatShort, niceMax, paymentsByYear } from './paymentsChart';

const rub = (r: number) => ({ value: r * 100, currency: 'RUB' as const });
const pay = (date: string, principal: number, interest: number, early = 0): LoanPayment => ({
  date,
  principal: rub(principal),
  interest: rub(interest),
  early: rub(early),
});

const payments = [
  pay('2025-12-20', 50_000, 18_000),
  pay('2026-09-20', 56_000, 10_400),
  pay('2026-10-20', 57_000, 9_000, 140_000),
];

describe('helpers', () => {
  it('niceMax округляет вверх до круглого шага', () => {
    expect(niceMax(206_000)).toBe(250_000);
    expect(niceMax(68_000)).toBe(100_000);
    expect(niceMax(0)).toBe(1);
  });

  it('formatShort пишет тысячи и миллионы', () => {
    expect(formatShort(rub(67_600).value)).toBe('67,6 тыс.');
    expect(formatShort(rub(1_200_000).value)).toBe('1,2 млн');
  });

  it('paymentsByYear: свежий год первым, месяцы по порядку', () => {
    const { years, of } = paymentsByYear([...payments].reverse());
    expect(years).toEqual(['2026', '2025']);
    expect(of('2026').map((p) => p.date)).toEqual(['2026-09-20', '2026-10-20']);
  });
});

const bars = () => within(screen.getByRole('list', { name: /Платежи за/ })).getAllByRole('listitem');

describe('PaymentsHistory', () => {
  it('по умолчанию показывает последний месяц с разбивкой', () => {
    render(<PaymentsHistory payments={payments} />);
    const detail = screen.getByText('Октябрь').closest('aside')!;
    expect(within(detail).getByText('206 000 ₽')).toBeInTheDocument();
    expect(within(detail).getByText('140 000 ₽')).toBeInTheDocument();
    expect(bars()).toHaveLength(2);
  });

  it('наведение на столбец переключает детали', () => {
    render(<PaymentsHistory payments={payments} />);
    fireEvent.mouseEnter(screen.getByRole('listitem', { name: /^Сентябрь/ }));
    const detail = screen.getByText('Сентябрь').closest('aside')!;
    expect(within(detail).getByText('66 400 ₽')).toBeInTheDocument();
  });

  it('смена года перерисовывает столбцы, «Досрочно» прячется без досрочных', () => {
    render(<PaymentsHistory payments={payments} />);
    fireEvent.change(screen.getByLabelText('Год'), { target: { value: '2025' } });
    expect(bars()).toHaveLength(1);
    expect(screen.queryByText('Досрочно')).not.toBeInTheDocument();
  });
});
