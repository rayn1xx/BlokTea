import type { CSSProperties, ReactNode } from 'react';
import { Typography } from '@alfalab/core-components/typography';

import s from './ui.module.css';

export const cx = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(' ');

export function Card({
  children,
  compact,
  className,
  style,
}: {
  children: ReactNode;
  compact?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <section className={cx(s.card, compact && s.cardCompact, className)} style={style}>
      {children}
    </section>
  );
}

export function CardTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className={s.cardHeader}>
      <Typography.Title tag='h2' view='xsmall' weight='bold'>
        {children}
      </Typography.Title>
      {right}
    </div>
  );
}

export function Stack({
  gap = 16,
  children,
  className,
  style,
}: {
  gap?: number;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div className={cx(s.stack, className)} style={{ gap, ...style }}>
      {children}
    </div>
  );
}

export function Row({
  gap = 12,
  children,
  justify,
  align,
  className,
  style,
}: {
  gap?: number;
  children: ReactNode;
  justify?: CSSProperties['justifyContent'];
  align?: CSSProperties['alignItems'];
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div className={cx(s.row, className)} style={{ gap, justifyContent: justify, alignItems: align, ...style }}>
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  right,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className={s.pageHeader}>
      <div>
        <Typography.Title tag='h1' view='medium' className={s.pageTitle}>
          {title}
        </Typography.Title>
        {subtitle && (
          <Typography.Text tag='div' view='primary-medium' color='secondary' className={s.pageSubtitle}>
            {subtitle}
          </Typography.Text>
        )}
      </div>
      {right}
    </div>
  );
}

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
      className={className}
      style={tag === 'p' ? { margin: 0 } : undefined}
    >
      {children}
    </Typography.Text>
  );
}

export function InfoRows({ children }: { children: ReactNode }) {
  return <div className={s.infoRows}>{children}</div>;
}

export function InfoRow({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className={s.infoRow}>
      <Text secondary>{label}</Text>
      <span className={s.infoValue}>{children}</span>
    </div>
  );
}

export function LinkButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button type='button' className={s.linkButton} onClick={onClick}>
      {children}
    </button>
  );
}

export { s as uiStyles };
