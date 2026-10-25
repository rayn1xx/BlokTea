import { ChevronDownMIcon } from '@alfalab/icons-glyph/ChevronDownMIcon';
import { OfficeMIcon } from '@alfalab/icons-glyph/OfficeMIcon';

import { Logo } from './Logo';
import { NotificationBell } from './NotificationBell';

import s from './ShellHeader.module.css';

export function ClientHeader({ company, unread, onOpenProfile, onOpenNotifications }: { company: string; unread: number; onOpenProfile: () => void; onOpenNotifications: () => void }) {
  return (
    <header className={s.header}>
      <div className={s.left}>
        <Logo to='/home' place='header' />
        <button type='button' className={s.company} onClick={onOpenProfile}>
          <span className={s.companyName}>{company}</span>
          <ChevronDownMIcon className={s.chevron} />
        </button>
      </div>
      <div className={s.right}>
        <NotificationBell unread={unread} onClick={onOpenNotifications} />
        <span className={s.divider} />
        <button type='button' className={s.profile} onClick={onOpenProfile}>
          <OfficeMIcon />
          <span className={s.profileLabel}>Профиль компании</span>
          <ChevronDownMIcon className={s.chevron} />
        </button>
      </div>
    </header>
  );
}

export function BankHeader() {
  return (
    <header className={s.header}>
      <div className={s.left}>
        <Logo to='/bank/queue' place='header' />
        <span className={s.companyName}>Альфа-Банк · кредитный конвейер</span>
      </div>
    </header>
  );
}
