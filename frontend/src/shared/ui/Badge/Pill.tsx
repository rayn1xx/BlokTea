import type { ReactNode } from 'react';

import type { StatusTone } from '@/shared/i18n/ru';
import { cx } from '@/shared/lib/cx';

import s from './Pill.module.css';

export type PillTone = 'grey' | 'green' | 'yellow' | 'red' | 'blue' | 'white' | 'purple';

export function Pill({ tone = 'grey', children, small, caps, icon }: { tone?: PillTone; children: ReactNode; small?: boolean; caps?: boolean; icon?: ReactNode }) {
  return (
    <span className={cx(s.pill, s[tone], small && s.small, caps && s.caps)}>
      {icon}
      {children}
    </span>
  );
}

const TONE_PILL: Record<StatusTone, PillTone> = {
  neutral: 'grey',
  info: 'blue',
  attention: 'yellow',
  positive: 'green',
  negative: 'red',
  purple: 'purple',
};

export function ToneLabel({ tone, children, small }: { tone: StatusTone; children: ReactNode; small?: boolean }) {
  return (
    <Pill tone={TONE_PILL[tone]} small={small}>
      {children}
    </Pill>
  );
}
