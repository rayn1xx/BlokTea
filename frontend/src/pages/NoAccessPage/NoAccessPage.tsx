import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@alfalab/core-components/button';
import { Typography } from '@alfalab/core-components/typography';
import { LockClosedMIcon } from '@alfalab/icons-glyph/LockClosedMIcon';

import { logout } from '../../api/auth';
import { routes } from '../../routes';

import styles from './NoAccessPage.module.css';

export function NoAccessPage() {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(false);

  const handleLogout = async () => {
    setLoading(true);
    await logout();
    navigate(routes.login, { replace: true });
  };

  return (
    <main className={styles.page}>
      <span className={styles.icon}>
        <LockClosedMIcon />
      </span>
      <Typography.Title tag='h1' view='medium' className={styles.title}>
        Нет доступа
      </Typography.Title>
      <Typography.Text tag='p' view='primary-medium' color='secondary' className={styles.text}>
        У вашей учётной записи нет роли в компании. Обратитесь к владельцу бизнеса или
        руководителю, чтобы вам выдали доступ
      </Typography.Text>
      <Button view='secondary' size={56} onClick={handleLogout} loading={loading} className={styles.button}>
        Выйти
      </Button>
    </main>
  );
}
