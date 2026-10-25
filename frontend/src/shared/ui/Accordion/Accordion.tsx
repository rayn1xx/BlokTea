import { type ReactNode, useState } from 'react';
import { ChevronDownMIcon } from '@alfalab/icons-glyph/ChevronDownMIcon';

import { cx } from '@/shared/lib/cx';

import type { Icon } from '../types';

import s from './Accordion.module.css';

export function Accordion({
  icon: IconCmp,
  title,
  subtitle,
  right,
  children,
  defaultOpen,
  onClick,
  arrow,
}: {
  icon?: Icon;
  title: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
  children?: ReactNode;
  defaultOpen?: boolean;
  onClick?: () => void;
  arrow?: 'down' | 'right' | 'none';
}) {
  const [open, setOpen] = useState(!!defaultOpen);
  const expandable = !!children;
  const handle = () => (onClick ? onClick() : expandable && setOpen((v) => !v));
  const chevron = arrow ?? (expandable ? 'down' : onClick ? 'right' : 'none');
  return (
    <div className={s.accordion}>
      <div
        role='button'
        tabIndex={0}
        className={s.head}
        onClick={handle}
        onKeyDown={(e) => {
          if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            handle();
          }
        }}
        aria-expanded={expandable ? open : undefined}
      >
        {IconCmp && (
          <span className={s.icon}>
            <IconCmp />
          </span>
        )}
        <span className={s.text}>
          <span className={s.title}>{title}</span>
          {subtitle && <span className={s.subtitle}>{subtitle}</span>}
        </span>
        {right}
        {chevron !== 'none' && <ChevronDownMIcon className={cx(s.chevron, chevron === 'right' && s.chevronRight, open && s.chevronOpen)} />}
      </div>
      {expandable && open && <div className={s.body}>{children}</div>}
    </div>
  );
}
