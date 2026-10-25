import type { ReactNode } from 'react';
import { CheckmarkCircleMIcon } from '@alfalab/icons-glyph/CheckmarkCircleMIcon';
import { ExclamationCircleMIcon } from '@alfalab/icons-glyph/ExclamationCircleMIcon';
import { InformationCircleMIcon } from '@alfalab/icons-glyph/InformationCircleMIcon';

import { cx } from '@/shared/lib/cx';

import { Text } from '../Typography/Text';

import s from './Note.module.css';

export type NoteTone = 'neutral' | 'info' | 'attention' | 'positive' | 'negative';

const ICONS = {
  neutral: InformationCircleMIcon,
  info: InformationCircleMIcon,
  attention: ExclamationCircleMIcon,
  positive: CheckmarkCircleMIcon,
  negative: ExclamationCircleMIcon,
};

export function Note({ tone = 'neutral', title, children, action }: { tone?: NoteTone; title?: ReactNode; children?: ReactNode; action?: ReactNode }) {
  const Icon = ICONS[tone];
  return (
    <div className={cx(s.note, s[tone])}>
      <Icon className={s.icon} />
      <div className={s.body}>
        {title && (
          <Text medium tag='div'>
            {title}
          </Text>
        )}
        {children && (
          <Text small={!!title} secondary={!!title} tag='div'>
            {children}
          </Text>
        )}
        {action && <div className={s.action}>{action}</div>}
      </div>
    </div>
  );
}
