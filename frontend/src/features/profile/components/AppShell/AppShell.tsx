import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { ComponentType, SVGProps } from 'react';
import { Navigate, NavLink, Outlet, useLocation, useNavigate, useOutletContext } from 'react-router-dom';
import { BellMIcon } from '@alfalab/icons-glyph/BellMIcon';
import { ChartColumnThreeMIcon } from '@alfalab/icons-glyph/ChartColumnThreeMIcon';
import { ChevronDownMIcon } from '@alfalab/icons-glyph/ChevronDownMIcon';
import { ChevronRightMIcon } from '@alfalab/icons-glyph/ChevronRightMIcon';
import { CreditCardMIcon } from '@alfalab/icons-glyph/CreditCardMIcon';
import { DocumentLinesMIcon } from '@alfalab/icons-glyph/DocumentLinesMIcon';
import { GearMIcon } from '@alfalab/icons-glyph/GearMIcon';
import { ListBulletedMIcon } from '@alfalab/icons-glyph/ListBulletedMIcon';
import { OfficeMIcon } from '@alfalab/icons-glyph/OfficeMIcon';
import { UsersMIcon } from '@alfalab/icons-glyph/UsersMIcon';

import { authApi } from '@/features/auth/api';
import { CompanyProfileModal } from '@/features/company/components/CompanyProfileModal';
import { NotificationsDrawer } from '@/features/notifications/components/NotificationsDrawer';
import { useHome } from '@/features/profile/hooks';
import type { Home } from '@/features/profile/types';
import { isApiError } from '@/shared/api/client';
import { queryClient } from '@/shared/api/query';
import { ERRORS, ROLE_LABELS } from '@/shared/i18n/ru';
import { Avatar, Btn, Card, ErrorState, LoadingState, NoRightsState } from '@/shared/ui';

import styles from './AppShell.module.css';

type NavItem = { to: string; label: string; icon: ComponentType<SVGProps<SVGSVGElement>>; match?: string[] };

const CLIENT_NAV: NavItem[] = [
  {
    to: '/home',
    label: 'Кредитование',
    icon: CreditCardMIcon,
    match: ['/home', '/applications', '/match', '/products', '/loans', '/readiness', '/feed', '/onboarding', '/notifications'],
  },
  { to: '/documents', label: 'Документы', icon: DocumentLinesMIcon },
  { to: '/team', label: 'Компания и команда', icon: UsersMIcon },
];

const BANK_NAV: NavItem[] = [
  { to: '/bank/queue', label: 'Очередь', icon: ListBulletedMIcon, match: ['/bank/queue', '/bank/applications'] },
  { to: '/bank/dashboard', label: 'Показатели', icon: ChartColumnThreeMIcon },
  { to: '/bank/settings', label: 'Настройки', icon: GearMIcon },
];

type ShellControls = { openNotifications: () => void; openProfile: () => void };
const ShellContext = createContext<ShellControls>({ openNotifications: () => undefined, openProfile: () => undefined });

export function useShell() {
  return useContext(ShellContext);
}

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

function personName(home: Home) {
  return [home.first_name, home.last_name].filter(Boolean).join(' ');
}

function Shell({ kind }: { kind: 'client' | 'bank' }) {
  const navigate = useNavigate();
  const location = useLocation();
  const home = useHome();
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  useEffect(() => {
    if (location.pathname === '/notifications') setNotificationsOpen(true);
    if (location.pathname === '/onboarding/company') setProfileOpen(true);
  }, [location.pathname]);

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
          <NoRightsState
            title='Нет доступа к компании'
            text={`${ERRORS.noCompanyRole}. У вашей учётной записи нет роли в компании, поэтому разделы кабинета недоступны`}
          />
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <Btn variant='outline' size='l' onClick={() => logoutAndGo(navigate)}>
              Выйти
            </Btn>
          </div>
        </Card>
      </div>
    );
  }

  const nav = kind === 'client' ? CLIENT_NAV : BANK_NAV;
  const roleText = data.role ? ROLE_LABELS[data.role] : data.bank_role === 'bank_admin' ? 'Администратор' : 'Кредитный аналитик';
  const closeNotifications = () => {
    setNotificationsOpen(false);
    if (location.pathname === '/notifications') navigate('/home', { replace: true });
  };
  const closeProfile = () => {
    setProfileOpen(false);
    if (location.pathname === '/onboarding/company') navigate('/home', { replace: true });
  };

  return (
    <ShellContext.Provider value={{ openNotifications: () => setNotificationsOpen(true), openProfile: () => setProfileOpen(true) }}>
      <div className={styles.layout}>
        <aside className={styles.sidebar} aria-label='Меню'>
          <NavLink to={kind === 'client' ? '/home' : '/bank/queue'} className={styles.logo} aria-label='Альфа-Бизнес'>
            Альфа
          </NavLink>
          <Nav items={nav} />
          <UserCard name={personName(data)} role={roleText} onLogout={() => logoutAndGo(navigate)} />
        </aside>

        <div className={styles.main}>
          <header className={styles.header}>
            <button type='button' className={styles.company} onClick={kind === 'client' ? () => setProfileOpen(true) : undefined}>
              <span className={styles.mobileLogo}>Альфа</span>
              <span className={styles.companyName}>{kind === 'client' ? data.company?.short_name ?? 'Компания' : 'Альфа-Банк · кредитный конвейер'}</span>
              {kind === 'client' && <ChevronDownMIcon className={styles.companyChevron} />}
            </button>
            {kind === 'client' && (
              <div className={styles.headerRight}>
                <button type='button' className={styles.bell} onClick={() => setNotificationsOpen(true)} aria-label={`Уведомления: ${data.unread_notifications}`}>
                  <BellMIcon />
                  {data.unread_notifications > 0 && <span className={styles.badge}>{data.unread_notifications}</span>}
                </button>
                <span className={styles.divider} />
                <button type='button' className={styles.profileButton} onClick={() => setProfileOpen(true)}>
                  <OfficeMIcon />
                  <span className={styles.profileLabel}>Профиль компании</span>
                  <ChevronDownMIcon className={styles.companyChevron} />
                </button>
              </div>
            )}
          </header>

          <main className={styles.content}>
            <Outlet context={data} />
          </main>
        </div>

        <nav className={styles.bottomNav} aria-label='Меню'>
          <Nav items={nav} compact />
        </nav>
      </div>

      {kind === 'client' && (
        <>
          <NotificationsDrawer open={notificationsOpen} onClose={closeNotifications} />
          <CompanyProfileModal open={profileOpen} onClose={closeProfile} />
        </>
      )}
    </ShellContext.Provider>
  );
}

function UserCard({ name, role, onLogout }: { name: string; role: string; onLogout: () => void }) {
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
    <div ref={ref} className={styles.userWrap}>
      {open && (
        <div className={styles.userMenu} role='menu'>
          <button type='button' role='menuitem' className={styles.userMenuItem} onClick={onLogout}>
            Выйти
          </button>
        </div>
      )}
      <button type='button' className={styles.user} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <Avatar name={name} />
        <span className={styles.userText}>
          <span className={styles.userName}>{name}</span>
          <span className={styles.userRole}>{role}</span>
        </span>
        <ChevronRightMIcon className={styles.userChevron} />
      </button>
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
