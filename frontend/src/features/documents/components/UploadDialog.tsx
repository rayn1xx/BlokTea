import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';

import { documentsApi } from '@/features/documents/api';
import { errorText, queryClient } from '@/shared/api/query';
import { keys } from '@/shared/api/queryKeys';
import { Dialog, FileDrop, Stack, Text } from '@/shared/ui';

export function UploadDialog({
  open,
  onClose,
  documentType,
  title,
  applicationId,
  infoRequestId,
  onUploaded,
}: {
  open: boolean;
  onClose: () => void;
  documentType?: string;
  title: string;
  applicationId?: string;
  infoRequestId?: string;
  onUploaded?: (id: string) => void;
}) {
  const types = useQuery({ queryKey: keys.documentTypes(), queryFn: () => documentsApi.types() });
  const type = types.data?.find((t) => t.code === documentType) ?? null;
  const [error, setError] = useState<string | null>(null);
  const upload = useMutation({
    mutationFn: (file: File) =>
      documentsApi.upload({
        file,
        document_type: documentType,
        scope: applicationId ? 'application' : type?.scope ?? 'company',
        application_id: applicationId,
        info_request_id: infoRequestId,
      }),
    onSuccess: (doc) => {
      void queryClient.invalidateQueries({ queryKey: ['documents'] });
      void queryClient.invalidateQueries({ queryKey: ['company'] });
      void queryClient.invalidateQueries({ queryKey: ['applications'] });
      onUploaded?.(doc.id);
      onClose();
    },
    onError: (e) => setError(errorText(e)),
  });

  return (
    <Dialog open={open} onClose={onClose} title={title} subtitle={type?.title}>
      <Stack gap={12}>
        <FileDrop type={type} onFile={(f) => upload.mutate(f)} disabled={upload.isPending} />
        {upload.isPending && <Text secondary>Загружаем файл…</Text>}
        {error && <Text color='negative'>{error}</Text>}
        <Text small secondary>
          После загрузки ИИ проверит документ: тип, ИНН, период и подпись
        </Text>
      </Stack>
    </Dialog>
  );
}
