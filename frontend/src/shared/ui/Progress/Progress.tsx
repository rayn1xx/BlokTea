import type { CSSProperties } from 'react';

import { cx } from '@/shared/lib/cx';

import s from './Progress.module.css';

const clamp = (v: number) => Math.max(0, Math.min(100, v));

export function Bar({ value, tone = 'red' }: { value: number; tone?: 'red' | 'green' | 'yellow' }) {
  return (
    <div className={s.bar} role='progressbar' aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}>
      <div className={cx(s.fill, s[tone])} style={{ '--value': `${clamp(value)}%` } as CSSProperties} />
    </div>
  );
}

export function StepsBar({ total, done }: { total: number; done: number }) {
  return (
    <div className={s.steps}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={cx(s.step, i < done && s.stepDone)} />
      ))}
    </div>
  );
}
