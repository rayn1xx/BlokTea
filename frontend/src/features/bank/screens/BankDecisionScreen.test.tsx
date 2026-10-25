import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { BankApplicationDetail, ScoringResult } from '@/features/bank/types';

import { BankDecisionScreen } from './BankDecisionScreen';

const api = vi.hoisted(() => ({
  decide: vi.fn(),
  previewDecision: vi.fn(),
  counterOfferOptions: vi.fn(),
  infoRequestTemplates: vi.fn(),
  rejectionReasons: vi.fn(),
}));
const appQuery = vi.hoisted(() => ({ current: null as unknown }));

vi.mock('@/features/bank/api', () => ({ bankApi: api }));
vi.mock('@/features/bank/hooks', () => ({ useBankApplication: () => appQuery.current }));
vi.mock('@/features/documents/api', () => ({ documentsApi: { types: () => Promise.resolve([]) } }));

function makeApp(outcome: ScoringResult['outcome']) {
  return {
    id: 'app-1',
    number: 'CR-2026-000042',
    status: 'in_review',
    requested_amount: { value: 300_000_000, currency: 'RUB' },
    requested_term_months: 24,
    rate_percent: 19.5,
    company: { company: { short_name: 'ООО «Ромашка»', legal_form: 'llc' } },
    scoring: { total: 70, outcome, factors: [], stop_factors: [], thresholds: {} },
  } as unknown as BankApplicationDetail;
}

function renderScreen(outcome: ScoringResult['outcome']) {
  appQuery.current = { data: makeApp(outcome), isLoading: false, isError: false, error: null, refetch: vi.fn() };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/bank/applications/app-1/decision']}>
        <Routes>
          <Route path='/bank/applications/:id/decision' element={<BankDecisionScreen />} />
          <Route path='/bank/queue' element={<div>Очередь</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const submit = () => userEvent.click(screen.getByRole('button', { name: 'Отправить решение' }));

describe('BankDecisionScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.decide.mockResolvedValue({});
    api.previewDecision.mockReturnValue(new Promise(() => undefined));
    api.counterOfferOptions.mockResolvedValue({ options: [] });
    api.infoRequestTemplates.mockResolvedValue([]);
    api.rejectionReasons.mockResolvedValue([
      { code: 'high_load', title: 'Высокая долговая нагрузка' },
      { code: 'other', title: 'Другая' },
    ]);
  });

  it('без причины отказ не отправляется', async () => {
    renderScreen('rejected');
    await submit();
    expect(screen.getByText('Выберите причину')).toBeInTheDocument();
    expect(api.decide).not.toHaveBeenCalled();
  });

  it('причина «Другая» требует описания', async () => {
    renderScreen('rejected');
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Другая' }));
    await submit();
    expect(screen.getByText('Опишите причину отказа')).toBeInTheDocument();
    expect(api.decide).not.toHaveBeenCalled();

    await userEvent.type(screen.getByRole('textbox'), 'Сомнительные контрагенты');
    await submit();
    expect(api.decide).toHaveBeenCalledWith('app-1', { type: 'reject', reason_codes: ['other'], comment: 'Сомнительные контрагенты' });
    expect(await screen.findByText('Очередь')).toBeInTheDocument();
  });

  it('одобрение вопреки скорингу требует причину', async () => {
    renderScreen('rejected');
    await userEvent.click(screen.getByRole('radio', { name: 'Одобрить' }));
    await submit();
    expect(screen.getByText('Решение отличается от скоринга: напишите причину')).toBeInTheDocument();
    expect(api.decide).not.toHaveBeenCalled();

    await userEvent.type(screen.getByRole('textbox'), 'Есть поручительство собственника');
    await submit();
    expect(api.decide).toHaveBeenCalledWith('app-1', { type: 'approve', comment: 'Есть поручительство собственника' });
  });

  it('одобрение по скорингу уходит без комментария', async () => {
    renderScreen('approved');
    await submit();
    expect(api.decide).toHaveBeenCalledWith('app-1', { type: 'approve', comment: undefined });
  });

  it('отказ при положительном скоринге требует причину', async () => {
    renderScreen('approved');
    await userEvent.click(screen.getByRole('radio', { name: 'Отказать' }));
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Высокая долговая нагрузка' }));
    await submit();
    expect(screen.getByText('Решение отличается от скоринга: напишите причину')).toBeInTheDocument();
    expect(api.decide).not.toHaveBeenCalled();
  });
});
