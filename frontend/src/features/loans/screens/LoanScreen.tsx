import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@alfalab/core-components/button';
import { Typography } from '@alfalab/core-components/typography';
import { CheckmarkCircleMIcon } from '@alfalab/icons-glyph/CheckmarkCircleMIcon';

import { useLoan } from '@/features/loans/hooks';
import type { Loan } from '@/features/loans/types';
import { formatDate, formatMoney, formatPercent } from '@/shared/lib/format';
import { Card, CardTitle, InfoRow, InfoRows, PageHeader, QueryGate, SkeletonLines, Stack, Text, uiStyles as s } from '@/shared/ui';

import styles from '../../signing/signing.module.css';

export function LoanScreen() {
  const { id = '' } = useParams();
  const loan = useLoan(id);
  return <QueryGate query={loan}>{(data) => <LoanView loan={data} />}</QueryGate>;
}

function LoanView({ loan }: { loan: Loan }) {
  const navigate = useNavigate();
  const [full, setFull] = useState(false);
  const rows = full ? loan.schedule : loan.schedule.slice(0, 3);

  return (
    <div>
      <PageHeader
        title={loan.product.name}
        subtitle={loan.source === 'alfa_lk' ? 'Кредит из Альфа-Бизнеса' : 'Выдан по заявке в кабинете'}
        right={
          <Button view='secondary' size={40} onClick={() => navigate('/home')}>
            В кабинет
          </Button>
        }
      />
      <Stack gap={16}>
        {loan.source === 'system' && (
          <div className={styles.issued}>
            <CheckmarkCircleMIcon className={styles.issuedIcon} />
            <div>
              <Typography.Title tag='h2' view='small' weight='bold'>
                {formatMoney(loan.amount)} зачислены на ваш счёт
              </Typography.Title>
              <Text secondary>Счёт {loan.issued_to_account}. Выдача смоделирована, реальных операций нет</Text>
            </div>
          </div>
        )}

        <div className={s.grid3}>
          <Card compact>
            <Text small secondary tag='div'>
              Следующий платёж
            </Text>
            <Typography.Title tag='div' view='xsmall' weight='bold'>
              {loan.next_payment ? formatMoney(loan.next_payment.amount) : 'нет'}
            </Typography.Title>
            {loan.next_payment && (
              <Text small secondary tag='div'>
                {formatDate(loan.next_payment.date)}
              </Text>
            )}
          </Card>
          <Card compact>
            <Text small secondary tag='div'>
              Осталось погасить
            </Text>
            <Typography.Title tag='div' view='xsmall' weight='bold'>
              {formatMoney(loan.balance)}
            </Typography.Title>
            <Text small secondary tag='div'>
              из {formatMoney(loan.amount)}
            </Text>
          </Card>
          <Card compact>
            <Text small secondary tag='div'>
              Переплата за весь срок
            </Text>
            <Typography.Title tag='div' view='xsmall' weight='bold'>
              {formatMoney(loan.overpayment_total)}
            </Typography.Title>
            <Text small secondary tag='div'>
              ставка {formatPercent(loan.rate_percent)}, {loan.term_months} мес.
            </Text>
          </Card>
        </div>

        <Card>
          <CardTitle
            right={
              loan.schedule.length > 3 ? (
                <Button view='transparent' size={32} onClick={() => setFull((v) => !v)}>
                  {full ? 'Свернуть' : 'График платежей'}
                </Button>
              ) : undefined
            }
          >
            {full ? 'График платежей' : 'Ближайшие платежи'}
          </CardTitle>
          {loan.schedule.length === 0 ? (
            <SkeletonLines lines={3} />
          ) : (
            <div className={s.tableScroll}>
              <table className={s.table}>
                <thead>
                  <tr>
                    <th>№</th>
                    <th>Дата</th>
                    <th className={s.right}>Платёж</th>
                    <th className={s.right}>Основной долг</th>
                    <th className={s.right}>Проценты</th>
                    <th className={s.right}>Остаток</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.n}>
                      <td>{r.n}</td>
                      <td>{formatDate(r.date)}</td>
                      <td className={s.right}>
                        <b>{formatMoney(r.payment)}</b>
                      </td>
                      <td className={s.right}>{formatMoney(r.principal)}</td>
                      <td className={s.right}>{formatMoney(r.interest)}</td>
                      <td className={s.right}>{formatMoney(r.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card compact>
          <InfoRows>
            <InfoRow label='Счёт зачисления'>{loan.issued_to_account}</InfoRow>
            <InfoRow label='Сумма кредита'>{formatMoney(loan.amount)}</InfoRow>
          </InfoRows>
        </Card>
      </Stack>
    </div>
  );
}
