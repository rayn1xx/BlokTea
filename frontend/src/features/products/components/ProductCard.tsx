import { Button } from '@alfalab/core-components/button';
import { Typography } from '@alfalab/core-components/typography';

import { PRODUCT_ICONS } from '@/features/products/productIcons';
import type { Product } from '@/features/products/types';
import { formatMoney, formatMonths, formatPercent } from '@/shared/lib/format';
import { Card, InfoRow, InfoRows, Row, SmallTag, Stack, Text, uiStyles as s } from '@/shared/ui';

import styles from '../products.module.css';

export const COLLATERAL_TEXT = { none: 'Без залога', optional: 'Залог по желанию', required: 'Нужен залог' };

export function ProductCard({ product: p, onOpen }: { product: Product; onOpen: () => void }) {
  const Icon = PRODUCT_ICONS[p.code];
  return (
    <Card className={styles.card}>
      <Stack gap={14} style={{ height: '100%' }}>
        <Row justify='space-between'>
          <span className={styles.icon}>
            <Icon />
          </span>
          {p.is_fictional && <SmallTag>вымышленный</SmallTag>}
        </Row>
        <div>
          <Typography.Title tag='h2' view='xsmall' weight='bold'>
            {p.name}
          </Typography.Title>
          <Text small secondary tag='p' className={s.pageSubtitle}>
            {p.description}
          </Text>
        </div>
        <InfoRows>
          <InfoRow label='Сумма'>
            {formatMoney(p.amount_min)} - {formatMoney(p.amount_max)}
          </InfoRow>
          <InfoRow label='Срок'>
            {p.term_min_months === p.term_max_months ? formatMonths(p.term_max_months) : `${p.term_min_months}-${p.term_max_months} мес.`}
          </InfoRow>
          <InfoRow label='Ставка'>от {formatPercent(p.rate_from_percent)}</InfoRow>
          <InfoRow label='Требования'>
            {COLLATERAL_TEXT[p.collateral]}, бизнесу от {formatMonths(p.min_business_age_months)}
          </InfoRow>
        </InfoRows>
        <div style={{ marginTop: 'auto' }}>
          <Row gap={8}>
            <Button view='primary' size={40} onClick={onOpen}>
              Оформить
            </Button>
            <Button view='transparent' size={40} onClick={onOpen}>
              Подробнее
            </Button>
          </Row>
        </div>
      </Stack>
    </Card>
  );
}
