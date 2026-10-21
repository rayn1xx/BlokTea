import { useNavigate } from 'react-router-dom';
import { Button } from '@alfalab/core-components/button';

import { AuthLayout } from '@/features/auth/components/AuthLayout';
import { Text } from '@/shared/ui';

import styles from '../auth.module.css';

export function StartScreen() {
  const navigate = useNavigate();
  return (
    <AuthLayout title='Альфа-Бизнес' subtitle='Кредитный кабинет для малого и микробизнеса'>
      <div className={styles.actions}>
        <Button view='primary' size={64} block onClick={() => navigate('/login')}>
          Войти через Альфа-Бизнес
        </Button>
        <Button view='secondary' size={64} block onClick={() => navigate('/join')}>
          Присоединиться по приглашению
        </Button>
      </div>
      <Text small secondary tag='p' className={styles.hint}>
        Подберите кредит под задачу бизнеса, подайте заявку и следите за решением в одном месте
      </Text>
    </AuthLayout>
  );
}
