import { useQuery } from '@tanstack/react-query';
import { Typography } from '@alfalab/core-components/typography';

import { bankApi } from '@/features/bank/api';
import { keys } from '@/shared/api/queryKeys';
import { STATUS, TEXTS } from '@/shared/i18n/ru';
import { formatMinutes } from '@/shared/lib/format';
import type { ApplicationStatus } from '@/shared/types/common';
import { Bar, Card, Grid, PageHead, QueryGate, Row, Stack, Text } from '@/shared/ui';

export function BankDashboardScreen() {
  const dashboard = useQuery({ queryKey: keys.bankDashboard, queryFn: bankApi.dashboard });
  return (
    <div>
      <PageHead title='Показатели' subtitle={`За 7 дней · ${TEXTS.demoData.toLowerCase()}`} />
      <QueryGate query={dashboard}>
        {(d) => {
          const inReview = d.by_status.submitted + d.by_status.in_review + d.by_status.info_requested;
          const total = Object.values(d.by_status).reduce((a, b) => a + b, 0) || 1;
          return (
            <Stack gap={16}>
              <Grid>
                <Tile title='На рассмотрении' value={String(inReview)} />
                <Tile title='Среднее время до решения' value={formatMinutes(d.avg_decision_minutes)} />
                <Tile title='Доля авторешений' value={`${Math.round(d.auto_decision_share * 100)}%`} />
                <Tile title='Доля запросов данных' value={`${Math.round(d.info_request_share * 100)}%`} />
              </Grid>
              <Card title='Заявки по статусам'>
                <Stack gap={12}>
                  {(Object.keys(d.by_status) as ApplicationStatus[]).map((st) => (
                    <Stack key={st} gap={4}>
                      <Row justify='space-between'>
                        <Text small>{STATUS[st].label}</Text>
                        <Text small medium>
                          {d.by_status[st]}
                        </Text>
                      </Row>
                      <Bar value={(d.by_status[st] / total) * 100} tone='green' />
                    </Stack>
                  ))}
                </Stack>
              </Card>
              <Text small secondary>
                {TEXTS.demoData}
              </Text>
            </Stack>
          );
        }}
      </QueryGate>
    </div>
  );
}

function Tile({ title, value }: { title: string; value: string }) {
  return (
    <Card compact>
      <Text small secondary tag='div'>
        {title}
      </Text>
      <Typography.Title tag='div' view='medium' weight='bold'>
        {value}
      </Typography.Title>
    </Card>
  );
}
