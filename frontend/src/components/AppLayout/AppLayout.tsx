import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate, useOutletContext } from 'react-router-dom';
import { Button } from '@alfalab/core-components/button';
import { Spinner } from '@alfalab/core-components/spinner';
import { Typography } from '@alfalab/core-components/typography';
import { AlfaBankLogoMIcon } from '@alfalab/icons-logotype/AlfaBankLogoMIcon';

import { logout } from '../../api/auth';
import { ApiError } from '../../api/client';
import { getHome } from '../../api/home';
import { clearToken } from '../../api/token';
import type { User } from '../../models';
import { NoAccessPage } from '../../pages/NoAccessPage/NoAccessPage';
import { routes } from '../../routes';

import styles from './AppLayout.module.css';

const NAV_ITEMS = [{ to: routes.main, label: 'Главная' }];

// каркас всех страниц после входа: загружает профиль, проверяет роль, рисует шапку
export function AppLayout() {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    getHome()
      .then(setUser)
      .catch((e) => {
        // 401 здесь значит, что и refresh не помог — сессия закончилась
        if (e instanceof ApiError && e.status === 401) {
          clearToken();
          navigate(routes.login, { replace: true });
          return;
        }
        setError(true);
      });
  }, [navigate]);

  const handleLogout = async () => {
    await logout();
    navigate(routes.login, { replace: true });
  };

  if (error) {
    return (
      <div className={styles.center}>
        <Typography.Text view='primary-medium'>Не удалось загрузить данные</Typography.Text>
      </div>
    );
  }

  if (!user) {
    return (
      <div className={styles.center}>
        <Spinner visible preset={48} />
      </div>
    );
  }

  if (user.role === null) {
    return <NoAccessPage />;
  }

  return (
    <div className={styles.layout}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <div className={styles.brand}>
            <span className={styles.logo}>
              <AlfaBankLogoMIcon />
            </span>
            <span className={styles.brandName}>Альфа-Бизнес</span>
          </div>

          <nav className={styles.nav}>
            {NAV_ITEMS.map(({ to, label }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) => (isActive ? `${styles.navLink} ${styles.active}` : styles.navLink)}
              >
                {label}
              </NavLink>
            ))}
          </nav>

          <div className={styles.user}>
            <Typography.Text view='primary-small' color='secondary' className={styles.userName}>
              {[user.first_name, user.middle_name].filter(Boolean).join(' ')}
            </Typography.Text>
            <Button view='transparent' size={32} onClick={handleLogout}>
              Выйти
            </Button>
          </div>
        </div>
      </header>

      <main className={styles.content}>
        <Outlet context={user} />
      </main>
    </div>
  );
}

// профиль текущего пользователя для страниц внутри AppLayout
export function useCurrentUser() {
  return useOutletContext<User>();
}
