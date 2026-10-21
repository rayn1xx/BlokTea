import { type FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@alfalab/core-components/button';
import { Input } from '@alfalab/core-components/input';
import { PasswordInput } from '@alfalab/core-components/password-input';

import { routeAfterLogin } from '@/app/session';
import { authApi } from '@/features/auth/api';
import { AuthLayout } from '@/features/auth/components/AuthLayout';
import { homeApi } from '@/features/profile/api';
import { isApiError } from '@/shared/api/client';
import { errorText, queryClient } from '@/shared/api/query';
import { keys } from '@/shared/api/queryKeys';
import { setToken } from '@/shared/api/token';
import { ERRORS, TEXTS } from '@/shared/i18n/ru';
import { FieldTag, Text } from '@/shared/ui';

import styles from '../auth.module.css';

export function LoginScreen() {
  const navigate = useNavigate();
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [touched, setTouched] = useState({ login: false, password: false });
  const [loading, setLoading] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const loginError = !login.trim() ? 'Введите почту' : login.includes('@') ? null : 'Почта должна содержать символ @';
  const passwordError = password ? null : 'Введите пароль';

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setTouched({ login: true, password: true });
    if (loginError || passwordError) return;

    setLoading(true);
    setServerError(null);
    try {
      const token = await authApi.login({ login: login.trim(), password });
      setToken(token.access_token);
      queryClient.clear();
      const home = await homeApi.get();
      queryClient.setQueryData(keys.home, home);
      navigate(routeAfterLogin(home), { replace: true });
    } catch (e) {
      setServerError(isApiError(e, 'UNAUTHORIZED') ? ERRORS.loginFailed : errorText(e));
      setLoading(false);
    }
  };

  return (
    <AuthLayout title='Альфа-Бизнес' subtitle='Вход в кредитный кабинет'>
      <form className={styles.form} onSubmit={handleSubmit} noValidate>
        <Input
          label='Почта'
          type='email'
          inputMode='email'
          size={64}
          autoComplete='email'
          value={login}
          onChange={(_, { value }) => {
            setLogin(value);
            setServerError(null);
          }}
          onBlur={() => setTouched((t) => ({ ...t, login: true }))}
          error={(touched.login && loginError) || undefined}
          rightAddons={<FieldTag kind='required' />}
          block
        />
        <PasswordInput
          label='Пароль'
          size={64}
          autoComplete='current-password'
          value={password}
          onChange={(_, { value }) => {
            setPassword(value);
            setServerError(null);
          }}
          onBlur={() => setTouched((t) => ({ ...t, password: true }))}
          passwordVisible={passwordVisible}
          onPasswordVisibleChange={setPasswordVisible}
          error={(touched.password && passwordError) || serverError || undefined}
          block
        />
        <Button type='submit' view='primary' size={64} block loading={loading} className={styles.submit}>
          Войти
        </Button>
      </form>
      <Text small secondary tag='p' className={styles.hint}>
        {TEXTS.loginHint}
      </Text>
    </AuthLayout>
  );
}
