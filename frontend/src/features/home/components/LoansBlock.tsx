import { useNavigate } from 'react-router-dom';
import { Typography } from '@alfalab/core-components/typography';

import { useLoans } from '@/features/loans/hooks';
import { PRODUCT_ICONS } from '@/features/products/productIcons';
import { formatDayMonth, formatMoney } from '@/shared/lib/format';
import { Card, CardTitle, EmptyState, ErrorState, Progress, Row, SmallTag, Text, uiStyles as s } from '@/shared/ui';

import styles from '../home.module.css';

export function LoansBlock({ readOnly }: { readOnly?: boolean }) {
  const navigate = useNavigate();
  const loans = useLoans();
  if (loans.isLoading) return null;
  if (loans.isError) {
    return (
      <Card>
        <CardTitle>Мои кредиты</CardTitle>
        <ErrorState error={loans.error} onRetry={() => loans.refetch()} />
      </Card>
    );
  }
  const list = loans.data ?? [];
  return (
    <section>
      <Typography.Title tag='h2' view='small' className={s.pageTitle}>
        Мои кредиты
      </Typography.Title>
      {list.length === 0 ? (
        <Card style={{ marginTop: 16 }}>
          <EmptyState title='Действующих кредитов нет' text='Выданные кредиты появятся здесь вместе с графиком платежей' />
        </Card>
      ) : (
        <div className={s.grid3} style={{ marginTop: 16 }}>
          {list.map((loan) => {
            const Icon = PRODUCT_ICONS[loan.product.code];
            const paid = 100 - Math.round((loan.balance.value / loan.amount.value) * 100);
            return (
              <button key={loan.id} type='button' className={styles.loan} onClick={() => navigate(`/loans/${loan.id}`)}>
                <Row gap={12} justify='space-between' style={{ width: '100%' }}>
                  <span className={styles.quickIcon}>
                    <Icon />
                  </span>
                  {loan.source === 'alfa_lk' && <SmallTag tone='positive'>из ЛК</SmallTag>}
                </Row>
                <Text medium tag='div'>
                  {loan.product.name}
                </Text>
                <Text small secondary tag='div'>
                  {formatMoney(loan.amount)}, ставка {loan.rate_percent}%
                </Text>
                <div style={{ width: '100%' }}>
                  <Progress value={paid} />
                </div>
                <Row justify='space-between' style={{ width: '100%' }}>
                  <Text small secondary>
                    Осталось {formatMoney(loan.balance)}
                  </Text>
                  {loan.next_payment && (
                    <Text small medium>
                      {formatMoney(loan.next_payment.amount)} · {formatDayMonth(loan.next_payment.date)}
                    </Text>
                  )}
                </Row>
              </button>
            );
          })}
        </div>
      )}
      {readOnly && (
        <Text small secondary tag='p' className={s.pageSubtitle}>
          Только просмотр
        </Text>
      )}
    </section>
  );
}
