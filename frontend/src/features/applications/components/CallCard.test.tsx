import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { CallNote } from '@/features/applications/types';

import { CallList } from './CallCard';

const call: CallNote = {
  id: 'c1',
  stage: 'in_review',
  stage_title: 'На рассмотрении',
  called_at: '2026-10-25T12:30:00+03:00',
  duration_minutes: 15,
  topic: 'Уточнили обороты',
  summary: 'Клиент подтвердил сезонный спад летом',
  agreements: ['Пришлёт выписку за июль'],
  next_step: 'Загрузить выписку',
  next_step_due: '2026-11-01',
  author_name: 'Петров П. П.',
};

describe('CallList', () => {
  it('показывает итоги, договорённости и следующий шаг', () => {
    render(<CallList calls={[call]} />);
    expect(screen.getByText('Уточнили обороты')).toBeInTheDocument();
    expect(screen.getByText('На рассмотрении')).toBeInTheDocument();
    expect(screen.getByText('Пришлёт выписку за июль')).toBeInTheDocument();
    expect(screen.getByText('Следующий шаг до 1 ноября 2026')).toBeInTheDocument();
    expect(screen.getByText(/15 мин · Петров П\. П\./)).toBeInTheDocument();
  });

  it('без звонков показывает подсказку', () => {
    render(<CallList calls={[]} empty='Звонков пока не было' />);
    expect(screen.getByText('Звонков пока не было')).toBeInTheDocument();
  });
});
