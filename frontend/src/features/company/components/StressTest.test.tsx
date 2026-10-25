import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { FinanceSummary } from '@/features/company/types';

import { StressTest } from './StressTest';

vi.mock('@/shared/api/health', () => ({ useHealth: () => ({ data: undefined }) }));

const rub = (r: number) => ({ value: r * 100, currency: 'RUB' as const });
const finance = {
  period: { from: '2025-10-01', to: '2026-09-30' },
  monthly_inflow_avg: { value: rub(1_000_000), source: 'alfa_lk' },
  monthly_operating_outflow_avg: { value: rub(700_000), source: 'alfa_lk' },
  debts: { items: [], total_monthly_payment: rub(150_000) },
} as unknown as FinanceSummary;

describe('StressTest', () => {
  it('показывает порог и дефицит при падении на 20%', () => {
    render(<StressTest finance={finance} />);
    expect(screen.getByText('15% и больше')).toBeInTheDocument();
    expect(screen.getByText('Подушка на 6 месяцев: 300 000 ₽')).toBeInTheDocument();
  });

  it('при небольшом падении платежи покрываются', () => {
    render(<StressTest finance={finance} />);
    fireEvent.change(screen.getAllByRole('slider')[0], { target: { value: '10' } });
    expect(screen.getByText('Платежи покрываются')).toBeInTheDocument();
  });

  it('при падении на 50% считает подушку на 6 месяцев', () => {
    render(<StressTest finance={finance} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Выручка −50%' }));
    expect(screen.getByText('Подушка на 6 месяцев: 2 100 000 ₽')).toBeInTheDocument();
  });
});
