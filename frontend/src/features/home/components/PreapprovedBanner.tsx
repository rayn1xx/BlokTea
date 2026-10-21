import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@alfalab/core-components/button';
import { Typography } from '@alfalab/core-components/typography';

import { applicationsApi } from '@/features/applications/api';
import { usePreapproved } from '@/features/products/hooks';
import { errorText, invalidateApplication } from '@/shared/api/query';
import { formatDayMonth, formatMoney } from '@/shared/lib/format';
import { Row, SmallTag, Text } from '@/shared/ui';

import styles from '../home.module.css';

export function PreapprovedBanner() {
  const navigate = useNavigate();
  const offer = usePreapproved();
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () => applicationsApi.create({ source: 'preapproved', offer_id: offer.data!.offer_id }),
    onSuccess: (app) => {
      invalidateApplication(app.id);
      navigate(`/applications/${app.id}/edit`);
    },
    onError: (e) => setError(errorText(e)),
  });

  if (!offer.data) return null;
  const o = offer.data;

  return (
    <div className={styles.offer}>
      <div className={styles.offerText}>
        <Row gap={8}>
          <SmallTag tone='positive'>из ЛК</SmallTag>
          <Text small className={styles.offerMuted}>
            Предодобрено до {formatDayMonth(o.valid_until)}
          </Text>
        </Row>
        <Typography.Title tag='h2' view='small' className={styles.offerTitle}>
          Вам доступно до {formatMoney(o.limit)}
        </Typography.Title>
        <Text className={styles.offerMuted}>
          {o.product.name} на {o.term_months} мес.{o.conditions_fixed ? ', условия зафиксированы' : ''}
        </Text>
        {error && <Text color='negative'>{error}</Text>}
      </div>
      <Button view='primary' size={56} onClick={() => create.mutate()} loading={create.isPending} className={styles.offerButton}>
        Оформить
      </Button>
    </div>
  );
}
