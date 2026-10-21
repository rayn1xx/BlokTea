import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@alfalab/core-components/button';
import { Typography } from '@alfalab/core-components/typography';

import { applicationsApi } from '@/features/applications/api';
import type { ApplicationDetail, Decision } from '@/features/applications/types';
import { matchingApi } from '@/features/matching/api';
import { isApiError } from '@/shared/api/client';
import { errorText, invalidateApplication } from '@/shared/api/query';
import { ERRORS, TEXTS } from '@/shared/i18n/ru';
import { formatDate, formatDateTime, formatMoney, formatPercent } from '@/shared/lib/format';
import { AiBadge, Card, CardTitle, Dialog, InfoRow, InfoRows, Note, Row, Stack, Text, ToneLabel, uiStyles as s } from '@/shared/ui';

import styles from '../card.module.css';

export function DecisionView({ app, decision }: { app: ApplicationDetail; decision: Decision }) {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [declineOpen, setDeclineOpen] = useState(false);
  const canAccept = app.available_actions.includes('offer.accept');
  const isActual = app.status === 'approved' || app.status === 'counter_offer';

  const accept = useMutation({
    mutationFn: () => applicationsApi.acceptOffer(app.id),
    onSuccess: () => {
      invalidateApplication(app.id);
      navigate(`/applications/${app.id}/signing`);
    },
    onError: (e) => setError(isApiError(e, 'OFFER_EXPIRED') ? ERRORS.offerExpired : errorText(e)),
  });

  const decline = useMutation({
    mutationFn: async () => {
      await applicationsApi.declineOffer(app.id);
      const session = await matchingApi.create();
      await matchingApi.patch(session.id, {
        need: {
          purpose: app.purpose_code,
          amount: app.requested_amount,
          term_months: app.requested_term_months,
          need_type: 'one_time',
          disbursement: 'lump_sum',
          urgency: 'week',
        },
        finance_confirmed: true,
      });
      await matchingApi.patch(session.id, { step: 2 });
      await matchingApi.patch(session.id, { step: 3 });
      await matchingApi.patch(session.id, { extra: { skipped: true }, step: 4 });
      return session.id;
    },
    onSuccess: (sessionId) => {
      invalidateApplication(app.id);
      navigate(`/match/${sessionId}/step/4`);
    },
    onError: (e) => setError(errorText(e)),
  });

  const negative = decision.factors.filter((f) => f.impact === 'negative');
  const positive = decision.factors.filter((f) => f.impact === 'positive');

  return (
    <Stack gap={16}>
      <Card>
        <Stack gap={16}>
          <Row justify='space-between'>
            <Typography.Title tag='h2' view='small' weight='bold'>
              {decision.type === 'approved' ? 'Заявка одобрена' : decision.type === 'counter_offer' ? 'Банк готов выдать кредит на других условиях' : 'Сейчас не можем выдать кредит'}
            </Typography.Title>
            <AiBadge source={decision.text_source} />
          </Row>
          <Text>{decision.explanation_text}</Text>
          <Text small secondary>
            {decision.decided_by === 'auto' ? 'Решение принято автоматически' : 'Решение принял кредитный аналитик'} · {formatDateTime(decision.decided_at)}
          </Text>
        </Stack>
      </Card>

      {decision.type === 'counter_offer' && decision.offered && (
        <div className={s.grid2}>
          <Card>
            <CardTitle>Вы просили</CardTitle>
            <InfoRows>
              <InfoRow label='Сумма'>{formatMoney(decision.requested.amount)}</InfoRow>
              <InfoRow label='Срок'>{decision.requested.term_months} мес.</InfoRow>
            </InfoRows>
          </Card>
          <Card className={styles.offerCard}>
            <CardTitle>Банк предлагает</CardTitle>
            <InfoRows>
              <InfoRow label='Сумма'>
                <Diff changed={decision.offered.amount.value !== decision.requested.amount.value}>{formatMoney(decision.offered.amount)}</Diff>
              </InfoRow>
              <InfoRow label='Срок'>
                <Diff changed={decision.offered.term_months !== decision.requested.term_months}>{decision.offered.term_months} мес.</Diff>
              </InfoRow>
              <InfoRow label='Платёж в месяц'>{formatMoney(decision.offered.monthly_payment)}</InfoRow>
              <InfoRow label='Переплата'>{formatMoney(decision.offered.overpayment)}</InfoRow>
              <InfoRow label='Ставка'>{formatPercent(decision.offered.rate_percent)}</InfoRow>
              <InfoRow label='Продукт'>{decision.offered.product.name}</InfoRow>
            </InfoRows>
          </Card>
        </div>
      )}

      {decision.type === 'approved' && decision.offered && (
        <Card>
          <CardTitle>Условия</CardTitle>
          <InfoRows>
            <InfoRow label='Сумма'>{formatMoney(decision.offered.amount)}</InfoRow>
            <InfoRow label='Срок'>{decision.offered.term_months} мес.</InfoRow>
            <InfoRow label='Платёж в месяц'>{formatMoney(decision.offered.monthly_payment)}</InfoRow>
            <InfoRow label='Переплата'>{formatMoney(decision.offered.overpayment)}</InfoRow>
            <InfoRow label='Ставка'>{formatPercent(decision.offered.rate_percent)}</InfoRow>
            {decision.offer_valid_until && <InfoRow label='Предложение действует'>до {formatDate(decision.offer_valid_until)}</InfoRow>}
          </InfoRows>
        </Card>
      )}

      {decision.type !== 'approved' && (
        <div className={s.grid2}>
          <Card>
            <CardTitle>Что повлияло</CardTitle>
            <Stack gap={12}>
              {(negative.length ? negative : decision.factors).map((f) => (
                <div key={f.code}>
                  <ToneLabel tone={f.impact === 'negative' ? 'negative' : f.impact === 'positive' ? 'positive' : 'neutral'} small>
                    {f.title}
                  </ToneLabel>
                  <Text small secondary tag='div'>
                    {f.text}
                  </Text>
                </div>
              ))}
              {positive.length > 0 && negative.length > 0 && (
                <Text small secondary>
                  В вашу пользу: {positive.map((f) => f.title.toLowerCase()).join(', ')}
                </Text>
              )}
            </Stack>
          </Card>
          {decision.improve_tips.length > 0 && (
            <Card>
              <CardTitle>Что можно сделать</CardTitle>
              <Stack gap={8}>
                {decision.improve_tips.map((t) => (
                  <Text key={t}>• {t}</Text>
                ))}
              </Stack>
            </Card>
          )}
        </div>
      )}

      {error && <Note tone='negative'>{error}</Note>}

      {isActual && decision.type !== 'rejected' &&
        (canAccept ? (
          <Row gap={12}>
            <Button view='primary' size={56} onClick={() => accept.mutate()} loading={accept.isPending}>
              {decision.type === 'approved' ? 'К подписанию' : 'Принять'}
            </Button>
            {decision.type === 'counter_offer' && (
              <Button view='secondary' size={56} onClick={() => setDeclineOpen(true)}>
                Отказаться
              </Button>
            )}
          </Row>
        ) : (
          <Note tone='info'>{TEXTS.ownerDecides}</Note>
        ))}

      {decision.type === 'rejected' && (
        <Row gap={12}>
          <Button view='primary' size={56} onClick={() => navigate('/readiness')}>
            Что улучшить
          </Button>
          <Button view='secondary' size={56} onClick={() => navigate('/products')}>
            Другие варианты
          </Button>
        </Row>
      )}

      <Dialog
        open={declineOpen}
        onClose={() => setDeclineOpen(false)}
        title='Отказаться от предложения?'
        footer={
          <>
            <Button view='primary' size={48} onClick={() => decline.mutate()} loading={decline.isPending}>
              Отказаться и подобрать заново
            </Button>
            <Button view='secondary' size={48} onClick={() => setDeclineOpen(false)}>
              Вернуться
            </Button>
          </>
        }
      >
        <Text secondary>Заявка закроется. Мы сразу подберём другие варианты по вашим прошлым ответам</Text>
      </Dialog>
    </Stack>
  );
}

function Diff({ changed, children }: { changed: boolean; children: React.ReactNode }) {
  return <span className={changed ? styles.diff : undefined}>{children}</span>;
}
