import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@alfalab/core-components/button';
import { Input } from '@alfalab/core-components/input';
import { PasswordInput } from '@alfalab/core-components/password-input';
import { Typography } from '@alfalab/core-components/typography';
import { AlfaBankLogoMIcon } from '@alfalab/icons-logotype/AlfaBankLogoMIcon';

import { login, saveToken } from '../../api/auth';
import { ApiError } from '../../api/client';
import { routes } from '../../routes';

import styles from './LoginPage.module.css';

const PASSWORD_MIN_LENGTH = 5;

function validateEmail(email: string): string | null {
  return email.includes('@') ? null : 'Email должен содержать символ @';
}

function validatePassword(password: string): string | null {
  return password.length >= PASSWORD_MIN_LENGTH
    ? null
    : `Пароль должен быть не короче ${PASSWORD_MIN_LENGTH} символов`;
}

export function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [touched, setTouched] = useState({ email: false, password: false });
  const [loading, setLoading] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const emailError = validateEmail(email.trim());
  const passwordError = validatePassword(password);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setTouched({ email: true, password: true });
    if (emailError || passwordError) return;

    setLoading(true);
    setServerError(null);

    try {
      const token = await login({ login: email.trim(), password });
      saveToken(token);
      navigate(routes.main, { replace: true });
    } catch (e) {
      setServerError(
        e instanceof ApiError && e.status === 401
          ? 'Неверный email или пароль'
          : 'Не удалось войти. Попробуйте позже',
      );
      setLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <span className={styles.logo} aria-label='Альфа-Банк'>
          <AlfaBankLogoMIcon />
        </span>
      </header>

      <main className={styles.main}>
        <Typography.Title tag='h1' view='xlarge' font='styrene' className={styles.title}>
          Альфа-Бизнес
        </Typography.Title>
        <Typography.Text tag='p' view='primary-large' className={styles.subtitle}>
          Вход в кредитный кабинет
        </Typography.Text>

        <form className={styles.form} onSubmit={handleSubmit} noValidate>
          <Input
            label='Email'
            type='email'
            size={64}
            autoComplete='username'
            value={email}
            onChange={(_, { value }) => {
              setEmail(value);
              setServerError(null);
            }}
            onBlur={() => setTouched((t) => ({ ...t, email: true }))}
            error={touched.email && emailError}
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
            error={(touched.password && passwordError) || serverError}
            block
          />
          <Button
            type='submit'
            view='primary'
            size={64}
            block
            loading={loading}
            className={styles.submit}
          >
            Войти
          </Button>
        </form>
      </main>
    </div>
  );
}
