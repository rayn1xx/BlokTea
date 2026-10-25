import { cx } from '@/shared/lib/cx';

import type { Icon } from '../types';

import s from './Avatar.module.css';

const TONES = ['blue', 'red', 'green', 'orange', 'violet'] as const;

function initials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();
}

export function Avatar({ name, large }: { name: string; large?: boolean }) {
  const tone = TONES[[...name].reduce((sum, c) => sum + c.charCodeAt(0), 0) % TONES.length];
  return <span className={cx(s.avatar, s[tone], large && s.large)}>{initials(name)}</span>;
}

export function IconCircle({ icon: IconCmp, white, large }: { icon: Icon; white?: boolean; large?: boolean }) {
  return (
    <span className={cx(s.iconCircle, white && s.white, large && s.iconLarge)}>
      <IconCmp />
    </span>
  );
}
