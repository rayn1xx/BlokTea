import { type ReactNode, useEffect, useState } from 'react';
import { Button } from '@alfalab/core-components/button';
import { Input } from '@alfalab/core-components/input';

import { isDemoMode } from '@/app/env';
import { errorText } from '@/shared/api/query';

import { Dialog } from './Dialog';
import { Stack, Text, uiStyles as s } from './layout';
import { FieldTag } from './tags';
import type { Challenge } from '@/shared/types/common';

export function CodeConfirm({
  open,
  title,
  description,
  requestChallenge,
  confirm,
  onClose,
  onDone,
  submitLabel = 'Подтвердить',
}: {
  open: boolean;
  title: string;
  description?: ReactNode;
  requestChallenge: () => Promise<Challenge>;
  confirm: (challengeId: string, code: string) => Promise<unknown>;
  onClose: () => void;
  onDone: () => void;
  submitLabel?: string;
}) {
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const request = async () => {
    setError(null);
    setCode('');
    try {
      setChallenge(await requestChallenge());
    } catch (e) {
      setError(errorText(e));
    }
  };

  useEffect(() => {
    if (open) void request();
    else setChallenge(null);

  }, [open]);

  const submit = async () => {
    if (!challenge) return;
    if (!code.trim()) {
      setError('Введите код');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await confirm(challenge.challenge_id, code.trim());
      onDone();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button view='primary' size={48} onClick={submit} loading={loading} disabled={!challenge}>
            {submitLabel}
          </Button>
          <Button view='secondary' size={48} onClick={request}>
            Запросить код снова
          </Button>
        </>
      }
    >
      <Stack gap={16}>
        {description && <Text secondary>{description}</Text>}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <Input
            label='Код подтверждения'
            inputMode='numeric'
            autoComplete='one-time-code'
            size={56}
            block
            value={code}
            onChange={(_, { value }) => {
              setCode(value.replace(/\D/g, '').slice(0, 6));
              setError(null);
            }}
            error={error ?? undefined}
            rightAddons={<FieldTag kind='required' />}
          />
        </form>
        {isDemoMode() && challenge?.demo_code && (
          <span className={s.demoCode}>
            <Text small>Демо-режим, код:</Text>
            <Text bold>{challenge.demo_code}</Text>
          </span>
        )}
        <Text small secondary>
          Код действует 5 минут. Мы не отправляем коды по SMS и почте: всё происходит в кабинете
        </Text>
      </Stack>
    </Dialog>
  );
}
