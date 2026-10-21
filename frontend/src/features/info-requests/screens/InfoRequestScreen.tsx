import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQueries, useQuery } from '@tanstack/react-query';
import { Button } from '@alfalab/core-components/button';
import { Textarea } from '@alfalab/core-components/textarea';
import { Typography } from '@alfalab/core-components/typography';

import { documentsApi } from '@/features/documents/api';
import { DocumentAnalysisView } from '@/features/documents/components/DocumentAnalysisView';
import { useDocumentTypes } from '@/features/documents/hooks';
import type { DocumentRef, FromLkRequest } from '@/features/documents/types';
import { infoRequestsApi } from '@/features/info-requests/api';
import type { InfoRequest } from '@/features/info-requests/types';
import { useCurrentHome } from '@/features/profile/components/AppShell/AppShell';
import { tasksApi } from '@/features/tasks/api';
import { useTasks } from '@/features/tasks/hooks';
import { MemberPicker } from '@/features/team/components/MemberPicker';
import { errorText, invalidateApplication } from '@/shared/api/query';
import { keys } from '@/shared/api/queryKeys';
import { formatDate, formatDateTime, formatFileSize } from '@/shared/lib/format';
import { Card, CardTitle, Dialog, FieldTag, FileDrop, Note, PageHeader, QueryGate, Row, SmallTag, Stack, Text, uiStyles as s } from '@/shared/ui';

export function InfoRequestScreen() {
  const { id = '', rid = '' } = useParams();
  const request = useQuery({ queryKey: keys.infoRequest(id, rid), queryFn: () => infoRequestsApi.get(id, rid) });
  return <QueryGate query={request}>{(data) => <InfoRequestView applicationId={id} request={data} />}</QueryGate>;
}

const LK_KIND: Record<string, FromLkRequest['kind']> = {
  bank_statement: 'bank_statement',
  fin_statements_2025: 'fin_turnover',
  tax_return: 'tax_data',
};

function InfoRequestView({ applicationId, request }: { applicationId: string; request: InfoRequest }) {
  const navigate = useNavigate();
  const home = useCurrentHome();
  const types = useDocumentTypes(home.company?.legal_form);
  const tasks = useTasks('mine');
  const [docIds, setDocIds] = useState<string[]>([]);
  const [comment, setComment] = useState('');
  const [pickOpen, setPickOpen] = useState(false);
  const [reassignOpen, setReassignOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const docs = useQueries({
    queries: docIds.map((docId) => ({
      queryKey: keys.document(docId),
      queryFn: () => documentsApi.get(docId),
      refetchInterval: (q: { state: { data?: DocumentRef } }) => (q.state.data?.status === 'analyzing' ? 1500 : false),
    })),
  });

  const companyDocs = useQuery({ queryKey: keys.documents({ scope: 'company' }), queryFn: () => documentsApi.list({}) });
  const task = tasks.data?.find((t) => t.type === 'info_request' && t.cta.route.endsWith(request.id));
  const requestedTitles = request.requested_document_types.map((code) => types.data?.find((t) => t.code === code)?.title ?? code);
  const lkKind = request.requested_document_types.map((t) => LK_KIND[t]).find(Boolean);
  const canRespond = request.status === 'open';

  const upload = useMutation({
    mutationFn: (file: File) =>
      documentsApi.upload({
        file,
        document_type: request.requested_document_types.length === 1 ? request.requested_document_types[0] : undefined,
        scope: 'application',
        application_id: applicationId,
        info_request_id: request.id,
      }),
    onSuccess: (doc) => setDocIds((ids) => [...ids, doc.id]),
    onError: (e) => setError(errorText(e)),
  });

  const fromLk = useMutation({
    mutationFn: () => {
      const to = new Date();
      const from = new Date(to.getFullYear(), to.getMonth() - 6, 1);
      return documentsApi.fromLk({
        kind: lkKind ?? 'bank_statement',
        period_from: from.toISOString().slice(0, 10),
        period_to: to.toISOString().slice(0, 10),
        info_request_id: request.id,
      });
    },
    onSuccess: (doc) => setDocIds((ids) => [...ids, doc.id]),
    onError: (e) => setError(errorText(e)),
  });

  const respond = useMutation({
    mutationFn: () => infoRequestsApi.respond(applicationId, request.id, { document_ids: docIds, comment: comment.trim() || undefined }),
    onSuccess: () => {
      invalidateApplication(applicationId);
      navigate(`/applications/${applicationId}`);
    },
    onError: (e) => setError(errorText(e)),
  });

  const loaded = docs.map((d) => d.data).filter(Boolean) as DocumentRef[];
  const analyzing = loaded.some((d) => d.status === 'analyzing');
  const pickable = (companyDocs.data ?? []).filter((d) => !docIds.includes(d.id) && d.status !== 'rejected');

  return (
    <div>
      <PageHeader
        title='Запрос банка'
        subtitle={`Создан ${formatDateTime(request.created_at)}${request.due_at ? `, ответить до ${formatDate(request.due_at)}` : ''}`}
        right={
          task?.available_actions.includes('task.reassign') ? (
            <Button view='secondary' size={40} onClick={() => setReassignOpen(true)}>
              Передать
            </Button>
          ) : undefined
        }
      />

      <Stack gap={16}>
        <Card>
          <Stack gap={12}>
            <Typography.Title tag='h2' view='small' weight='bold'>
              {request.question}
            </Typography.Title>
            {request.purpose_text && <Text secondary>Для чего: {request.purpose_text}</Text>}
            <Row gap={8}>
              {requestedTitles.map((t) => (
                <SmallTag key={t} tone='info'>
                  {t}
                </SmallTag>
              ))}
            </Row>
          </Stack>
        </Card>

        {request.status !== 'open' && request.response ? (
          <Note tone='positive' title={`Ответ отправлен ${formatDateTime(request.response.answered_at)}`}>
            {request.response.answered_by.name}
            {request.response.comment ? `: ${request.response.comment}` : ''}. Документов: {request.response.document_ids.length}
          </Note>
        ) : (
          <>
            <div className={s.grid2}>
              <Card>
                <CardTitle right={<FieldTag kind='lk' />}>Взять из Альфа-Бизнеса или загруженных</CardTitle>
                <Stack gap={12}>
                  <Text small secondary>
                    {request.lk_available ? 'Сформируем документ по данным вашего счёта, загружать ничего не нужно' : 'Выберите документ, который уже загружен в кабинет'}
                  </Text>
                  <Row gap={8}>
                    {request.lk_available && (
                      <Button view='primary' size={40} onClick={() => fromLk.mutate()} loading={fromLk.isPending} disabled={!canRespond}>
                        Взять из Альфа-Бизнеса
                      </Button>
                    )}
                    <Button view='secondary' size={40} onClick={() => setPickOpen(true)} disabled={!canRespond || !pickable.length}>
                      Выбрать из загруженных
                    </Button>
                  </Row>
                </Stack>
              </Card>
              <Card>
                <CardTitle>Загрузить новый файл</CardTitle>
                <FileDrop
                  type={request.requested_document_types.length === 1 ? types.data?.find((t) => t.code === request.requested_document_types[0]) : undefined}
                  onFile={(f) => upload.mutate(f)}
                  disabled={!canRespond || upload.isPending}
                />
              </Card>
            </div>

            {loaded.length > 0 && (
              <Card>
                <CardTitle>Документы для ответа</CardTitle>
                <Stack gap={16}>
                  {loaded.map((d) => (
                    <div key={d.id} style={{ paddingBottom: 12, borderBottom: '1px solid var(--color-light-bg-tertiary, #e7e8ea)' }}>
                      <Row justify='space-between' gap={8}>
                        <div>
                          <Text medium tag='div'>
                            {d.title}
                          </Text>
                          <Text small secondary tag='div'>
                            {d.file_name} · {formatFileSize(d.size_bytes)}
                          </Text>
                        </div>
                        <Button view='transparent' size={32} onClick={() => setDocIds(docIds.filter((x) => x !== d.id))}>
                          Убрать
                        </Button>
                      </Row>
                      <div style={{ marginTop: 10 }}>
                        <DocumentAnalysisView doc={d} />
                      </div>
                    </div>
                  ))}
                </Stack>
              </Card>
            )}

            <Card>
              <Stack gap={16}>
                <Textarea
                  label='Комментарий для банка'
                  block
                  minRows={2}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  rightAddons={<FieldTag kind='situational' />}
                />
                {error && <Note tone='negative'>{error}</Note>}
                <Row gap={12}>
                  <Button
                    view='primary'
                    size={56}
                    onClick={() => respond.mutate()}
                    loading={respond.isPending}
                    disabled={!canRespond || analyzing || (!docIds.length && !comment.trim())}
                  >
                    Отправить ответ
                  </Button>
                  {analyzing && (
                    <Text small secondary>
                      Дождитесь окончания проверки документа
                    </Text>
                  )}
                </Row>
              </Stack>
            </Card>
          </>
        )}
      </Stack>

      <Dialog open={pickOpen} onClose={() => setPickOpen(false)} title='Выбрать документ'>
        <Stack gap={8}>
          {pickable.map((d) => (
            <div key={d.id} className={s.personRow}>
              <div className={s.grow}>
                <Text medium tag='div'>
                  {d.title}
                </Text>
                <Text small secondary tag='div'>
                  {d.file_name} · {formatDate(d.uploaded_at)}
                </Text>
              </div>
              <Button
                view='secondary'
                size={32}
                onClick={() => {
                  setDocIds([...docIds, d.id]);
                  setPickOpen(false);
                }}
              >
                Выбрать
              </Button>
            </div>
          ))}
        </Stack>
      </Dialog>

      {task && (
        <MemberPicker
          open={reassignOpen}
          subtitle={task.title}
          permission='upload_documents'
          excludeUserId={home.id}
          onClose={() => setReassignOpen(false)}
          onSelect={async (m) => {
            await tasksApi.reassign(task.id, m.id);
            invalidateApplication(applicationId);
            navigate('/home');
          }}
        />
      )}
    </div>
  );
}
