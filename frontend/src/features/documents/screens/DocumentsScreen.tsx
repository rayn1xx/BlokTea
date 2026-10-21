import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@alfalab/core-components/button';
import { Tab, Tabs } from '@alfalab/core-components/tabs';

import { documentsApi } from '@/features/documents/api';
import { DocumentPanel } from '@/features/documents/components/DocumentPanel';
import { UploadDialog } from '@/features/documents/components/UploadDialog';
import { useCurrentHome } from '@/features/profile/components/AppShell/AppShell';
import { useTasks } from '@/features/tasks/hooks';
import { queryClient } from '@/shared/api/query';
import { keys } from '@/shared/api/queryKeys';
import { DOCUMENT_STATUS } from '@/shared/i18n/ru';
import { formatFileSize, formatRelative } from '@/shared/lib/format';
import { AiBadge, Card, CardTitle, EmptyState, ErrorState, LoadingState, PageHeader, Row, SmallTag, Stack, Text, ToneLabel, uiStyles as s } from '@/shared/ui';

type TabId = 'company' | 'application' | 'requests';

export function DocumentsScreen() {
  const navigate = useNavigate();
  const home = useCurrentHome();
  const [params, setParams] = useSearchParams();
  const applicationId = params.get('application_id') ?? undefined;
  const [tab, setTab] = useState<TabId>(applicationId ? 'application' : 'company');
  const [openId, setOpenId] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadType, setUploadType] = useState<string | undefined>();
  const canUpload = home.permissions.includes('upload_documents');

  const listParams = tab === 'requests' ? null : { scope: tab, application_id: tab === 'application' ? applicationId : undefined };
  const docs = useQuery({
    queryKey: keys.documents(listParams ?? {}),
    queryFn: () => documentsApi.list(listParams!),
    enabled: !!listParams,

    refetchInterval: (q) => (q.state.data?.some((d) => d.status === 'analyzing') ? 2000 : false),
  });
  const missing = useQuery({ queryKey: keys.missingDocs, queryFn: documentsApi.missing });
  const tasks = useTasks('all');
  const requests = (tasks.data ?? []).filter((t) => t.type === 'info_request');

  return (
    <div>
      <PageHeader
        title='Документы'
        subtitle='Все документы компании и заявок в одном месте. ИИ проверяет каждый загруженный файл'
        right={
          canUpload ? (
            <Button
              view='primary'
              size={48}
              onClick={() => {
                setUploadType(undefined);
                setUploadOpen(true);
              }}
            >
              Загрузить документ
            </Button>
          ) : undefined
        }
      />

      <Stack gap={16}>
        {missing.data && missing.data.items.length > 0 && (
          <Card>
            <CardTitle>Чего не хватает</CardTitle>
            <Stack gap={10}>
              {missing.data.items.map((m) => (
                <Row key={`${m.document_type}-${m.application_id}`} justify='space-between' gap={12}>
                  <div>
                    <Text medium tag='div'>
                      {m.title}
                    </Text>
                    <Text small secondary tag='div'>
                      {m.reason}
                    </Text>
                  </div>
                  <Button
                    view='secondary'
                    size={32}
                    disabled={!canUpload}
                    onClick={() => {
                      setUploadType(m.document_type);
                      setUploadOpen(true);
                    }}
                  >
                    Загрузить
                  </Button>
                </Row>
              ))}
            </Stack>
          </Card>
        )}

        <Tabs
          view='primary'
          size='s'
          selectedId={tab}
          onChange={(_, { selectedId }) => {
            setTab(selectedId as TabId);
            if (selectedId !== 'application' && applicationId) setParams({});
          }}
        >
          <Tab id='company' title='Документы компании' />
          <Tab id='application' title='По заявкам' />
          <Tab id='requests' title={`Запросы банка · ${requests.length}`} />
        </Tabs>

        {applicationId && tab === 'application' && (
          <Row gap={8}>
            <SmallTag tone='info'>Фильтр: одна заявка</SmallTag>
            <Button view='transparent' size={32} onClick={() => setParams({})}>
              Показать все
            </Button>
          </Row>
        )}

        {tab === 'requests' ? (
          <Card>
            {requests.length === 0 ? (
              <EmptyState title='Открытых запросов нет' text='Когда банку понадобятся документы, запрос появится здесь' />
            ) : (
              <Stack gap={12}>
                {requests.map((t) => (
                  <Row key={t.id} justify='space-between' gap={12}>
                    <div>
                      <Text medium tag='div'>
                        {t.title}
                      </Text>
                      <Text small secondary tag='div'>
                        {t.application ? `Заявка ${t.application.number}` : ''}
                        {t.waiting_for_text ? ` · ${t.waiting_for_text}` : ''}
                      </Text>
                    </div>
                    <Button view='primary' size={32} onClick={() => navigate(t.cta.route)}>
                      {t.cta.label}
                    </Button>
                  </Row>
                ))}
              </Stack>
            )}
          </Card>
        ) : docs.isLoading ? (
          <LoadingState cards={1} />
        ) : docs.isError ? (
          <Card>
            <ErrorState error={docs.error} onRetry={() => docs.refetch()} />
          </Card>
        ) : !docs.data?.length ? (
          <Card>
            <EmptyState title='Документов пока нет' text='Загрузите документ: тип можно не выбирать, его определит ИИ' />
          </Card>
        ) : (
          <Card style={{ padding: '8px 16px' }}>
            <div className={s.tableScroll}>
              <table className={`${s.table} ${s.tableClickable}`}>
                <thead>
                  <tr>
                    <th>Документ</th>
                    <th>Кто загрузил</th>
                    <th>Статус</th>
                    <th>Версия</th>
                    <th>ИИ-проверка</th>
                  </tr>
                </thead>
                <tbody>
                  {docs.data.map((d) => (
                    <tr key={d.id} onClick={() => setOpenId(d.id)}>
                      <td>
                        <Text small medium tag='div'>
                          {d.title}
                        </Text>
                        <Text small secondary tag='div'>
                          {d.file_name} · {formatFileSize(d.size_bytes)}
                        </Text>
                      </td>
                      <td>
                        <Text small tag='div'>
                          {d.origin === 'alfa_lk' ? 'Из Альфа-Бизнеса' : d.uploaded_by.name}
                        </Text>
                        <Text small secondary tag='div'>
                          {formatRelative(d.uploaded_at)}
                        </Text>
                      </td>
                      <td>
                        <ToneLabel tone={DOCUMENT_STATUS[d.status].tone} small>
                          {DOCUMENT_STATUS[d.status].label}
                        </ToneLabel>
                        {d.status_reason && (
                          <Text small secondary tag='div'>
                            {d.status_reason}
                          </Text>
                        )}
                      </td>
                      <td>
                        <Text small>v{d.version}</Text>
                      </td>
                      <td>
                        {d.analysis?.status === 'done' ? (
                          <AiBadge source={d.analysis.text_source} hint={false} />
                        ) : d.status === 'analyzing' ? (
                          <Text small secondary>
                            проверяем…
                          </Text>
                        ) : d.analysis?.status === 'unavailable' ? (
                          <Text small secondary>
                            ручная проверка
                          </Text>
                        ) : (
                          <Text small secondary>
                            не нужна
                          </Text>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </Stack>

      {openId && <DocumentPanel id={openId} onClose={() => setOpenId(null)} />}

      <UploadDialog
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        title='Загрузить документ'
        documentType={uploadType}
        applicationId={tab === 'application' ? applicationId : undefined}
        onUploaded={(id) => {
          setOpenId(id);
          void queryClient.invalidateQueries({ queryKey: keys.missingDocs });
        }}
      />
    </div>
  );
}
