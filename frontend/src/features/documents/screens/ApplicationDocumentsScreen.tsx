import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { CheckmarkCircleMIcon } from '@alfalab/icons-glyph/CheckmarkCircleMIcon';
import { ClockLineMIcon } from '@alfalab/icons-glyph/ClockLineMIcon';
import { DocumentMIcon } from '@alfalab/icons-glyph/DocumentMIcon';
import { ExclamationCircleMIcon } from '@alfalab/icons-glyph/ExclamationCircleMIcon';

import { applicationsApi } from '@/features/applications/api';
import { useApplication, useApplications, useRequirements } from '@/features/applications/hooks';
import type { ApplicationDetail } from '@/features/applications/types';
import { documentsApi } from '@/features/documents/api';
import { DocumentPanel } from '@/features/documents/components/DocumentPanel';
import { DocStatusPill, docSource } from '@/features/documents/components/DocStatusPill';
import { PdfIcon } from '@/features/documents/components/PdfIcon';
import { UploadDialog } from '@/features/documents/components/UploadDialog';
import { useDocumentsForApplication } from '@/features/documents/hooks';
import { useCurrentHome } from '@/features/profile/components/AppShell/AppShell';
import { errorText, queryClient } from '@/shared/api/query';
import { keys } from '@/shared/api/queryKeys';
import { appNo, formatFileSize, formatMoney, formatShortDateTime } from '@/shared/lib/format';
import { Accordion, Btn, Dialog, DotsMenu, InfoLine, PageHead, Pill, QueryGate, SelectField, SkeletonLines, Stack, TextLink, kit } from '@/shared/ui';

import s from '../documents.module.css';

export function ApplicationDocumentsScreen() {
  const { id = '' } = useParams();
  const app = useApplication(id);
  return <QueryGate query={app}>{(data) => <DocsView app={data} />}</QueryGate>;
}

function DocsView({ app }: { app: ApplicationDetail }) {
  const navigate = useNavigate();
  const home = useCurrentHome();
  const docs = useDocumentsForApplication(app.id);
  const reqs = useRequirements(app.id);
  const apps = useApplications({ page: 1, page_size: 100, sort: '-created_at' });
  const [openId, setOpenId] = useState<string | null>(null);
  const [upload, setUpload] = useState<null | { type?: string; title: string }>(null);
  const [pick, setPick] = useState(false);
  const canUpload = home.permissions.includes('upload_documents');
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['documents'] });
    void queryClient.invalidateQueries({ queryKey: keys.requirements(app.id) });
  };

  const analyze = useMutation({ mutationFn: (docId: string) => documentsApi.analyze(docId), onSuccess: refresh });
  const remove = useMutation({ mutationFn: (docId: string) => documentsApi.remove(docId), onSuccess: refresh });

  const list = docs.data ?? [];
  const required = (reqs.data?.items ?? []).filter((r) => r.necessity === 'required' && !r.code.startsWith('consent'));
  const requiredDone = required.every((r) => r.status === 'done');
  const optional = (reqs.data?.items ?? []).filter((r) => r.necessity === 'situational' && r.status === 'missing' && r.action?.type === 'upload');
  const openRequests = app.info_requests.filter((r) => r.status === 'open').length;

  return (
    <div>
      <PageHead
        back={{ label: `К заявке ${appNo(app.number)}`, to: `/applications/${app.id}` }}
        title='Документы заявки'
        subtitle={`${app.product.name} · ${formatMoney(app.approved_amount ?? app.requested_amount)} · заявка ${appNo(app.number)}`}
        right={
          <div className={s.headRight}>
            <div style={{ width: 220 }}>
              <SelectField
                value={app.id}
                options={(apps.data?.items ?? [{ id: app.id, number: app.number }]).map((a) => ({ value: a.id, label: `По заявке ${appNo(a.number)}` }))}
                onChange={(v) => navigate(`/applications/${v}/documents`)}
                ariaLabel='Заявка'
              />
            </div>
            <TextLink arrow onClick={() => navigate('/documents')}>
              Все документы компании
            </TextLink>
          </div>
        }
      />
      <Stack gap={16}>
        <section className={requiredDone ? s.bannerOk : s.bannerWarn}>
          {requiredDone ? <CheckmarkCircleMIcon className={s.bannerIconOk} /> : <ExclamationCircleMIcon className={s.bannerIconWarn} />}
          <div>
            <b>{requiredDone ? 'Обязательные документы добавлены' : 'Не все обязательные документы добавлены'}</b>
            <div className={s.muted}>
              {list.length} {list.length === 1 ? 'файл' : list.length < 5 ? 'файла' : 'файлов'} · {openRequests ? `открытых запросов банка: ${openRequests}` : 'дополнительных запросов нет'}
            </div>
          </div>
        </section>

        <section className={kit.box}>
          <div className={kit.boxHead}>
            <h2 className={kit.boxTitle}>Файлы</h2>
            <div className={s.actions}>
              <Btn variant='outline' size='l' disabled={!canUpload} onClick={() => setPick(true)}>
                Выбрать из документов компании
              </Btn>
              <Btn size='l' disabled={!canUpload} onClick={() => setUpload({ title: 'Загрузить файл' })}>
                Загрузить файл
              </Btn>
            </div>
          </div>
          {docs.isLoading ? (
            <SkeletonLines lines={3} />
          ) : (
            <div className={kit.tableWrap}>
              <table className={kit.table}>
                <thead>
                  <tr>
                    <th>Документ</th>
                    <th>Источник</th>
                    <th>Статус</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {list.map((d) => (
                    <tr key={d.id}>
                      <td>
                        <div className={s.docCell}>
                          <PdfIcon name={d.file_name} />
                          <div>
                            <div className={kit.cellTitle}>{d.file_name}</div>
                            <div className={kit.cellSub}>
                              {d.file_name.split('.').pop()?.toUpperCase()} · {formatFileSize(d.size_bytes)} · версия {d.version}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td>{docSource(d)}</td>
                      <td>
                        <DocStatusPill doc={d} />
                      </td>
                      <td>
                        <div className={s.rowActions}>
                          <Btn variant='outline' size='m' onClick={() => setOpenId(d.id)}>
                            Открыть
                          </Btn>
                          <DotsMenu
                            items={[
                              ...(canUpload && d.origin !== 'alfa_lk' ? [{ label: 'Проверить снова', onClick: () => analyze.mutate(d.id) }] : []),
                              ...(canUpload && d.application_id ? [{ label: 'Удалить', onClick: () => remove.mutate(d.id), danger: true }] : []),
                              { label: 'Подробнее', onClick: () => setOpenId(d.id) },
                            ]}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <InfoLine style={{ marginTop: 14 }}>Файлы из документов компании используются повторно, загружать их заново не нужно.</InfoLine>
        </section>

        {optional.map((r) => (
          <Accordion
            key={r.code}
            icon={DocumentMIcon}
            title={
              <span className={s.titleRow}>
                {r.title} <Pill small>Можно добавить позже</Pill>
              </span>
            }
            subtitle='Сейчас не требуется для продолжения рассмотрения'
            right={
              <Btn variant='outline' size='l' disabled={!canUpload} onClick={() => setUpload({ type: r.action?.document_type ?? undefined, title: r.title })}>
                Добавить
              </Btn>
            }
          >
            <div className={s.muted}>{r.note}</div>
          </Accordion>
        ))}

        <Accordion icon={ClockLineMIcon} title='История загрузок'>
          <Stack gap={8}>
            {[...list]
              .sort((a, b) => b.uploaded_at.localeCompare(a.uploaded_at))
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

        <div className={s.footer}>
          <span className={s.muted}>Документы доступны сотрудникам с соответствующими правами.</span>
          <Btn variant='outline' size='l' onClick={() => navigate(`/applications/${app.id}`)}>
            Вернуться к заявке
          </Btn>
        </div>
      </Stack>

      {openId && <DocumentPanel id={openId} onClose={() => setOpenId(null)} />}
      {upload && <UploadDialog open title={upload.title} documentType={upload.type} applicationId={app.id} onClose={() => setUpload(null)} onUploaded={refresh} />}
      {pick && <PickCompanyDocument app={app} onClose={() => setPick(false)} onPicked={refresh} />}
    </div>
  );
}

export function PickCompanyDocument({
  app,
  onClose,
  onPicked,
  type,
}: {
  app: ApplicationDetail;
  onClose: () => void;
  onPicked: (docId: string) => void;
  type?: string;
}) {
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
        <div className={s.muted}>Подходящих документов нет. Загрузите новый файл.</div>
      ) : (
        <Stack gap={8}>
          {list.map((d) => (
            <div key={d.id} className={s.pickRow}>
              <PdfIcon name={d.file_name} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className={kit.cellTitle}>{d.title}</div>
                <div className={kit.cellSub}>
                  {d.file_name} · {formatShortDateTime(d.uploaded_at)}
                </div>
              </div>
              <Btn variant='outline' size='m' loading={pick.isPending && pick.variables === d.id} onClick={() => pick.mutate(d.id)}>
                Выбрать
              </Btn>
            </div>
          ))}
          {error && <div style={{ color: 'var(--a-red)' }}>{error}</div>}
        </Stack>
      )}
    </Dialog>
  );
}
