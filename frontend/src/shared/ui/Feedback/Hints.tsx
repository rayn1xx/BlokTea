import type { ReactNode } from 'react';
import { Skeleton } from '@alfalab/core-components/skeleton';
import { InformationCircleLineMIcon } from '@alfalab/icons-glyph/InformationCircleLineMIcon';

import { cx } from '@/shared/lib/cx';

import { Stack } from '../Layout/Layout';
import type { Icon } from '../types';

import s from './Hints.module.css';

export function InfoLine({ children, icon: IconCmp = InformationCircleLineMIcon, spaced }: { children: ReactNode; icon?: Icon; spaced?: boolean }) {
  return (
    <div className={cx(s.line, spaced && s.spaced)}>
      <IconCmp />
      <span>{children}</span>
    </div>
  );
}

export function InfoStrip({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className={s.strip}>
      <InformationCircleLineMIcon />
      <span className={s.stripText}>{children}</span>
      {right}
    </div>
  );
}

export function DashedArea({ icon: IconCmp, title, text }: { icon: Icon; title: ReactNode; text?: ReactNode }) {
  return (
    <div className={s.dash}>
      <IconCmp />
      <div className={s.dashTitle}>{title}</div>
      {text && <div className={s.dashText}>{text}</div>}
    </div>
  );
}

export function SkeletonLines({ lines = 3, height = 20 }: { lines?: number; height?: number }) {
  return (
    <Stack gap={10}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} visible className={s.skeleton}>
          <div style={{ height, width: `${90 - i * 12}%` }} />
        </Skeleton>
      ))}
    </Stack>
  );
}
