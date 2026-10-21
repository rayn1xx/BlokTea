import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@alfalab/core-components/button';
import { Typography } from '@alfalab/core-components/typography';

import { useReadiness } from '@/features/company/hooks';
import type { ReadinessItem } from '@/features/company/types';
import { UploadDialog } from '@/features/documents/components/UploadDialog';
import { READINESS_STATUS } from '@/shared/i18n/ru';
import { formatDateTime } from '@/shared/lib/format';
import { AiBadge, Card, Note, PageHeader, Progress, QueryGate, Row, Stack, Text, ToneLabel, uiStyles as s } from '@/shared/ui';

export function ReadinessScreen() {
  const navigate = useNavigate();
  const readiness = useReadiness();
  const [upload, setUpload] = useState<ReadinessItem | null>(null);

  return (
    <div>
      <PageHeader title='Готовность к кредиту' subtitle='Покажем, что банк увидит в ваших данных и что можно улучшить до подачи заявки' />
      <QueryGate query={readiness}>
        {(r) => (
          <Stack gap={16}>
            <Card>
              <Stack gap={12}>
                <Row justify='space-between' gap={12}>
                  <Typography.Title tag='h2' view='small' weight='bold'>
                    {r.ok_count} из {r.total} в порядке
                  </Typography.Title>
                  <ToneLabel tone={r.level === 'high' ? 'positive' : r.level === 'medium' ? 'attention' : 'negative'}>
                    {r.level === 'high' ? 'Высокая готовность' : r.level === 'medium' ? 'Средняя готовность' : 'Низкая готовность'}
                  </ToneLabel>
                </Row>
                <Progress value={(r.ok_count / r.total) * 100} tone={r.level === 'high' ? 'positive' : r.level === 'medium' ? 'attention' : 'negative'} />
                <Text>{r.summary_text}</Text>
                <AiBadge source={r.text_source} />
              </Stack>
            </Card>

            <div className={s.grid2}>
              {r.items.map((i) => (
                <Card key={i.code} compact>
                  <Stack gap={8}>
                    <Row justify='space-between' gap={8}>
                      <ToneLabel tone={READINESS_STATUS[i.status].tone}>{i.title}</ToneLabel>
                      <Text medium>{i.value_text}</Text>
                    </Row>
                    <Text small secondary>
                      {i.explanation}
                    </Text>
                    {i.how_to_improve && <Note tone='attention'>{i.how_to_improve}</Note>}
                    {i.action && i.action.type !== 'none' && (
                      <div>
                        <Button
                          view='secondary'
                          size={32}
                          onClick={() => (i.action!.type === 'upload_document' ? setUpload(i) : i.action!.route && navigate(i.action!.route))}
                        >
                          {i.action.type === 'upload_document' ? 'Загрузить' : 'Заполнить'}
                        </Button>
                      </div>
                    )}
                  </Stack>
                </Card>
              ))}
            </div>

            <Note tone='neutral'>
              {r.disclaimer}. Рассчитано {formatDateTime(r.calculated_at)}
            </Note>
          </Stack>
        )}
      </QueryGate>
      {upload && (
        <UploadDialog open title={upload.title} documentType={upload.action?.document_type ?? undefined} onClose={() => setUpload(null)} onUploaded={() => readiness.refetch()} />
      )}
    </div>
  );
}
