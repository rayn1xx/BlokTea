import { BellMIcon } from '@alfalab/icons-glyph/BellMIcon';

import { cx } from '@/shared/lib/cx';

import s from './NotificationBell.module.css';

export function NotificationBell({ unread, onClick }: { unread: number; onClick: () => void }) {
  return (
    <button type='button' className={cx(s.bell, unread > 0 && s.ring)} onClick={onClick} aria-label={`Уведомления: ${unread}`}>
      <BellMIcon className={s.icon} />
      {unread > 0 && <span className={s.badge}>{unread}</span>}
    </button>
  );
}
