import { Typography } from '@alfalab/core-components/typography';

import type { Recommendation } from '@/features/matching/types';
import { formatMoney, formatPercent } from '@/shared/lib/format';
import { Card, Progress, Row, SmallTag, Stack, Text, ToneLabel, uiStyles as s } from '@/shared/ui';

export function RecommendationCard({ rec, main }: { rec: Recommendation; main?: boolean }) {
  const loadTone = rec.load.load_percent <= rec.load.target_percent ? 'positive' : rec.load.load_percent <= rec.load.threshold_percent ? 'attention' : 'negative';
  const body = (
    <Stack gap={14}>
      <Row justify='space-between' gap={8}>
        <Row gap={8}>
          <Typography.Title tag='h3' view={main ? 'small' : 'xsmall'} weight='bold'>
            {rec.product.name}
          </Typography.Title>
          {rec.product.is_fictional && <SmallTag>вымышленный</SmallTag>}
        </Row>
        <ToneLabel tone={rec.fit === 'high' ? 'positive' : rec.fit === 'medium' ? 'attention' : 'negative'} small>
          {rec.fit_label}
        </ToneLabel>
      </Row>
      <div className={main ? s.grid3 : s.grid2}>
        <div className={s.metric}>
          <Text small secondary>
            Сумма
          </Text>
          <Text bold>{formatMoney(rec.amount)}</Text>
        </div>
        <div className={s.metric}>
          <Text small secondary>
            Срок
          </Text>
          <Text bold>{rec.term_months} мес.</Text>
        </div>
        <div className={s.metric}>
          <Text small secondary>
            Платёж в месяц
          </Text>
          <Text bold>{formatMoney(rec.monthly_payment)}</Text>
        </div>
        {main && (
          <>
            <div className={s.metric}>
              <Text small secondary>
                Ставка
              </Text>
              <Text>{formatPercent(rec.rate_percent)}, условная</Text>
            </div>
            <div className={s.metric}>
              <Text small secondary>
                Переплата
              </Text>
              <Text>{formatMoney(rec.overpayment)}</Text>
            </div>
          </>
        )}
      </div>
      <div>
        <Row justify='space-between'>
          <Text small secondary>
            Нагрузка на денежный поток
          </Text>
          <Text small medium>
            {formatPercent(rec.load.load_percent)} из {rec.load.threshold_percent}%
          </Text>
        </Row>
        <div style={{ marginTop: 6 }}>
          <Progress value={(rec.load.load_percent / 50) * 100} tone={loadTone} />
        </div>
      </div>
      {main && (
        <div className={s.chips}>
          {rec.reasons.map((r) => (
            <SmallTag key={r.code} tone='info'>
              {r.text}
            </SmallTag>
          ))}
        </div>
      )}
    </Stack>
  );
  return main ? <Card>{body}</Card> : body;
}
