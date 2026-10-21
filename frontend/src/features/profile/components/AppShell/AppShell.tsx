import type { ComponentType, ReactNode, SVGProps } from 'react';
import { Navigate, NavLink, Outlet, useLocation, useNavigate, useOutletContext } from 'react-router-dom';
import { Button } from '@alfalab/core-components/button';
import { Typography } from '@alfalab/core-components/typography';
import { BellMIcon } from '@alfalab/icons-glyph/BellMIcon';
import { ChartColumnThreeMIcon } from '@alfalab/icons-glyph/ChartColumnThreeMIcon';
import { CreditCardMIcon } from '@alfalab/icons-glyph/CreditCardMIcon';
import { DocumentsLinesMIcon } from '@alfalab/icons-glyph/DocumentsLinesMIcon';
import { GearMIcon } from '@alfalab/icons-glyph/GearMIcon';
import { ListBulletedMIcon } from '@alfalab/icons-glyph/ListBulletedMIcon';
import { LogOutMIcon } from '@alfalab/icons-glyph/LogOutMIcon';
import { UsersMIcon } from '@alfalab/icons-glyph/UsersMIcon';
import { AlfaBankLogoMIcon } from '@alfalab/icons-logotype/AlfaBankLogoMIcon';

import { shortName } from '@/app/session';
import { authApi } from '@/features/auth/api';
import { useHome } from '@/features/profile/hooks';
import type { Home } from '@/features/profile/types';
import { isApiError } from '@/shared/api/client';
import { queryClient } from '@/shared/api/query';
import { ROLE_LABELS } from '@/shared/i18n/ru';
import { Card, ErrorState, LoadingState, NoRightsState } from '@/shared/ui';

import styles from './AppShell.module.css';

type NavItem = { to: string; label: string; icon: ComponentType<SVGProps<SVGSVGElement>>; match?: string[] };

const CLIENT_NAV: NavItem[] = [
  { to: '/home', label: 'Кредитование', icon: CreditCardMIcon, match: ['/home', '/applications', '/match', '/products', '/loans', '/readiness'] },
  { to: '/documents', label: 'Документы', icon: DocumentsLinesMIcon },
  { to: '/team', label: 'Команда', icon: UsersMIcon },
];

const BANK_NAV: NavItem[] = [
  { to: '/bank/queue', label: 'Очередь', icon: ListBulletedMIcon, match: ['/bank/queue', '/bank/applications'] },
  { to: '/bank/dashboard', label: 'Показатели', icon: ChartColumnThreeMIcon },
  { to: '/bank/settings', label: 'Настройки', icon: GearMIcon },
];

export function useCurrentHome() {
  return useOutletContext<Home>();
}

async function logoutAndGo(navigate: ReturnType<typeof useNavigate>) {
  await authApi.logout();
  queryClient.clear();
  navigate('/login', { replace: true });
}

export function ClientShell() {
  return <Shell kind='client' />;
}

export function BankShell() {
  return <Shell kind='bank' />;
}

function Shell({ kind }: { kind: 'client' | 'bank' }) {
  const navigate = useNavigate();
  const home = useHome();

  if (home.isLoading) {
    return (
      <div className={styles.center}>
        <div style={{ width: 'min(720px, 100%)', padding: 16 }}>
          <LoadingState />
        </div>
      </div>
    );
  }

  if (home.isError || !home.data) {
    if (isApiError(home.error, 'UNAUTHORIZED')) return <Navigate to='/login' replace />;
    return (
      <div className={styles.center}>
        <Card style={{ width: 'min(560px, 100%)' }}>
          <ErrorState error={home.error} onRetry={() => home.refetch()} />
        </Card>
      </div>
    );
  }

  const data = home.data;

  if (kind === 'client' && data.bank_role) return <Navigate to='/bank/queue' replace />;
  if (kind === 'bank' && !data.bank_role) return <Navigate to='/home' replace />;

  if (kind === 'client' && data.role === null) {
    return (
      <div className={styles.center}>
        <Card style={{ width: 'min(560px, 100%)' }}>
          <NoRightsState title='Нет доступа к компании' text='У вашей учётной записи нет роли в компании, поэтому разделы кабинета недоступны. Попросите собственника бизнеса назначить вам роль в разделе «Команда»' />
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <Button view='secondary' size={48} onClick={() => logoutAndGo(navigate)}>
              Выйти
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  const nav = kind === 'client' ? CLIENT_NAV : BANK_NAV;
  const subtitle =
    kind === 'client'
      ? data.company?.short_name ?? ''
      : data.bank_role === 'bank_admin'
        ? 'Администратор кредитного процесса'
        : 'Кредитный аналитик';

  return (
    <div className={styles.layout}>
      <aside className={styles.sidebar} aria-label='Меню'>
        <div className={styles.brand}>
          <span className={styles.logo} aria-hidden>
            <AlfaBankLogoMIcon />
          </span>
          <span className={styles.brandText}>
            <span className={styles.brandName}>{kind === 'client' ? 'Альфа-Бизнес' : 'Альфа-Банк'}</span>
            <span className={styles.brandSub}>{kind === 'client' ? 'Кредитный кабинет' : 'Кредитный конвейер'}</span>
          </span>
        </div>
        <Nav items={nav} />
      </aside>

      <div className={styles.main}>
        <header className={styles.header}>
          <div className={styles.headerTitle}>
            <span className={styles.mobileLogo} aria-hidden>
              <AlfaBankLogoMIcon />
            </span>
            <Typography.Text view='primary-medium' weight='bold' className={styles.company}>
              {subtitle}
            </Typography.Text>
          </div>
          <div className={styles.headerRight}>
            {kind === 'client' && (
              <NavLink to='/notifications' className={styles.bell} aria-label={`Уведомления: ${data.unread_notifications}`}>
                <BellMIcon />
                {data.unread_notifications > 0 && <span className={styles.badge}>{data.unread_notifications}</span>}
              </NavLink>
            )}
            <div className={styles.user}>
              <span className={styles.userName}>{shortName(data)}</span>
              <span className={styles.userRole}>{data.role ? ROLE_LABELS[data.role] : subtitle}</span>
            </div>
            <button type='button' className={styles.logout} onClick={() => logoutAndGo(navigate)} aria-label='Выйти'>
              <LogOutMIcon />
            </button>
          </div>
        </header>

        <main className={styles.content}>
          <Outlet context={data} />
        </main>
      </div>

      <nav className={styles.bottomNav} aria-label='Меню'>
        <Nav items={nav} compact />
      </nav>
    </div>
  );
}

function Nav({ items, compact }: { items: NavItem[]; compact?: boolean }) {
  const location = useLocation();
  return (
    <ul className={compact ? styles.bottomList : styles.navList}>
      {items.map(({ to, label, icon: Icon, match }) => {
        const active = (match ?? [to]).some((p) => location.pathname.startsWith(p));
        return (
          <li key={to}>
            <NavLink
              to={to}
              className={`${compact ? styles.bottomLink : styles.navLink} ${active ? styles.active : ''}`}
              aria-current={active ? 'page' : undefined}
              title={label}
            >
              <Icon className={styles.navIcon} />
              <span className={compact ? undefined : styles.navLabel}>{label}</span>
            </NavLink>
          </li>
        );
      })}
    </ul>
  );
}

export function PageContainer({ children, narrow }: { children: ReactNode; narrow?: boolean }) {
  return <div className={narrow ? styles.narrow : undefined}>{children}</div>;
}
