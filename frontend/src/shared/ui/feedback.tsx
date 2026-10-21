import type { ReactNode } from 'react';
import { Skeleton } from '@alfalab/core-components/skeleton';
import { CheckmarkCircleMIcon } from '@alfalab/icons-glyph/CheckmarkCircleMIcon';
import { ExclamationCircleMIcon } from '@alfalab/icons-glyph/ExclamationCircleMIcon';
import { InformationCircleMIcon } from '@alfalab/icons-glyph/InformationCircleMIcon';

import { cx, Stack, Text } from './layout';

import s from './ui.module.css';

export function Note({
  tone = 'neutral',
  title,
  children,
  action,
}: {
  tone?: 'neutral' | 'info' | 'attention' | 'positive' | 'negative';
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
}) {
  const Icon = tone === 'positive' ? CheckmarkCircleMIcon : tone === 'info' || tone === 'neutral' ? InformationCircleMIcon : ExclamationCircleMIcon;
  const cls = {
    neutral: s.noteNeutral,
    info: s.noteInfo,
    attention: s.noteAttention,
    positive: s.notePositive,
    negative: s.noteNegative,
  }[tone];
  return (
    <div className={cx(s.note, cls)}>
      <Icon className={s.noteIcon} />
      <div className={s.grow}>
        {title && (
          <Text medium tag='div'>
            {title}
          </Text>
        )}
        {children && (
          <Text small={!!title} secondary={!!title} tag='div' className={title ? undefined : undefined}>
            {children}
          </Text>
        )}
        {action && <div style={{ marginTop: 10 }}>{action}</div>}
      </div>
    </div>
  );
}

export function Progress({ value, tone = 'positive' }: { value: number; tone?: 'positive' | 'attention' | 'negative' }) {
  return (
    <div className={s.progressTrack} role='progressbar' aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}>
      <div
        className={cx(s.progressBar, tone === 'attention' && s.progressBarAttention, tone === 'negative' && s.progressBarNegative)}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}

export function SkeletonLines({ lines = 3, height = 20 }: { lines?: number; height?: number }) {
  return (
    <Stack gap={10}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} visible className={s.skeletonBlock}>
          <div style={{ height, width: `${90 - i * 12}%` }} />
        </Skeleton>
      ))}
    </Stack>
  );
}
