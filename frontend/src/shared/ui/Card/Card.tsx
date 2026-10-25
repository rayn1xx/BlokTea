import type { ReactNode } from 'react';

import { cx } from '@/shared/lib/cx';

import s from './Card.module.css';

export function Card({
  title,
  right,
  tight,
  compact,
  children,
  className,
}: {
  title?: ReactNode;
  right?: ReactNode;
  tight?: boolean;
  compact?: boolean;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section className={cx(s.card, tight && s.tight, compact && s.compact, className)}>
      {(title || right) && (
        <div className={s.head}>
          {typeof title === 'string' ? <h2 className={s.title}>{title}</h2> : title}
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

export type PanelTone = 'grey' | 'green' | 'yellow' | 'red' | 'blue' | 'white';

export function Panel({ tone = 'grey', compact, children, className }: { tone?: PanelTone; compact?: boolean; children: ReactNode; className?: string }) {
  return <div className={cx(s.panel, s[tone], compact && s.panelCompact, className)}>{children}</div>;
}
