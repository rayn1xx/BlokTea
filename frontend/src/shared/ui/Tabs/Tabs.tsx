import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { cx } from '@/shared/lib/cx';

import s from './Tabs.module.css';

export type TabItem<T extends string> = { id: T; label: ReactNode; count?: number; to?: string };

export function Tabs<T extends string>({ items, value, onChange }: { items: TabItem<T>[]; value: T; onChange?: (id: T) => void }) {
  return (
    <nav className={s.tabs} role='tablist'>
      {items.map((t) => {
        const content = (
          <>
            {t.label}
            {t.count !== undefined && <span className={s.count}> · {t.count}</span>}
          </>
        );
        const cls = cx(s.tab, t.id === value && s.active);
        return t.to ? (
          <Link key={t.id} to={t.to} className={cls} role='tab' aria-selected={t.id === value}>
            {content}
          </Link>
        ) : (
          <button key={t.id} type='button' className={cls} role='tab' aria-selected={t.id === value} onClick={() => onChange?.(t.id)}>
            {content}
          </button>
        );
      })}
    </nav>
  );
}
