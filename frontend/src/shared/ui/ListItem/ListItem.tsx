import type { ReactNode } from 'react';

import { cx } from '@/shared/lib/cx';

import s from './ListItem.module.css';

export function ListItem({
  leading,
  title,
  sub,
  right,
  bordered,
}: {
  leading?: ReactNode;
  title: ReactNode;
  sub?: ReactNode;
  right?: ReactNode;
  bordered?: boolean;
}) {
  return (
    <div className={cx(s.item, bordered && s.bordered)}>
      {leading}
      <div className={s.text}>
        <div className={s.title}>{title}</div>
        {sub && <div className={s.sub}>{sub}</div>}
      </div>
      {right}
    </div>
  );
}
