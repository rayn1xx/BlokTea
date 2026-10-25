import type { ReactNode } from 'react';

import { cx } from '@/shared/lib/cx';

import s from './Metrics.module.css';

export type Metric = { value: ReactNode; label: ReactNode; hint?: ReactNode };

export function Metrics({ items, small }: { items: Metric[]; small?: boolean }) {
  return (
    <div className={cx(s.metrics, small && s.small)}>
      {items.map((m, i) => (
        <div key={i} className={s.metric}>
          <div className={s.value}>{m.value}</div>
          <div className={s.label}>{m.label}</div>
          {m.hint && <div className={s.hint}>{m.hint}</div>}
        </div>
      ))}
    </div>
  );
}
