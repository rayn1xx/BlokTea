import type { MouseEventHandler, ReactNode } from 'react';
import { Button } from '@alfalab/core-components/button';

import { cx } from '@/shared/lib/cx';

import s from './Btn.module.css';

export type BtnVariant = 'primary' | 'outlineRed' | 'outline' | 'soft' | 'ghost';

const VIEW = { primary: 'accent', outlineRed: 'outlined', outline: 'outlined', soft: 'secondary', ghost: 'transparent' } as const;
const SIZE = { s: 32, m: 40, l: 48, xl: 64 } as const;

export function Btn({
  variant = 'primary',
  size = 'm',
  block,
  loading,
  disabled,
  onClick,
  children,
  type = 'button',
  leftAddons,
  rightAddons,
  className,
}: {
  variant?: BtnVariant;
  size?: keyof typeof SIZE;
  block?: boolean;
  loading?: boolean;
  disabled?: boolean;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  children: ReactNode;
  type?: 'button' | 'submit';
  leftAddons?: ReactNode;
  rightAddons?: ReactNode;
  className?: string;
}) {
  return (
    <Button
      view={VIEW[variant]}
      size={SIZE[size]}
      block={block}
      loading={loading}
      disabled={disabled}
      onClick={onClick}
      type={type}
      leftAddons={leftAddons}
      rightAddons={rightAddons}
      className={cx(s.btn, s[variant], className)}
    >
      {children}
    </Button>
  );
}
