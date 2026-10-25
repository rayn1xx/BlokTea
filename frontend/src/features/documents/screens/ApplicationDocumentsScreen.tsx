import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { DocumentMIcon } from '@alfalab/icons-glyph/DocumentMIcon';

import { useApplication, useApplications, useRequirements } from '@/features/applications/hooks';
import type { ApplicationDetail } from '@/features/applications/types';
import { documentsApi } from '@/features/documents/api';
import { ApplicationFilesTable } from '@/features/documents/components/ApplicationFilesTable';
import { DocumentPanel } from '@/features/documents/components/DocumentPanel';
import { PickCompanyDocument } from '@/features/documents/components/PickCompanyDocument';
import { UploadDialog } from '@/features/documents/components/UploadDialog';
import { UploadHistory } from '@/features/documents/components/UploadHistory';
import { useDocumentsForApplication } from '@/features/documents/hooks';
import { useCurrentHome } from '@/features/profile/components/AppShell/AppShell';
import { queryClient } from '@/shared/api/query';
import { keys } from '@/shared/api/queryKeys';
import { appNo, formatMoney, plural } from '@/shared/lib/format';
import { Accordion, Btn, Card, InfoLine, Note, PageHead, Pill, QueryGate, Row, SelectField, SkeletonLines, Stack, Text, TextLink } from '@/shared/ui';

import s from './ApplicationDocumentsScreen.module.css';

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
          <Row gap={20}>
            <div className={s.appSelect}>
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
          </Row>
        }
      />
      <Stack gap={16}>
        <Note tone={requiredDone ? 'positive' : 'attention'} title={requiredDone ? 'Обязательные документы добавлены' : 'Не все обязательные документы добавлены'}>
          {list.length} {plural(list.length, 'файл', 'файла', 'файлов')} · {openRequests ? `открытых запросов банка: ${openRequests}` : 'дополнительных запросов нет'}
        </Note>

        <Card
          title='Файлы'
          right={
            <Row gap={12}>
              <Btn variant='outline' size='l' disabled={!canUpload} onClick={() => setPick(true)}>
                Выбрать из документов компании
              </Btn>
              <Btn size='l' disabled={!canUpload} onClick={() => setUpload({ title: 'Загрузить файл' })}>
                Загрузить файл
              </Btn>
            </Row>
          }
        >
          {docs.isLoading ? (
            <SkeletonLines lines={3} />
          ) : (
            <ApplicationFilesTable docs={list} canUpload={canUpload} onOpen={setOpenId} onAnalyze={(id) => analyze.mutate(id)} onRemove={(id) => remove.mutate(id)} />
          )}
          <InfoLine spaced>Файлы из документов компании используются повторно, загружать их заново не нужно.</InfoLine>
        </Card>

        {optional.map((r) => (
          <Accordion
            key={r.code}
            icon={DocumentMIcon}
            title={
              <Row gap={10}>
                {r.title} <Pill small>Можно добавить позже</Pill>
              </Row>
            }
            subtitle='Сейчас не требуется для продолжения рассмотрения'
            right={
              <Btn variant='outline' size='l' disabled={!canUpload} onClick={() => setUpload({ type: r.action?.document_type ?? undefined, title: r.title })}>
                Добавить
              </Btn>
            }
          >
            <Text small secondary>
              {r.note}
            </Text>
          </Accordion>
        ))}

        <UploadHistory docs={list} />

        <div className={s.footer}>
          <Text small secondary>
            Документы доступны сотрудникам с соответствующими правами.
          </Text>
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
