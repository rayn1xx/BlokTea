import { NavLink, useLocation } from 'react-router-dom';

import { cx } from '@/shared/lib/cx';
import { type Icon } from '@/shared/ui';

import s from './SideNav.module.css';

export type NavItem = { to: string; label: string; icon: Icon; match?: string[] };

export function SideNav({ items, place }: { items: NavItem[]; place: 'side' | 'bottom' }) {
  const location = useLocation();
  return (
    <ul className={s[place]}>
      {items.map(({ to, label, icon: IconCmp, match }) => {
        const active = (match ?? [to]).some((p) => location.pathname.startsWith(p));
        return (
          <li key={to}>
            <NavLink to={to} className={cx(s.link, active && s.active)} aria-current={active ? 'page' : undefined} title={label}>
              <IconCmp className={s.icon} />
              <span className={s.label}>{label}</span>
            </NavLink>
          </li>
        );
      })}
    </ul>
  );
}
