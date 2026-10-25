import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQueries, useQuery } from '@tanstack/react-query';
import { ArrowUpMIcon } from '@alfalab/icons-glyph/ArrowUpMIcon';
import { ChevronDownMIcon } from '@alfalab/icons-glyph/ChevronDownMIcon';
import { DocumentLinesMIcon } from '@alfalab/icons-glyph/DocumentLinesMIcon';
import { DocumentMIcon } from '@alfalab/icons-glyph/DocumentMIcon';
import { UserMIcon } from '@alfalab/icons-glyph/UserMIcon';

import { useApplication } from '@/features/applications/hooks';
import type { ApplicationDetail } from '@/features/applications/types';
import { documentsApi } from '@/features/documents/api';
import { DocumentAnalysisView } from '@/features/documents/components/DocumentAnalysisView';
import { PdfIcon } from '@/features/documents/components/PdfIcon';
import { useDocumentTypes } from '@/features/documents/hooks';
import type { DocumentRef, FromLkRequest } from '@/features/documents/types';
import { infoRequestsApi } from '@/features/info-requests/api';
import type { InfoRequest } from '@/features/info-requests/types';
import { useCurrentHome } from '@/features/profile/components/AppShell/AppShell';
import { tasksApi } from '@/features/tasks/api';
import { useTasks } from '@/features/tasks/hooks';
import { AssignDialog } from '@/features/team/components/AssignDialog';
import { errorText, invalidateApplication } from '@/shared/api/query';
import { keys } from '@/shared/api/queryKeys';
import { appNo, formatFileSize, formatLongDate, formatMoney, formatMonths, formatShortDateTime } from '@/shared/lib/format';
import { Btn, Card, Cell, DashedArea, Dialog, FileDrop, Grow, IconCircle, PageHead, Pill, QueryGate, Row, SkeletonLines, Stack, Text, TextArea, TextLink } from '@/shared/ui';

import r from './InfoRequestScreen.module.css';

const LK_KIND: Record<string, FromLkRequest['kind']> = {
  bank_statement: 'bank_statement',
  other_bank_statements: 'bank_statement',
  fin_statements_2025: 'fin_turnover',
  tax_return: 'tax_data',
};

export function InfoRequestScreen() {
  const { id = '', rid = '' } = useParams();
  const app = useApplication(id);
  const request = useQuery({ queryKey: keys.infoRequest(id, rid), queryFn: () => infoRequestsApi.get(id, rid) });
  return <QueryGate query={request}>{(data) => (app.data ? <RequestView app={app.data} request={data} /> : <SkeletonLines lines={5} />)}</QueryGate>;
}

function RequestView({ app, request }: { app: ApplicationDetail; request: InfoRequest }) {
  const navigate = useNavigate();
  const home = useCurrentHome();
  const types = useDocumentTypes(home.company?.legal_form);
  const tasks = useTasks('all');
  const [docIds, setDocIds] = useState<string[]>([]);
  const [comment, setComment] = useState('');
  const [commentOpen, setCommentOpen] = useState(false);
  const [mode, setMode] = useState<null | 'pick' | 'upload' | 'assign'>(null);
  const [error, setError] = useState<string | null>(null);

  const task = tasks.data?.find((t) => t.type === 'info_request' && t.cta.route.endsWith(request.id));
  const isMine = !task || task.assignee?.user_id === home.id;
  const docs = useQueries({
    queries: docIds.map((docId) => ({
      queryKey: keys.document(docId),
      queryFn: () => documentsApi.get(docId),
      refetchInterval: (q: { state: { data?: DocumentRef } }) => (q.state.data?.status === 'analyzing' ? 1500 : false),
    })),
  });
  const companyDocs = useQuery({ queryKey: keys.documents({ all: true }), queryFn: () => documentsApi.list({}) });
  const typeInfo = types.data?.find((t) => t.code === request.requested_document_types[0]);
  const lkKind = request.requested_document_types.map((t) => LK_KIND[t]).find(Boolean);
  const open = request.status === 'open';
  const canRespond = open && app.available_actions.includes('info_request.respond');

  const upload = useMutation({
    mutationFn: (file: File) =>
      documentsApi.upload({ file, document_type: request.requested_document_types[0], scope: 'application', application_id: app.id, info_request_id: request.id }),
    onSuccess: (doc) => {
      setDocIds((ids) => [...ids, doc.id]);
      setMode(null);
    },
    onError: (e) => setError(errorText(e)),
  });

  const fromLk = useMutation({
    mutationFn: () => {
      const to = new Date();
      const from = new Date(to.getFullYear(), to.getMonth() - 6, 1);
      return documentsApi.fromLk({ kind: lkKind ?? 'bank_statement', period_from: from.toISOString().slice(0, 10), period_to: to.toISOString().slice(0, 10), info_request_id: request.id });
    },
    onSuccess: (doc) => {
      setDocIds((ids) => [...ids, doc.id]);
      setMode(null);
    },
    onError: (e) => setError(errorText(e)),
  });

  const respond = useMutation({
    mutationFn: () => infoRequestsApi.respond(app.id, request.id, { document_ids: docIds, comment: comment.trim() || undefined }),
    onSuccess: () => {
      invalidateApplication(app.id);
      navigate(`/applications/${app.id}`);
    },
    onError: (e) => setError(errorText(e)),
  });

  const loaded = docs.map((d) => d.data).filter(Boolean) as DocumentRef[];
  const analyzing = loaded.some((d) => d.status === 'analyzing');
  const pickable = (companyDocs.data ?? []).filter((d) => !docIds.includes(d.id) && d.status !== 'rejected');

  return (
    <div className={r.page}>
      <PageHead
        title={`Заявка ${appNo(app.number)} · Нужен документ`}
        subtitle={`${app.product.name} · ${formatMoney(app.approved_amount ?? app.requested_amount)} · ${formatMonths(app.approved_term_months ?? app.requested_term_months)}`}
        right={
          <TextLink arrow onClick={() => navigate(`/applications/${app.id}`)}>
            К карточке заявки
          </TextLink>
        }
      />
      <Stack gap={16}>
        <section className={r.request}>
          <Pill tone='yellow' caps small>
            Запрос банка
          </Pill>
          <h2 className={r.question}>{request.question}</h2>
          {request.purpose_text && <div>Нужна, чтобы {request.purpose_text.replace(/^для чего:\s*/i, '').replace(/^чтобы\s*/i, '')}.</div>}
          <div className={r.muted}>
            Создан {formatShortDateTime(request.created_at)}
            {request.due_at ? ` · предоставить до ${formatLongDate(request.due_at)}` : ''}
          </div>
        </section>

        {!open && request.response ? (
          <section className={r.answered}>
            <b>Ответ отправлен {formatShortDateTime(request.response.answered_at)}</b>
            <div className={r.muted}>
              {request.response.answered_by.name}
              {request.response.comment ? `: ${request.response.comment}` : ''}. Документов: {request.response.document_ids.length}
            </div>
          </section>
        ) : (
          <>
            <div>
              <h3 className={r.label}>Документ</h3>
              <div className={r.choices}>
                <button type='button' className={r.choice} disabled={!canRespond} onClick={() => setMode('pick')}>
                  <DocumentLinesMIcon />
                  Выбрать из документов компании
                </button>
                <button type='button' className={r.choice} disabled={!canRespond} onClick={() => setMode('upload')}>
                  <ArrowUpMIcon />
                  Загрузить новый файл
                </button>
              </div>
              <div className={r.muted} style={{ marginTop: 8 }}>
                {typeInfo ? `${typeInfo.accepted_formats.join(', ').toUpperCase()} · до ${typeInfo.max_size_mb} МБ` : 'PDF, XLSX или CSV · до 10 МБ'}
              </div>
            </div>

            {loaded.length === 0 ? (
              <DashedArea icon={DocumentMIcon} title='Файл ещё не выбран' text='Выберите сохранённый документ или загрузите новый' />
            ) : (
              <Stack gap={10}>
                {loaded.map((d) => (
                  <Card key={d.id} compact>
                    <Stack gap={12}>
                      <Row justify='space-between' wrap={false}>
                        <Cell
                        leading={<PdfIcon name={d.file_name} />}
                        title={d.file_name}
                        sub={<>{formatFileSize(d.size_bytes)} · {d.origin === 'alfa_lk' ? 'из Альфа-Бизнеса' : 'загружен сейчас'}</>}
                        />
                        <TextLink tone='muted' onClick={() => setDocIds(docIds.filter((x) => x !== d.id))}>
                          Убрать
                        </TextLink>
                      </Row>
                      <DocumentAnalysisView doc={d} />
                    </Stack>
                  </Card>
                ))}
              </Stack>
            )}

            <section className={r.owner}>
              <UserMIcon className={r.ownerIcon} />
              <span style={{ flex: 1 }}>
                Ответственный: {task?.assignee ? `${task.assignee.name}${isMine ? ' (вы)' : ''}` : 'вы'}
              </span>
              {task?.available_actions.includes('task.reassign') && (
                <Btn variant='outline' size='m' onClick={() => setMode('assign')}>
                  Назначить сотруднику
                </Btn>
              )}
            </section>

            <div>
              <button type='button' className={r.commentToggle} onClick={() => setCommentOpen((v) => !v)}>
                <ChevronDownMIcon style={{ width: 18, height: 18, transform: commentOpen ? 'rotate(180deg)' : undefined }} />
                Добавить комментарий для банка
              </button>
              {commentOpen && (
                <div style={{ marginTop: 10 }}>
                  <TextArea value={comment} onChange={setComment} placeholder='Комментарий для банка' />
                </div>
              )}
            </div>
            {error && <Text color='negative' tag='div'>{error}</Text>}
          </>
        )}

        <div className={r.footer}>
          <div>
            <div className={r.muted}>После отправки ответа заявка вернётся на рассмотрение</div>
            <div style={{ marginTop: 8 }}>
              <TextLink tone='blue' onClick={() => navigate('/applications')}>
                ← Вернуться к заявкам
              </TextLink>
            </div>
          </div>
          {open && (
            <div style={{ textAlign: 'center' }}>
              <Btn size='l' className={r.send} disabled={!canRespond || analyzing || (!docIds.length && !comment.trim())} loading={respond.isPending} onClick={() => respond.mutate()}>
                Отправить ответ
              </Btn>
              <div className={r.muted} style={{ marginTop: 6 }}>
                {!docIds.length ? 'Сначала добавьте документ' : analyzing ? 'Дождитесь окончания проверки' : ' '}
              </div>
            </div>
          )}
        </div>
      </Stack>

      {mode === 'upload' && (
        <Dialog open onClose={() => setMode(null)} title='Загрузить новый файл' subtitle={typeInfo?.title}>
          <FileDrop type={typeInfo} onFile={(f) => upload.mutate(f)} disabled={upload.isPending} />
        </Dialog>
      )}
      {mode === 'pick' && (
        <Dialog open onClose={() => setMode(null)} title='Документы компании' subtitle='Выберите сохранённый документ'>
          <Stack gap={8}>
            {request.lk_available && (
              <div className={r.pick} style={{ background: 'var(--a-green-soft)' }}>
                <IconCircle icon={DocumentLinesMIcon} white />
                <Grow>
                  <b>Сформировать из Альфа-Бизнеса</b>
                  <div className={r.muted}>Возьмём данные вашего счёта, загружать ничего не нужно</div>
                </Grow>
                <Btn size='m' loading={fromLk.isPending} onClick={() => fromLk.mutate()}>
                  Сформировать
                </Btn>
              </div>
            )}
            {pickable.map((d) => (
              <div key={d.id} className={r.pick}>
                <PdfIcon name={d.file_name} />
                <Grow>
                  <b>{d.title}</b>
                  <div className={r.muted}>
                    {d.file_name} · {formatShortDateTime(d.uploaded_at)}
                  </div>
                </Grow>
                <Btn
                  variant='outline'
                  size='m'
                  onClick={() => {
                    setDocIds([...docIds, d.id]);
                    setMode(null);
                  }}
                >
                  Выбрать
                </Btn>
              </div>
            ))}
          </Stack>
        </Dialog>
      )}
      {mode === 'assign' && task && (
        <AssignDialog
          taskTitle={request.question}
          taskSubtitle={`Заявка ${appNo(app.number)}`}
          permission='upload_documents'
          excludeUserId={home.id}
          onClose={() => setMode(null)}
          onAssign={async (m) => {
            await tasksApi.reassign(task.id, m.id);
            invalidateApplication(app.id);
            navigate('/home');
          }}
        />
      )}
    </div>
  );
}
