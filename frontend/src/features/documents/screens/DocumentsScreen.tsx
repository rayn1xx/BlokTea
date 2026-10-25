import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { DocumentMIcon } from '@alfalab/icons-glyph/DocumentMIcon';

import { useApplications } from '@/features/applications/hooks';
import { documentsApi } from '@/features/documents/api';
import { DocumentPanel } from '@/features/documents/components/DocumentPanel';
import { DocumentsTable } from '@/features/documents/components/DocumentsTable';
import { LastCheckCard } from '@/features/documents/components/LastCheckCard';
import { type DocumentWanted, MissingDocuments } from '@/features/documents/components/MissingDocuments';
import { UploadDialog } from '@/features/documents/components/UploadDialog';
import { UploadHistory } from '@/features/documents/components/UploadHistory';
import { useCurrentHome } from '@/features/profile/components/AppShell/AppShell';
import { tasksApi } from '@/features/tasks/api';
import { useTasks } from '@/features/tasks/hooks';
import { AssignDialog } from '@/features/team/components/AssignDialog';
import { queryClient } from '@/shared/api/query';
import { keys } from '@/shared/api/queryKeys';
import { appNo, norm } from '@/shared/lib/format';
import { Btn, EmptyState, ErrorState, IconCircle, InfoLine, ListItem, PageHead, SearchField, SkeletonLines, Split, Stack, Tabs, Text } from '@/shared/ui';

import s from './DocumentsScreen.module.css';

type TabId = 'company' | 'application' | 'requests';

export function DocumentsScreen() {
  const navigate = useNavigate();
  const home = useCurrentHome();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as TabId) ?? 'company';
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [upload, setUpload] = useState<null | (Partial<DocumentWanted> & { title: string })>(null);
  const [askFor, setAskFor] = useState<DocumentWanted | null>(null);
  const canUpload = home.permissions.includes('upload_documents');

  const wantedType = params.get('type');
  const wantedApp = params.get('application_id');
  useEffect(() => {
    if (!wantedType || !canUpload) return;
    setUpload({ type: wantedType, title: 'Загрузить документ', applicationId: wantedApp ?? undefined });
    setParams({}, { replace: true });
  }, [wantedType, wantedApp, canUpload, setParams]);

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

  const q = norm(query.trim());
  const list = (docs.data ?? []).filter((d) => !q || norm(`${d.title} ${d.file_name}`).includes(q));
  const lastChecked = [...(allDocs.data ?? [])].filter((d) => d.analysis && d.origin === 'upload').sort((a, b) => b.uploaded_at.localeCompare(a.uploaded_at))[0];

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
      <div className={s.body}>
        <Split
          asideWidth={320}
          aside={
            <Stack gap={14}>
              <MissingDocuments items={missing.data?.items} requests={requests} canUpload={canUpload} onUpload={setUpload} onAsk={setAskFor} />
              {lastChecked && <LastCheckCard doc={lastChecked} onOpen={() => setOpenId(lastChecked.id)} />}
            </Stack>
          }
        >
          <Stack gap={14}>
            {tab === 'requests' ? (
              requests.length === 0 ? (
                <EmptyState title='Открытых запросов нет' text='Когда банку понадобятся документы, запрос появится здесь' />
              ) : (
                requests.map((t) => (
                  <ListItem
                    key={t.id}
                    bordered
                    leading={<IconCircle icon={DocumentMIcon} />}
                    title={t.title}
                    sub={[t.application ? `Заявка ${appNo(t.application.number)}` : null, t.waiting_for_text].filter(Boolean).join(' · ')}
                    right={
                      <Btn variant='outlineRed' size='m' onClick={() => navigate(t.cta.route)}>
                        {t.cta.label}
                      </Btn>
                    }
                  />
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
                  <DocumentsTable docs={list} appNumber={appNumber} onOpen={setOpenId} />
                )}
                <InfoLine>Подходящие документы можно использовать в нескольких заявках.</InfoLine>
              </>
            )}
            <UploadHistory docs={allDocs.data ?? []} limit={10} />
            <Text small secondary>
              Доступ к файлам зависит от прав сотрудника.
            </Text>
          </Stack>
        </Split>
      </div>

      {openId && <DocumentPanel id={openId} onClose={() => setOpenId(null)} />}
      {askFor && (
        <AssignDialog
          title='Запросить документ у сотрудника'
          taskTitle={askFor.title}
          taskSubtitle='Сотруднику придёт задача и уведомление'
          permission='upload_documents'
          excludeUserId={home.id}
          onClose={() => setAskFor(null)}
          onAssign={async (member, comment) => {
            await tasksApi.requestDocument({ member_id: member.id, document_type: askFor.type, application_id: askFor.applicationId, comment });
            void queryClient.invalidateQueries({ queryKey: ['tasks'] });
          }}
        />
      )}
      {upload && (
        <UploadDialog
          open
          title={upload.title}
          documentType={upload.type}
          applicationId={upload.applicationId}
          onClose={() => setUpload(null)}
          onUploaded={(id) => {
            void queryClient.invalidateQueries({ queryKey: ['documents'] });
            setOpenId(id);
          }}
        />
      )}
    </div>
  );
}
