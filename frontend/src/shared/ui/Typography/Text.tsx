import type { ReactNode } from 'react';
import { Typography } from '@alfalab/core-components/typography';

import { cx } from '@/shared/lib/cx';

import s from './Text.module.css';

export function Text({
  children,
  secondary,
  small,
  bold,
  medium,
  className,
  tag = 'span',
  color,
}: {
  children: ReactNode;
  secondary?: boolean;
  small?: boolean;
  bold?: boolean;
  medium?: boolean;
  className?: string;
  tag?: 'span' | 'div' | 'p';
  color?: 'secondary' | 'positive' | 'negative' | 'attention' | 'primary';
}) {
  return (
    <Typography.Text
      tag={tag}
      view={small ? 'primary-small' : 'primary-medium'}
      color={color ?? (secondary ? 'secondary' : undefined)}
      weight={bold ? 'bold' : medium ? 'medium' : undefined}
      className={cx(tag === 'p' && s.paragraph, className)}
    >
      {children}
    </Typography.Text>
  );
}

export function InfoRows({ children }: { children: ReactNode }) {
  return <div className={s.rows}>{children}</div>;
}

export function InfoRow({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className={s.row}>
      <Text secondary>{label}</Text>
      <span className={s.value}>{children}</span>
    </div>
  );
}
