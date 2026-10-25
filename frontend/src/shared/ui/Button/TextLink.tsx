import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRightMIcon } from '@alfalab/icons-glyph/ArrowRightMIcon';

import { cx } from '@/shared/lib/cx';

import s from './TextLink.module.css';

export function TextLink({
  children,
  to,
  onClick,
  tone = 'default',
  arrow,
  underline,
  disabled,
}: {
  children: ReactNode;
  to?: string;
  onClick?: () => void;
  tone?: 'default' | 'red' | 'blue' | 'muted';
  arrow?: boolean;
  underline?: boolean;
  disabled?: boolean;
}) {
  const cls = cx(s.link, s[tone], underline && s.underline);
  const content = (
    <>
      {children}
      {arrow && <ArrowRightMIcon className={s.icon} />}
    </>
  );
  if (to && !disabled) {
    return (
      <Link to={to} className={cls}>
        {content}
      </Link>
    );
  }
  return (
    <button type='button' className={cls} onClick={onClick} disabled={disabled}>
      {content}
    </button>
  );
}

export function InlineLink({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button type='button' className={s.inline} onClick={onClick}>
      {children}
    </button>
  );
}
