import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CheckmarkCircleMIcon } from '@alfalab/icons-glyph/CheckmarkCircleMIcon';
import { ClockLineMIcon } from '@alfalab/icons-glyph/ClockLineMIcon';
import { DocumentMIcon } from '@alfalab/icons-glyph/DocumentMIcon';
import { ExclamationCircleMIcon } from '@alfalab/icons-glyph/ExclamationCircleMIcon';

import { useApplications } from '@/features/applications/hooks';
import { documentsApi } from '@/features/documents/api';
import { DocumentPanel } from '@/features/documents/components/DocumentPanel';
import { DocStatusPill } from '@/features/documents/components/DocStatusPill';
import { PdfIcon } from '@/features/documents/components/PdfIcon';
import { UploadDialog } from '@/features/documents/components/UploadDialog';
import type { DocumentRef } from '@/features/documents/types';
import { useCurrentHome } from '@/features/profile/components/AppShell/AppShell';
import { useTasks } from '@/features/tasks/hooks';
import { queryClient } from '@/shared/api/query';
import { keys } from '@/shared/api/queryKeys';
import { appNo, formatFileSize, formatShortDateTime } from '@/shared/lib/format';
import { Accordion, AiBadge, Btn, EmptyState, ErrorState, IconCircle, InfoLine, PageHead, Pill, SearchField, SkeletonLines, Stack, Tabs, TextLink, kit } from '@/shared/ui';

import s from '../documents.module.css';

type TabId = 'company' | 'application' | 'requests';

export function DocumentsScreen() {
  const navigate = useNavigate();
  const home = useCurrentHome();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as TabId) ?? 'company';
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [upload, setUpload] = useState<null | { type?: string; title: string; applicationId?: string }>(null);
  const canUpload = home.permissions.includes('upload_documents');

  const docs = useQuery({
    queryKey: keys.documents({ tab }),
    queryFn: () => documentsApi.list(tab === 'application' ? { scope: 'application' } : tab === 'company' ? { scope: 'company' } : {}),
    enabled: tab !== 'requests',
    refetchInterval: (q) => (q.state.data?.some((d) => d.status === 'analyzing') ? 1500 : false),
  });
  const allDocs = useQuery({ queryKey: keys.documents({ all: true }), queryFn: () => documentsApi.list({}) });
  const missing = useQuery({ queryKey: keys.missingDocs, queryFn: documentsApi.missing });
  const tasks = useTasks('all');
  const apps = useApplications({ page: 1, page_size: 100 });
  const requests = (tasks.data ?? []).filter((t) => t.type === 'info_request');
  const appNumber = (id: string | null) => apps.data?.items.find((a) => a.id === id)?.number;

  const q = query.trim().toLowerCase();
  const list = (docs.data ?? []).filter((d) => !q || `${d.title} ${d.file_name}`.toLowerCase().includes(q));
  const lastChecked = [...(allDocs.data ?? [])].filter((d) => d.analysis && d.origin === 'upload').sort((a, b) => b.uploaded_at.localeCompare(a.uploaded_at))[0];

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['documents'] });
  };

  return (
    <div>
      <PageHead
        title='Документы'
        subtitle='Документы компании и кредитных заявок в одном месте.'
        right={
          canUpload ? (
            <Btn size='l' onClick={() => setUpload({ title: 'Загрузить документ' })}>
              Загрузить документ
            </Btn>
          ) : undefined
        }
      />
      <Tabs<TabId>
        value={tab}
        onChange={(id) => setParams(id === 'company' ? {} : { tab: id })}
        items={[
          { id: 'company', label: 'Документы компании' },
          { id: 'application', label: 'По заявкам' },
          { id: 'requests', label: 'Запросы банка', count: requests.length },
        ]}
      />
      <div className={s.layout} style={{ marginTop: 20 }}>
        <Stack gap={14}>
          {tab === 'requests' ? (
            requests.length === 0 ? (
              <EmptyState title='Открытых запросов нет' text='Когда банку понадобятся документы, запрос появится здесь' />
            ) : (
              requests.map((t) => (
                <div key={t.id} className={s.need} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <IconCircle icon={DocumentMIcon} />
                  <div style={{ flex: 1 }}>
                    <div className={kit.cellTitle}>{t.title}</div>
                    <div className={kit.cellSub}>
                      {t.application ? `Заявка ${appNo(t.application.number)}` : ''}
                      {t.waiting_for_text ? ` · ${t.waiting_for_text}` : ''}
                    </div>
                  </div>
                  <Btn variant='outlineRed' size='m' onClick={() => navigate(t.cta.route)}>
                    {t.cta.label}
                  </Btn>
                </div>
              ))
            )
          ) : (
            <>
              <SearchField value={query} onChange={setQuery} placeholder='Поиск по названию документа' />
              {docs.isLoading ? (
                <SkeletonLines lines={4} />
              ) : docs.isError ? (
                <ErrorState error={docs.error} onRetry={() => docs.refetch()} />
              ) : list.length === 0 ? (
                <EmptyState title='Документов пока нет' text='Загрузите документ: тип можно не выбирать, его определит ИИ' />
              ) : (
                <div className={kit.tableWrap}>
                  <table className={kit.table}>
                    <thead>
                      <tr>
                        <th>Документ</th>
                        <th>Статус</th>
                        <th>Действия</th>
                      </tr>
                    </thead>
                    <tbody>
                      {list.map((d) => (
                        <DocRow key={d.id} doc={d} appNumber={appNumber(d.application_id)} onOpen={() => setOpenId(d.id)} />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <InfoLine>Подходящие документы можно использовать в нескольких заявках.</InfoLine>
            </>
          )}
          <Accordion icon={ClockLineMIcon} title='История загрузок'>
            <Stack gap={8}>
              {[...(allDocs.data ?? [])]
                .sort((a, b) => b.uploaded_at.localeCompare(a.uploaded_at))
                .slice(0, 10)
                .map((d) => (
                  <div key={d.id} className={s.history}>
                    <span className={s.muted}>{formatShortDateTime(d.uploaded_at)}</span>
                    <span>
                      {d.file_name} · {d.origin === 'alfa_lk' ? 'из Альфа-Бизнеса' : d.uploaded_by.name}
                    </span>
                  </div>
                ))}
            </Stack>
          </Accordion>
          <div className={s.muted}>Доступ к файлам зависит от прав сотрудника.</div>
        </Stack>

        <Stack gap={14}>
          <section className={s.sideCard}>
            <h2 className={s.sideTitle}>Нужно добавить</h2>
            {!missing.data ? (
              <SkeletonLines lines={2} />
            ) : missing.data.items.length === 0 ? (
              <div className={s.muted}>Все нужные документы на месте</div>
            ) : (
              <Stack gap={10}>
                {missing.data.items.map((m) => {
                  const task = requests.find((t) => t.application?.id === m.application_id);
                  return (
                    <div key={`${m.document_type}-${m.application_id}`} className={s.need}>
                      <div style={{ display: 'flex', gap: 10 }}>
                        <DocumentMIcon style={{ width: 22, height: 22, color: 'var(--a-text-2)', flexShrink: 0 }} />
                        <div>
                          <b>{m.title}</b>
                          <div className={s.muted}>{m.reason}</div>
                          {task?.assignee && <div className={s.muted}>Ответственный: {task.assignee.name}</div>}
                        </div>
                      </div>
                      <div style={{ marginTop: 10 }}>
                        <Btn
                          variant='outline'
                          size='m'
                          block
                          disabled={!canUpload}
                          onClick={() => (task ? navigate(task.cta.route) : setUpload({ type: m.document_type, title: m.title, applicationId: m.application_id ?? undefined }))}
                        >
                          Загрузить
                        </Btn>
                      </div>
                      {task?.available_actions.includes('task.reassign') && (
                        <div style={{ marginTop: 8 }}>
                          <TextLink tone='blue' underline onClick={() => navigate(task.cta.route)}>
                            Назначить сотруднику
                          </TextLink>
                        </div>
                      )}
                    </div>
                  );
                })}
              </Stack>
            )}
          </section>

          {lastChecked && (
            <section className={s.sideCard}>
              <h2 className={s.sideTitle}>Проверка документа</h2>
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <PdfIcon name={lastChecked.file_name} />
                <div>
                  <b>{lastChecked.file_name}</b>
                  <div style={{ marginTop: 4 }}>
                    <AiBadge source={lastChecked.analysis?.text_source} hint={false} />
                    {!lastChecked.analysis || lastChecked.analysis.status !== 'done' ? <Pill small>Проверяется</Pill> : null}
                  </div>
                </div>
              </div>
              <Stack gap={6} style={{ marginTop: 12 }}>
                {lastChecked.analysis?.checks.map((c) => (
                  <div key={c.code} className={s.check}>
                    {c.passed ? (
                      <CheckmarkCircleMIcon style={{ color: 'var(--a-green)' }} />
                    ) : (
                      <ExclamationCircleMIcon style={{ color: '#e08a00' }} />
                    )}
                    {c.text}
                  </div>
                ))}
              </Stack>
              {lastChecked.status === 'rejected' && (
                <>
                  <div className={s.muted} style={{ margin: '10px 0' }}>
                    Проверьте файл перед отправкой в банк.
                  </div>
                  <Btn variant='outline' size='m' block onClick={() => setOpenId(lastChecked.id)}>
                    Загрузить исправленный файл
                  </Btn>
                </>
              )}
              <div style={{ marginTop: 10 }}>
                <TextLink tone='blue' underline onClick={() => setOpenId(lastChecked.id)}>
                  Подробнее
                </TextLink>
              </div>
              <div className={s.muted} style={{ marginTop: 10 }}>
                Окончательная проверка: сотрудником банка.
              </div>
            </section>
          )}
        </Stack>
      </div>

      {openId && <DocumentPanel id={openId} onClose={() => setOpenId(null)} />}
      {upload && (
        <UploadDialog
          open
          title={upload.title}
          documentType={upload.type}
          applicationId={upload.applicationId}
          onClose={() => setUpload(null)}
          onUploaded={(id) => {
            refresh();
            setOpenId(id);
          }}
        />
      )}
    </div>
  );
}

function DocRow({ doc, appNumber, onOpen }: { doc: DocumentRef; appNumber?: string; onOpen: () => void }) {
  return (
    <tr>
      <td>
        <div className={s.docCell}>
          <PdfIcon name={doc.file_name} />
          <div>
            <div className={kit.cellTitle}>{doc.file_name}</div>
            <div className={kit.cellSub}>
              {[
                doc.file_name.split('.').pop()?.toUpperCase(),
                formatFileSize(doc.size_bytes),
                `версия ${doc.version}`,
                appNumber ? `заявка ${appNo(appNumber)}` : null,
                doc.origin === 'alfa_lk' ? 'из Альфа-Бизнеса' : `добавил ${doc.uploaded_by.name}`,
              ]
                .filter(Boolean)
                .join(' · ')}
            </div>
          </div>
        </div>
      </td>
      <td>
        <DocStatusPill doc={doc} />
      </td>
      <td>
        <Btn variant='outline' size='m' onClick={onOpen}>
          {doc.status === 'rejected' ? 'Подробнее' : 'Открыть'}
        </Btn>
      </td>
    </tr>
  );
}
