import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@alfalab/core-components/button';
import { Tab, Tabs } from '@alfalab/core-components/tabs';
import { Typography } from '@alfalab/core-components/typography';

import { CancelDialog } from '@/features/applications/components/CancelDialog';
import { DecisionView } from '@/features/applications/components/DecisionView';
import { StatusLabel } from '@/features/applications/components/StatusLabel';
import { Timeline } from '@/features/applications/components/Timeline';
import { useApplication } from '@/features/applications/hooks';
import type { ApplicationDetail } from '@/features/applications/types';
import { useLoans } from '@/features/loans/hooks';
import { useCurrentHome } from '@/features/profile/components/AppShell/AppShell';
import { STATUS } from '@/shared/i18n/ru';
import { formatDate, formatDateTime, formatMoney, formatPercent } from '@/shared/lib/format';
import { Card, CardTitle, InfoRow, InfoRows, PageHeader, QueryGate, Row, Stack, Text, uiStyles as s } from '@/shared/ui';

import styles from '../card.module.css';

export function ApplicationScreen() {
  const { id = '' } = useParams();
  const app = useApplication(id, true);
  return <QueryGate query={app}>{(data) => <ApplicationView app={data} />}</QueryGate>;
}

function ApplicationView({ app }: { app: ApplicationDetail }) {
  const navigate = useNavigate();
  const home = useCurrentHome();
  const loans = useLoans();
  const [tab, setTab] = useState<'progress' | 'decision'>('progress');
  const [cancelOpen, setCancelOpen] = useState(false);

  useEffect(() => {
    if (!app.decision) return;
    const key = `decision-seen-${app.id}-${app.decision.decided_at}`;
    try {
      if (!sessionStorage.getItem(key)) {
        sessionStorage.setItem(key, '1');
        setTab('decision');
      }
    } catch {
      setTab('decision');
    }
  }, [app.id, app.decision]);

  const openRequest = app.info_requests.find((r) => r.status === 'open');
  const loan = loans.data?.find((l) => l.application_id === app.id);
  const amount = app.approved_amount ?? app.requested_amount;
  const term = app.approved_term_months ?? app.requested_term_months;
  const actor =
    app.status_text.actor === 'client'
      ? app.awaiting_from
        ? app.awaiting_from.user_id === home.id
          ? 'Вы'
          : app.awaiting_from.name
        : 'Вы'
      : app.status_text.actor === 'bank'
        ? 'Банк'
        : 'Система';

  return (
    <div>
      <PageHeader
        title={`Заявка ${app.number}`}
        subtitle={
          <>
            {app.product.name} · {formatMoney(amount)} на {term} мес.
          </>
        }
        right={<StatusLabel status={app.status} />}
      />

      <Stack gap={16}>
        <Card>
          <Timeline status={app.status} events={app.timeline} />
        </Card>

        {app.decision && (
          <Tabs view='primary' size='s' selectedId={tab} onChange={(_, { selectedId }) => setTab(selectedId as 'progress' | 'decision')}>
            <Tab id='progress' title='Ход заявки' />
            <Tab id='decision' title='Решение' />
          </Tabs>
        )}

        {tab === 'decision' && app.decision ? (
          <DecisionView app={app} decision={app.decision} />
        ) : (
          <div className={s.mainAside}>
            <Stack gap={16}>
              <Card>
                <CardTitle>Что сейчас происходит</CardTitle>
                <Stack gap={16}>
                  <Typography.Text view='primary-large' weight='medium'>
                    {app.status_text.now || STATUS[app.status].now}
                  </Typography.Text>
                  <InfoRows>
                    <InfoRow label='Что дальше'>{app.status_text.next}</InfoRow>
                    <InfoRow label='Кто действует сейчас'>{actor}</InfoRow>
                    {app.status_text.due_at && <InfoRow label='Срок'>до {formatDateTime(app.status_text.due_at)}</InfoRow>}
                    {app.required_action && <InfoRow label='Что нужно сделать'>{app.required_action}</InfoRow>}
                  </InfoRows>
                  <Row gap={12}>
                    {app.status === 'draft' && app.available_actions.includes('application.edit') && (
                      <Button view='primary' size={48} onClick={() => navigate(`/applications/${app.id}/edit`)}>
                        Продолжить заполнение
                      </Button>
                    )}
                    {openRequest && (
                      <Button view='primary' size={48} onClick={() => navigate(`/applications/${app.id}/info-requests/${openRequest.id}`)}>
                        Ответить на запрос
                      </Button>
                    )}
                    {(app.status === 'approved' || app.status === 'counter_offer') && (
                      <Button view='primary' size={48} onClick={() => setTab('decision')}>
                        Посмотреть решение
                      </Button>
                    )}
                    {(app.status === 'signing' || app.status === 'issued') && (
                      <Button view={app.status === 'signing' ? 'primary' : 'secondary'} size={48} onClick={() => navigate(`/applications/${app.id}/signing`)}>
                        {app.status === 'signing' ? 'К подписанию' : 'Подписанные документы'}
                      </Button>
                    )}
                    {loan && (
                      <Button view='primary' size={48} onClick={() => navigate(`/loans/${loan.id}`)}>
                        Кредит и график
                      </Button>
                    )}
                  </Row>
                </Stack>
              </Card>

              <Card>
                <CardTitle>История</CardTitle>
                <ul className={styles.history}>
                  {[...app.timeline].reverse().map((e, i) => (
                    <li key={`${e.at}-${i}`} className={styles.historyItem}>
                      <Text small secondary tag='div'>
                        {formatDateTime(e.at)}
                      </Text>
                      <Text medium tag='div'>
                        {e.title}
                      </Text>
                      {e.description && (
                        <Text small secondary tag='div'>
                          {e.description}
                        </Text>
                      )}
                      <Text small secondary tag='div'>
                        {e.actor.type === 'bank' ? 'Банк' : e.actor.type === 'system' ? 'Система' : e.actor.name ?? 'Клиент'}
                      </Text>
                    </li>
                  ))}
                </ul>
              </Card>
            </Stack>

            <Stack gap={16}>
              <Card>
                <CardTitle>Условия</CardTitle>
                <InfoRows>
                  <InfoRow label='Продукт'>{app.product.name}</InfoRow>
                  <InfoRow label='Сумма'>{formatMoney(app.requested_amount)}</InfoRow>
                  {app.approved_amount && app.approved_amount.value !== app.requested_amount.value && (
                    <InfoRow label='Одобрено'>{formatMoney(app.approved_amount)}</InfoRow>
                  )}
                  <InfoRow label='Срок'>{term} мес.</InfoRow>
                  <InfoRow label='Ставка'>{formatPercent(app.rate_percent)}, условная</InfoRow>
                  <InfoRow label='Платёж'>около {formatMoney(app.monthly_payment_estimate)}</InfoRow>
                  <InfoRow label='Цель'>{app.purpose}</InfoRow>
                  <InfoRow label='Создана'>{formatDate(app.created_at)}</InfoRow>
                </InfoRows>
              </Card>
              <Card compact>
                <Stack gap={8}>
                  <Button view='secondary' size={48} block onClick={() => navigate(`/documents?application_id=${app.id}`)}>
                    Документы заявки
                  </Button>
                  {app.available_actions.includes('application.cancel') && (
                    <Button view='transparent' size={48} block onClick={() => setCancelOpen(true)}>
                      Отозвать заявку
                    </Button>
                  )}
                </Stack>
              </Card>
            </Stack>
          </div>
        )}
      </Stack>

      <CancelDialog app={app} open={cancelOpen} onClose={() => setCancelOpen(false)} />
    </div>
  );
}
