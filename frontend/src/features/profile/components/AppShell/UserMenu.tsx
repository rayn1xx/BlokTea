import { useEffect, useRef, useState } from 'react';
import { ChevronRightMIcon } from '@alfalab/icons-glyph/ChevronRightMIcon';

import { Avatar } from '@/shared/ui';

import s from './UserMenu.module.css';

export function UserMenu({ name, role, onLogout }: { name: string; role: string; onLogout: () => void }) {
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
  return (
    <div ref={ref} className={s.wrap}>
      {open && (
        <div className={s.menu} role='menu'>
          <button type='button' role='menuitem' className={s.item} onClick={onLogout}>
            Выйти
          </button>
        </div>
      )}
      <button type='button' className={s.user} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <Avatar name={name} />
        <span className={s.text}>
          <span className={s.name}>{name}</span>
          <span className={s.role}>{role}</span>
        </span>
        <ChevronRightMIcon className={s.chevron} />
      </button>
    </div>
  );
}
