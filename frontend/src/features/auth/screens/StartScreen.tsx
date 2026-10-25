import { useNavigate } from 'react-router-dom';

import { AuthLayout } from '@/features/auth/components/AuthLayout';
import { Btn, Text } from '@/shared/ui';

import s from '../auth.module.css';

export function StartScreen() {
  const navigate = useNavigate();
  return (
    <AuthLayout title='Альфа-Бизнес' subtitle='Кредитный кабинет для малого и микробизнеса'>
      <div className={s.actions}>
        <Btn size='xl' block onClick={() => navigate('/login')}>
          Войти через Альфа-Бизнес
        </Btn>
        <Btn variant='soft' size='xl' block onClick={() => navigate('/join')}>
          Присоединиться по приглашению
        </Btn>
      </div>
      <Text small secondary tag='p' className={s.hint}>
        Подберите кредит под задачу бизнеса, подайте заявку и следите за решением в одном месте
      </Text>
    </AuthLayout>
  );
}
