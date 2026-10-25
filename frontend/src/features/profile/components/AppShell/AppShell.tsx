import { createContext, type ReactNode, useContext, useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation, useNavigate, useOutletContext } from 'react-router-dom';
import { ChartColumnThreeMIcon } from '@alfalab/icons-glyph/ChartColumnThreeMIcon';
import { CreditCardMIcon } from '@alfalab/icons-glyph/CreditCardMIcon';
import { DocumentLinesMIcon } from '@alfalab/icons-glyph/DocumentLinesMIcon';
import { GearMIcon } from '@alfalab/icons-glyph/GearMIcon';
import { ListBulletedMIcon } from '@alfalab/icons-glyph/ListBulletedMIcon';
import { UsersMIcon } from '@alfalab/icons-glyph/UsersMIcon';

import { authApi } from '@/features/auth/api';
import { NotificationsDrawer } from '@/features/notifications/components/NotificationsDrawer';
import { useHome } from '@/features/profile/hooks';
import type { Home } from '@/features/profile/types';
import { isApiError } from '@/shared/api/client';
import { queryClient } from '@/shared/api/query';
import { ERRORS, ROLE_LABELS } from '@/shared/i18n/ru';
import { Btn, Card, ErrorState, LoadingState, NoRightsState, Row } from '@/shared/ui';

import { Logo } from './Logo';
import { BankHeader, ClientHeader } from './ShellHeader';
import { type NavItem, SideNav } from './SideNav';
import { UserMenu } from './UserMenu';

import s from './AppShell.module.css';

const CLIENT_NAV: NavItem[] = [
  {
    to: '/home',
    label: 'Кредитование',
    icon: CreditCardMIcon,
    match: ['/home', '/applications', '/match', '/products', '/loans', '/readiness', '/feed', '/onboarding', '/notifications', '/company'],
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

function Centered({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className={s.center}>
      <div className={wide ? s.centerWide : s.centerBox}>{children}</div>
    </div>
  );
}

function Shell({ kind }: { kind: 'client' | 'bank' }) {
  const navigate = useNavigate();
  const location = useLocation();
  const home = useHome();
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  useEffect(() => {
    if (location.pathname === '/notifications') setNotificationsOpen(true);
  }, [location.pathname]);

  if (home.isLoading) {
    return (
      <Centered wide>
        <LoadingState />
      </Centered>
    );
  }

  if (home.isError || !home.data) {
    if (isApiError(home.error, 'UNAUTHORIZED')) return <Navigate to='/login' replace />;
    return (
      <Centered>
        <Card>
          <ErrorState error={home.error} onRetry={() => home.refetch()} />
        </Card>
      </Centered>
    );
  }

  const data = home.data;

  if (kind === 'client' && data.bank_role) return <Navigate to='/bank/queue' replace />;
  if (kind === 'bank' && !data.bank_role) return <Navigate to='/home' replace />;

  if (kind === 'client' && data.role === null) {
    return (
      <Centered>
        <Card>
          <NoRightsState
            title='Нет доступа к компании'
            text={`${ERRORS.noCompanyRole}. У вашей учётной записи нет роли в компании, поэтому разделы кабинета недоступны`}
          />
          <Row justify='center'>
            <Btn variant='outline' size='l' onClick={() => logoutAndGo(navigate)}>
              Выйти
            </Btn>
          </Row>
        </Card>
      </Centered>
    );
  }

  const openProfile = () => navigate('/company/profile');
  const openNotifications = () => setNotificationsOpen(true);
  const nav = kind === 'client' ? CLIENT_NAV : BANK_NAV;
  const roleText = data.role ? ROLE_LABELS[data.role] : data.bank_role === 'bank_admin' ? 'Администратор' : 'Кредитный аналитик';
  const closeNotifications = () => {
    setNotificationsOpen(false);
    if (location.pathname === '/notifications') navigate('/home', { replace: true });
  };

  return (
    <ShellContext.Provider value={{ openNotifications, openProfile }}>
      <div className={s.layout}>
        <aside className={s.sidebar} aria-label='Меню'>
          <Logo to={kind === 'client' ? '/home' : '/bank/queue'} place='sidebar' />
          <nav className={s.sideNav}>
            <SideNav items={nav} place='side' />
          </nav>
          <UserMenu name={personName(data)} role={roleText} onLogout={() => logoutAndGo(navigate)} />
        </aside>

        <div className={s.main}>
          {kind === 'client' ? (
            <ClientHeader company={data.company?.short_name ?? 'Компания'} unread={data.unread_notifications} onOpenProfile={openProfile} onOpenNotifications={openNotifications} />
          ) : (
            <BankHeader />
          )}
          <main className={s.content}>
            <Outlet context={data} />
          </main>
        </div>

        <nav className={s.bottomNav} aria-label='Меню'>
          <SideNav items={nav} place='bottom' />
        </nav>
      </div>

      {kind === 'client' && <NotificationsDrawer open={notificationsOpen} onClose={closeNotifications} />}
    </ShellContext.Provider>
  );
}
