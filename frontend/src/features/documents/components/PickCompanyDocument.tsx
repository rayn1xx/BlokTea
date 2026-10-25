import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';

import { applicationsApi } from '@/features/applications/api';
import type { ApplicationDetail } from '@/features/applications/types';
import { documentsApi } from '@/features/documents/api';
import { errorText } from '@/shared/api/query';
import { keys } from '@/shared/api/queryKeys';
import { formatShortDateTime } from '@/shared/lib/format';
import { Btn, Dialog, ListItem, Note, SkeletonLines, Stack, Text } from '@/shared/ui';

import { PdfIcon } from './PdfIcon';

export function PickCompanyDocument({ app, onClose, onPicked, type }: { app: ApplicationDetail; onClose: () => void; onPicked: (docId: string) => void; type?: string }) {
  const docs = useQuery({ queryKey: keys.documents({ scope: 'company', all: true }), queryFn: () => documentsApi.list({}) });
  const [error, setError] = useState<string | null>(null);
  const pick = useMutation({
    mutationFn: async (docId: string) => {
      await applicationsApi.patch(app.id, { version: app.version, form: { data: { [`picked_${type ?? 'document'}_${docId}`]: docId } } }).catch(() => undefined);
      return docId;
    },
    onSuccess: (docId) => {
      onPicked(docId);
      onClose();
    },
    onError: (e) => setError(errorText(e)),
  });
  const list = (docs.data ?? []).filter((d) => d.status !== 'rejected' && (!type || d.document_type === type || !d.document_type));
  return (
    <Dialog open onClose={onClose} title='Документы компании' subtitle='Выберите сохранённый документ'>
      {docs.isLoading ? (
        <SkeletonLines lines={3} />
      ) : list.length === 0 ? (
        <Text secondary>Подходящих документов нет. Загрузите новый файл.</Text>
      ) : (
        <Stack gap={8}>
          {list.map((d) => (
            <ListItem
              key={d.id}
              bordered
              leading={<PdfIcon name={d.file_name} />}
              title={d.title}
              sub={`${d.file_name} · ${formatShortDateTime(d.uploaded_at)}`}
              right={
                <Btn variant='outline' size='m' loading={pick.isPending && pick.variables === d.id} onClick={() => pick.mutate(d.id)}>
                  Выбрать
                </Btn>
              }
            />
          ))}
          {error && <Note tone='negative'>{error}</Note>}
        </Stack>
      )}
    </Dialog>
  );
}
