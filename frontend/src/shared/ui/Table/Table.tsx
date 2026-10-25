import type { ReactNode } from 'react';

import { cx } from '@/shared/lib/cx';

import s from './Table.module.css';

export function Table({ children, variant = 'boxed', clickable }: { children: ReactNode; variant?: 'boxed' | 'plain'; clickable?: boolean }) {
  return (
    <div className={s.wrap}>
      <table className={cx(s.table, s[variant], clickable && s.clickable)}>{children}</table>
    </div>
  );
}

export function Cell({ leading, title, sub }: { leading?: ReactNode; title?: ReactNode; sub?: ReactNode }) {
  const text = (
    <div className={s.text}>
      {title !== undefined && <div className={s.title}>{title}</div>}
      {sub && <div className={s.sub}>{sub}</div>}
    </div>
  );
  if (!leading) return text;
  return (
    <div className={s.cell}>
      {leading}
      {text}
    </div>
  );
}
