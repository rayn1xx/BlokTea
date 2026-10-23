import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';

import { applicationsApi } from '@/features/applications/api';
import type { ApplicationDetail } from '@/features/applications/types';
import { errorText, invalidateApplication } from '@/shared/api/query';
import { CANCEL_REASONS } from '@/shared/i18n/ru';
import { appNo, formatMoney } from '@/shared/lib/format';
import { Btn, Dialog, Field, SelectField, Stack } from '@/shared/ui';

export function CancelDialog({ app, onClose }: { app: ApplicationDetail; onClose: () => void }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const cancel = useMutation({
    mutationFn: () => applicationsApi.cancel(app.id, reason || undefined),
    onSuccess: () => {
      invalidateApplication(app.id);
      onClose();
    },
    onError: (e) => setError(errorText(e)),
  });

  return (
    <Dialog open onClose={onClose} title='Отозвать заявку?' subtitle={`${appNo(app.number)} · ${app.product.name} · ${formatMoney(app.requested_amount)}`}>
      <Stack gap={18}>
        <p style={{ margin: 0, fontSize: 16, lineHeight: '24px' }}>
          Банк прекратит рассмотрение этой заявки.
          <br />
          Данные и документы сохранятся. При необходимости вы сможете создать новую заявку.
        </p>
        <Field label='Причина отзыва' optional hint='Поможет нам улучшить сервис'>
          <SelectField value={reason} placeholder='Выберите причину' options={CANCEL_REASONS.map((r) => ({ value: r, label: r }))} onChange={setReason} ariaLabel='Причина отзыва' />
        </Field>
        {error && <div style={{ color: 'var(--a-red)' }}>{error}</div>}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, paddingTop: 18, borderTop: '1px solid var(--a-border)' }}>
          <Btn variant='outline' size='l' block onClick={onClose}>
            Вернуться к заявке
          </Btn>
          <Btn size='l' block loading={cancel.isPending} onClick={() => cancel.mutate()}>
            Отозвать заявку
          </Btn>
        </div>
        <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--a-text-2)' }}>Заявка останется в истории со статусом «Отозвана».</div>
      </Stack>
    </Dialog>
  );
}
