import type { ComponentType, SVGProps } from 'react';
import { BanknoteStackMIcon } from '@alfalab/icons-glyph/BanknoteStackMIcon';
import { FactoryMIcon } from '@alfalab/icons-glyph/FactoryMIcon';
import { LightningMIcon } from '@alfalab/icons-glyph/LightningMIcon';
import { RepeatMIcon } from '@alfalab/icons-glyph/RepeatMIcon';
import { WalletMIcon } from '@alfalab/icons-glyph/WalletMIcon';

import type { ApplicationStatus, ProductCode } from '../../models';

// тон задаёт цвет точки, текста статуса и плашки с действием
export type StatusTone = 'neutral' | 'info' | 'attention' | 'positive' | 'negative';

export const STATUS_META: Record<ApplicationStatus, { label: string; tone: StatusTone }> = {
  draft: { label: 'Черновик', tone: 'neutral' },
  submitted: { label: 'Отправлена в банк', tone: 'info' },
  in_review: { label: 'На рассмотрении', tone: 'info' },
  info_requested: { label: 'Нужны уточнения', tone: 'attention' },
  approved: { label: 'Одобрена', tone: 'positive' },
  counter_offer: { label: 'Есть предложение', tone: 'positive' },
  rejected: { label: 'Отказ', tone: 'negative' },
  signing: { label: 'Подписание документов', tone: 'attention' },
  issued: { label: 'Кредит выдан', tone: 'positive' },
  cancelled: { label: 'Отозвана', tone: 'neutral' },
};

export const PRODUCT_ICONS: Record<ProductCode, ComponentType<SVGProps<SVGSVGElement>>> = {
  working_capital: BanknoteStackMIcon,
  investment: FactoryMIcon,
  overdraft: WalletMIcon,
  credit_line: RepeatMIcon,
  express: LightningMIcon,
};

// вкладки над списком; статусы уходят в query-параметр status
export const STATUS_FILTERS: { id: string; label: string; statuses: ApplicationStatus[] }[] = [
  { id: 'all', label: 'Все', statuses: [] },
  {
    id: 'action',
    label: 'Ждут вас',
    statuses: ['draft', 'info_requested', 'approved', 'counter_offer', 'signing'],
  },
  { id: 'in_progress', label: 'В банке', statuses: ['submitted', 'in_review'] },
  { id: 'done', label: 'Завершённые', statuses: ['issued', 'rejected', 'cancelled'] },
];
