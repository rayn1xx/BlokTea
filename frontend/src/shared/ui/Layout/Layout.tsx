import type { CSSProperties, ReactNode } from 'react';

import { cx } from '@/shared/lib/cx';

import s from './Layout.module.css';

type Gap = number;

export function Stack({ gap = 16, children, className, style }: { gap?: Gap; children: ReactNode; className?: string; style?: CSSProperties }) {
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
  wrap = true,
  className,
}: {
  gap?: Gap;
  children: ReactNode;
  justify?: CSSProperties['justifyContent'];
  align?: CSSProperties['alignItems'];
  wrap?: boolean;
  className?: string;
}) {
  return (
    <div className={cx(s.row, !wrap && s.nowrap, className)} style={{ gap, justifyContent: justify, alignItems: align }}>
      {children}
    </div>
  );
}

export function Grid({ cols = 2, gap = 16, children }: { cols?: 2 | 3; gap?: Gap; children: ReactNode }) {
  return (
    <div className={cx(s.grid, cols === 3 ? s.cols3 : s.cols2)} style={{ gap }}>
      {children}
    </div>
  );
}

export function Split({ children, aside, asideWidth = 360 }: { children: ReactNode; aside: ReactNode; asideWidth?: number }) {
  return (
    <div className={s.split} style={{ '--aside': `${asideWidth}px` } as CSSProperties}>
      <div className={s.main}>{children}</div>
      <aside className={s.aside}>{aside}</aside>
    </div>
  );
}

export function Grow({ children }: { children: ReactNode }) {
  return <div className={s.grow}>{children}</div>;
}
