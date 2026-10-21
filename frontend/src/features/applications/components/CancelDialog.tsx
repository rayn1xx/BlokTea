import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@alfalab/core-components/button';
import { Textarea } from '@alfalab/core-components/textarea';

import { applicationsApi } from '@/features/applications/api';
import type { ApplicationDetail } from '@/features/applications/types';
import { errorText, invalidateApplication } from '@/shared/api/query';
import { Dialog, FieldTag, Stack, Text } from '@/shared/ui';

export function CancelDialog({ app, open, onClose }: { app: ApplicationDetail; open: boolean; onClose: () => void }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const cancel = useMutation({
    mutationFn: () => applicationsApi.cancel(app.id, reason.trim() || undefined),
    onSuccess: () => {
      invalidateApplication(app.id);
      onClose();
    },
    onError: (e) => setError(errorText(e)),
  });
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title='Отозвать заявку?'
      footer={
        <>
          <Button view='primary' size={48} onClick={() => cancel.mutate()} loading={cancel.isPending}>
            Отозвать
          </Button>
          <Button view='secondary' size={48} onClick={onClose}>
            Не отзывать
          </Button>
        </>
      }
    >
      <Stack gap={12}>
        <Text secondary>Банк прекратит рассмотрение. Вернуть заявку будет нельзя, но можно подать новую: данные подставятся сами</Text>
        <Textarea
          label='Причина'
          block
          minRows={2}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rightAddons={<FieldTag kind='situational' />}
        />
        {error && <Text color='negative'>{error}</Text>}
      </Stack>
    </Dialog>
  );
}
