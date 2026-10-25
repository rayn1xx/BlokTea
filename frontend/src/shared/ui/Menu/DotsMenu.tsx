import { useEffect, useRef, useState } from 'react';

import { cx } from '@/shared/lib/cx';

import { Btn } from '../Button/Btn';

import s from './DotsMenu.module.css';

export type MenuItem = { label: string; onClick: () => void; danger?: boolean };

export function DotsMenu({ items }: { items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  if (!items.length) return null;
  return (
    <div ref={ref} className={s.anchor}>
      <Btn variant='outline' size='m' onClick={() => setOpen((v) => !v)}>
        <span aria-label='Ещё действия'>···</span>
      </Btn>
      {open && (
        <div className={s.menu} role='menu'>
          {items.map((i) => (
            <button
              key={i.label}
              type='button'
              role='menuitem'
              className={cx(s.item, i.danger && s.danger)}
              onClick={() => {
                setOpen(false);
                i.onClick();
              }}
            >
              {i.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
