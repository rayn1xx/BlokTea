import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@alfalab/core-components/button';
import { Switch } from '@alfalab/core-components/switch';
import { UsersMIcon } from '@alfalab/icons-glyph/UsersMIcon';

import { isDemoMode, isMocks } from '@/app/env';
import { routeAfterLogin } from '@/app/session';
import { authApi } from '@/features/auth/api';
import { homeApi } from '@/features/profile/api';
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from '@/mocks/fixtures';
import { queryClient } from '@/shared/api/query';
import { setToken } from '@/shared/api/token';
import { Text } from '@/shared/ui';

import styles from './DemoPanel.module.css';

export function DemoPanel() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [llmStub, setLlmStub] = useState(() => {
    try {
      return localStorage.getItem('mock-llm-stub') === 'true';
    } catch {
      return false;
    }
  });

  if (!isDemoMode()) return null;

  const loginAs = async (login: string) => {
    setPending(login);
    setError(null);
    try {
      await authApi.logout();
      queryClient.clear();
      const token = await authApi.login({ login, password: DEMO_PASSWORD });
      setToken(token.access_token);
      const home = await homeApi.get();
      queryClient.setQueryData(['home'], home);
      setOpen(false);
      navigate(routeAfterLogin(home), { replace: true });
    } catch {
      setError('Не удалось войти. Проверьте, что бэкенд запущен или включены моки');
    } finally {
      setPending(null);
    }
  };

  const reset = async () => {
    await fetch('/api/v1/__mock/reset', { method: 'POST' });
    queryClient.clear();
    window.location.reload();
  };

  const toggleLlm = (value: boolean) => {
    setLlmStub(value);
    try {
      localStorage.setItem('mock-llm-stub', String(value));
    } catch {
    }
    void queryClient.invalidateQueries();
  };

  return (
    <div className={styles.root}>
      {open && (
        <div className={styles.panel} role='dialog' aria-label='Демо-режим'>
          <Text bold tag='div'>
            Войти как…
          </Text>
          <Text small secondary tag='div'>
            Пароль у всех учёток: {DEMO_PASSWORD}
          </Text>
          <ul className={styles.list}>
            {DEMO_ACCOUNTS.map((a) => (
              <li key={a.login}>
                <button type='button' className={styles.account} onClick={() => loginAs(a.login)} disabled={!!pending}>
                  <span className={styles.login}>{a.login}</span>
                  <span className={styles.title}>{pending === a.login ? 'Входим…' : a.title}</span>
                </button>
              </li>
            ))}
          </ul>
          {error && (
            <Text small color='negative' tag='div'>
              {error}
            </Text>
          )}
          {isMocks() && (
            <div className={styles.tools}>
              <Switch
                checked={llmStub}
                onChange={(_, { checked }) => toggleLlm(checked)}
                label='LLM выключена (llm: stub)'
              />
              <Button view='secondary' size={32} onClick={reset}>
                Сбросить демо-данные
              </Button>
            </div>
          )}
        </div>
      )}
      <button type='button' className={styles.fab} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <UsersMIcon />
        <span>Демо</span>
      </button>
    </div>
  );
}
