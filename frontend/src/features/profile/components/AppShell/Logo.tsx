import { NavLink } from 'react-router-dom';

import { cx } from '@/shared/lib/cx';

import s from './Logo.module.css';

export function Logo({ to, place }: { to: string; place: 'sidebar' | 'header' }) {
  return (
    <NavLink to={to} className={cx(s.logo, s[place])} aria-label='Альфа-Бизнес'>
      Альфа
    </NavLink>
  );
}
