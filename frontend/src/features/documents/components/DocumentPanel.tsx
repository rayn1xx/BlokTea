import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { SidePanel } from '@alfalab/core-components/side-panel';

import { documentsApi } from '@/features/documents/api';
import { useDocumentTypes } from '@/features/documents/hooks';
import type { DocumentRef } from '@/features/documents/types';
import { useCurrentHome } from '@/features/profile/components/AppShell/AppShell';
import { requestFile } from '@/shared/api/client';
import { errorText, queryClient } from '@/shared/api/query';
import { keys } from '@/shared/api/queryKeys';
import { DOCUMENT_STATUS } from '@/shared/i18n/ru';
import { formatDateTime } from '@/shared/lib/format';
import { Btn, Dialog, FileDrop, FilePreview, InfoRow, InfoRows, LoadingState, Note, Row, Stack, Text, ToneLabel } from '@/shared/ui';

import { DocumentAnalysisView } from './DocumentAnalysisView';

export function DocumentPanel({ id, onClose }: { id: string; onClose: () => void }) {
  const home = useCurrentHome();
  const types = useDocumentTypes();
  const doc = useQuery({
    queryKey: keys.document(id),
    queryFn: () => documentsApi.get(id),
    refetchInterval: (q) => (q.state.data?.status === 'analyzing' ? 1500 : false),
  });
  const [preview, setPreview] = useState<{ url: string; type: string; text?: string } | null>(null);
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const urlRef = useRef<string | null>(null);

  const d = doc.data;
  const canUpload = home.permissions.includes('upload_documents');
  const canDelete = canUpload && home.role !== 'authorized_employee';

  useEffect(() => () => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
  }, []);

  const refresh = (next?: DocumentRef) => {
    if (next) queryClient.setQueryData(keys.document(id), next);
    void queryClient.invalidateQueries({ queryKey: ['documents'] });
  };

  const loadPreview = async () => {
    try {
      const blob = await requestFile(`/documents/${id}/file`);
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      const url = URL.createObjectURL(blob);
      urlRef.current = url;
      setPreview({ url, type: blob.type, text: blob.type.startsWith('text/') ? await blob.text() : undefined });
    } catch (e) {
      setError(errorText(e));
    }
  };

  const download = async () => {
    try {
      const blob = await requestFile(`/documents/${id}/file`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = d?.file_name ?? 'document';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(errorText(e));
    }
  };

  const analyze = useMutation({ mutationFn: () => documentsApi.analyze(id), onSuccess: refresh, onError: (e) => setError(errorText(e)) });
  const replace = useMutation({
    mutationFn: (file: File) => documentsApi.newVersion(id, file),
    onSuccess: (next) => {
      refresh(next);
      setReplaceOpen(false);
      setPreview(null);
    },
    onError: (e) => setError(errorText(e)),
  });
  const remove = useMutation({
    mutationFn: () => documentsApi.remove(id),
    onSuccess: () => {
      refresh();
      void queryClient.invalidateQueries({ queryKey: keys.missingDocs });
      onClose();
    },
    onError: (e) => setError(errorText(e)),
  });

  return (
    <SidePanel open onClose={onClose} size={500} breakpoint={768}>
      <SidePanel.Header title={d?.title ?? 'Документ'} hasCloser />
      <SidePanel.Content>
        {!d ? (
          <LoadingState cards={1} />
        ) : (
          <Stack gap={20}>
            <InfoRows>
              <InfoRow label='Файл'>{d.file_name}</InfoRow>
              <InfoRow label='Тип'>{types.data?.find((t) => t.code === d.document_type)?.title ?? 'определяет ИИ'}</InfoRow>
              <InfoRow label='Статус'>
                <ToneLabel tone={DOCUMENT_STATUS[d.status].tone} small>
                  {DOCUMENT_STATUS[d.status].label}
                </ToneLabel>
              </InfoRow>
              <InfoRow label='Загрузил'>
                {d.origin === 'alfa_lk' ? 'Альфа-Бизнес' : d.uploaded_by.name}, {formatDateTime(d.uploaded_at)}
              </InfoRow>
              <InfoRow label='Версия'>
                v{d.version}
                {d.version > 1 && <Text small secondary>прошлые версии заменены</Text>}
              </InfoRow>
            </InfoRows>

            {!d.document_type && d.analysis?.detected_type && (
              <Note tone='info'>ИИ определил тип документа. Если тип неверный, замените файл или загрузите документ с выбранным типом</Note>
            )}

            <DocumentAnalysisView doc={d} />

            {preview ? (
              preview.text !== undefined ? (
                <FilePreview text={preview.text} />
              ) : preview.type.startsWith('image/') || preview.type === 'application/pdf' ? (
                <FilePreview url={preview.url} type={preview.type} title={d.title} />
              ) : (
                <Text secondary>Предпросмотр для этого формата недоступен, скачайте файл</Text>
              )
            ) : (
              <Btn variant='soft' onClick={loadPreview}>
                Предпросмотр
              </Btn>
            )}

            {error && <Note tone='negative'>{error}</Note>}

            <Row gap={8}>
              <Btn variant='soft' onClick={download}>
                Скачать
              </Btn>
              {canUpload && (
                <>
                  <Btn variant='soft' onClick={() => setReplaceOpen(true)}>
                    Заменить
                  </Btn>
                  <Btn variant='soft' onClick={() => analyze.mutate()} loading={analyze.isPending} disabled={d.origin === 'alfa_lk'}>
                    Проверить снова
                  </Btn>
                </>
              )}
              {canDelete && (
                <Btn variant='ghost' onClick={() => setConfirmDelete(true)}>
                  Удалить
                </Btn>
              )}
            </Row>
          </Stack>
        )}
      </SidePanel.Content>

      <Dialog open={replaceOpen} onClose={() => setReplaceOpen(false)} title='Заменить файл' subtitle='Будет создана новая версия документа'>
        <FileDrop onFile={(f) => replace.mutate(f)} disabled={replace.isPending} type={types.data?.find((t) => t.code === d?.document_type)} />
      </Dialog>

      <Dialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title='Удалить документ?'
        footer={
          <>
            <Btn size='l' onClick={() => remove.mutate()} loading={remove.isPending}>
              Удалить
            </Btn>
            <Btn variant='soft' size='l' onClick={() => setConfirmDelete(false)}>
              Отмена
            </Btn>
          </>
        }
      >
        <Text secondary>Документ пропадёт из кабинета. Если он нужен в заявке, его придётся загрузить снова</Text>
      </Dialog>
    </SidePanel>
  );
}
