import { type FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Input } from '@alfalab/core-components/input';
import { PasswordInput } from '@alfalab/core-components/password-input';

import { authApi } from '@/features/auth/api';
import { AuthLayout } from '@/features/auth/components/AuthLayout';
import { isApiError } from '@/shared/api/client';
import { errorText, fieldErrors } from '@/shared/api/query';
import { Btn, FieldTag, Note, Text } from '@/shared/ui';

import s from '../auth.module.css';

export function JoinScreen() {
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const next: Record<string, string> = {};
    if (!code.trim()) next.invite_code = 'Введите код приглашения';
    if (password.length < 8) next.password = 'Минимум 8 символов';
    setErrors(next);
    if (Object.keys(next).length) return;

    setLoading(true);
    try {
      const res = await authApi.acceptInvite({ invite_code: code.trim(), password });
      setDone(res.login);
    } catch (e) {
      const fe = fieldErrors(e);
      if (isApiError(e, 'INVITE_NOT_FOUND')) setErrors({ invite_code: 'Код не найден. Проверьте его у собственника' });
      else if (isApiError(e, 'INVITE_EXPIRED')) setErrors({ invite_code: 'Срок действия приглашения истёк. Попросите новое' });
      else setErrors(Object.keys(fe).length ? fe : { invite_code: errorText(e) });
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <AuthLayout title='Заявка на доступ отправлена' subtitle='Собственник подтвердит доступ, после этого войдите через Альфа-Бизнес'>
        <div className={s.success}>
          <Note tone='positive' title={`Ваш логин: ${done}`}>
            Запомните логин. Пароль вы только что придумали
          </Note>
        </div>
        <div className={s.actions}>
          <Btn size='xl' block onClick={() => navigate('/login')}>
            Ко входу
          </Btn>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title='Присоединиться к компании' subtitle='Введите код, который вам передал собственник'>
      <form className={s.form} onSubmit={submit} noValidate>
        <Input
          label='Код приглашения'
          size={64}
          block
          value={code}
          onChange={(_, { value }) => setCode(value.toUpperCase())}
          error={errors.invite_code}
          rightAddons={<FieldTag kind='required' />}
          hint='Например, 4821-KX'
        />
        <PasswordInput
          label='Придумайте пароль'
          size={64}
          block
          autoComplete='new-password'
          value={password}
          onChange={(_, { value }) => setPassword(value)}
          passwordVisible={visible}
          onPasswordVisibleChange={setVisible}
          error={errors.password}
          hint='Минимум 8 символов'
        />
        <Text small secondary>
          ФИО, роль и логин подставятся из приглашения после проверки кода
        </Text>
        <Btn type='submit' size='xl' block loading={loading} className={s.submit}>
          Отправить на подтверждение
        </Btn>
        <Btn variant='ghost' size='l' block onClick={() => navigate('/')}>
          Назад
        </Btn>
      </form>
    </AuthLayout>
  );
}
