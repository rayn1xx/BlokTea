import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CheckmarkCircleMIcon } from '@alfalab/icons-glyph/CheckmarkCircleMIcon';
import { DocumentMIcon } from '@alfalab/icons-glyph/DocumentMIcon';
import { DownloadMIcon } from '@alfalab/icons-glyph/DownloadMIcon';

import { PaymentsHistory } from '@/features/loans/components/PaymentsHistory';
import { useLoan } from '@/features/loans/hooks';
import type { Loan } from '@/features/loans/types';
import { ContractMetrics } from '@/features/signing/screens/SigningScreen';
import { requestFile } from '@/shared/api/client';
import { errorText } from '@/shared/api/query';
import { formatLongDate, formatMoney, formatMonths, formatNumericDate, formatPercent, plural } from '@/shared/lib/format';
import { Accordion, Btn, Card, Dialog, Metrics, PageHead, Panel, QueryGate, Stack, Table, Tabs, Text, TextLink } from '@/shared/ui';

import s from './LoanScreen.module.css';

export function LoanScreen() {
  const { id = '' } = useParams();
  const loan = useLoan(id);
  return <QueryGate query={loan}>{(data) => <Issued loan={data} />}</QueryGate>;
}

export function ScheduleScreen() {
  const { id = '' } = useParams();
  const loan = useLoan(id);
  return <QueryGate query={loan}>{(data) => <Schedule loan={data} />}</QueryGate>;
}

function useContract(loan: Loan) {
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const open = async () => {
    if (!loan.application_id) return;
    try {
      const blob = await requestFile(`/documents/sign-${loan.application_id}-contract/file`);
      setPreview(await blob.text());
    } catch (e) {
      setError(errorText(e));
    }
  };
  const dialog = preview ? (
    <Dialog open onClose={() => setPreview(null)} title='Кредитный договор' size={800}>
      <pre className={s.preview}>{preview}</pre>
    </Dialog>
  ) : null;
  return { open, dialog, error, available: !!loan.application_id };
}

function Issued({ loan }: { loan: Loan }) {
  const navigate = useNavigate();
  const contract = useContract(loan);
  const issued = loan.source === 'system';
  const payments = loan.schedule.slice(0, 3);

  return (
    <div className={s.page}>
      <PageHead
        back={{ label: 'Кредитование', to: '/home' }}
        title={
          issued ? (
            <span className={s.titleRow}>
              <CheckmarkCircleMIcon className={s.ok} /> {formatMoney(loan.amount)} зачислены на ваш счёт
            </span>
          ) : (
            loan.product.name
          )
        }
        subtitle={`${loan.product.name} · ${formatMonths(loan.term_months)} · ${formatPercent(loan.rate_percent, 0)} годовых${issued ? ' · выдача смоделирована' : ' · кредит из Альфа-Бизнеса'}`}
        right={
          contract.available ? (
            <Btn variant='outline' size='l' onClick={contract.open}>
              Открыть договор
            </Btn>
          ) : undefined
        }
      />
      <Stack gap={16}>
        <Panel>
          <div className={s.section}>Условия договора</div>
          <ContractMetrics amount={loan.amount} term={loan.term_months} payment={loan.next_payment?.amount ?? loan.schedule[0]?.payment ?? { value: 0, currency: 'RUB' }} overpayment={loan.overpayment_total} rate={loan.rate_percent} />
        </Panel>
        {loan.payments?.length > 0 && <PaymentsHistory payments={loan.payments} />}
        <Card title='Ближайшие платежи'>
          {payments.map((p) => (
            <div key={p.n} className={s.payment}>
              <span>{formatNumericDate(p.date)}</span>
              <b>{formatMoney(p.payment)}</b>
            </div>
          ))}
          <div className={s.paymentFoot}>
            <span>Платёж спишется автоматически с расчётного счёта. Напомним в кабинете за 3 дня.</span>
            <TextLink underline onClick={() => navigate(`/loans/${loan.id}/schedule`)}>
              Погасить досрочно
            </TextLink>
          </div>
        </Card>
        <div className={s.actions}>
          <Btn variant='outline' size='l' onClick={() => navigate(`/loans/${loan.id}/schedule`)}>
            График платежей
          </Btn>
          <Btn size='l' onClick={() => navigate('/home')}>
            В кабинет
          </Btn>
        </div>
        <div className={s.muted}>Кредит уже появился в разделе «Действующие кредиты».</div>
        {contract.error && <Text color='negative' tag='div'>{contract.error}</Text>}
      </Stack>
      {contract.dialog}
    </div>
  );
}

function Schedule({ loan }: { loan: Loan }) {
  const navigate = useNavigate();
  const contract = useContract(loan);
  const years = [...new Set(loan.schedule.map((r) => r.date.slice(0, 4)))];
  const [year, setYear] = useState(years[0] ?? '');
  const rows = loan.schedule.filter((r) => r.date.startsWith(year));
  const next = loan.next_payment ?? (loan.schedule[0] ? { date: loan.schedule[0].date, amount: loan.schedule[0].payment } : null);
  const total = { value: loan.amount.value + loan.overpayment_total.value, currency: 'RUB' as const };
  const kop = (v: { value: number }) => formatMoney(v as never, { kopecks: true });

  const download = () => {
    const csv = ['Дата;Платёж;Основной долг;Проценты;Остаток', ...loan.schedule.map((r) => [formatNumericDate(r.date), r.payment.value / 100, r.principal.value / 100, r.interest.value / 100, r.balance.value / 100].join(';'))].join('\n');
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `График платежей ${loan.product.name}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className={s.page}>
      <PageHead back={{ label: 'К кредиту', to: `/loans/${loan.id}` }} title='График платежей' subtitle={loan.product.name} />
      <Stack gap={16}>
        <Panel>
          <Metrics
            small
            items={[
              { value: formatMoney(loan.amount), label: 'Сумма кредита' },
              { value: formatMonths(loan.term_months), label: 'Срок' },
              { value: `${formatPercent(loan.rate_percent, 0)} годовых`, label: 'Ставка' },
              { value: `≈ ${formatMoney(total)}`, label: 'Всего к возврату' },
            ]}
          />
        </Panel>
        <div className={s.muted}>Демонстрационный график: расчёт по месяцам, без комиссий.</div>
        {next && (
          <Panel tone='green'>
            <div className={s.nextRow}>
              <div>
                <div className={s.muted}>Ближайший платёж</div>
                <div className={s.next}>
                  {formatLongDate(next.date)} · {formatMoney(next.amount)}
                </div>
              </div>
              <div className={s.nextSide}>
                <b>Будет списан с расчётного счёта</b>
                <div className={s.muted}>Обеспечьте нужную сумму к дате платежа.</div>
              </div>
            </div>
          </Panel>
        )}
        <div className={s.yearRow}>
          <Tabs value={year} onChange={setYear} items={years.map((y) => ({ id: y, label: y }))} />
          <Btn variant='outline' size='m' leftAddons={<DownloadMIcon style={{ width: 18, height: 18 }} />} onClick={download}>
            Скачать график
          </Btn>
        </div>
        <Table>
            <thead>
              <tr>
                <th>Дата</th>
                <th>Платёж</th>
                <th>Основной долг</th>
                <th>Проценты</th>
                <th>Остаток долга</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.n}>
                  <td>{formatNumericDate(r.date)}</td>
                  <td>{kop(r.payment)}</td>
                  <td>{kop(r.principal)}</td>
                  <td>{kop(r.interest)}</td>
                  <td>{kop(r.balance)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        <div className={s.muted}>
          Показаны {rows.length} {plural(rows.length, 'платёж', 'платежа', 'платежей')} за {year} год · всего {loan.schedule.length} {plural(loan.schedule.length, 'платёж', 'платежа', 'платежей')}.
        </div>
        <Accordion title='Из чего складывается платёж'>
          <div className={s.muted}>
            Каждый платёж одинаковый (аннуитетный). В начале срока большая часть уходит на проценты, к концу на основной долг. Проценты начисляются на остаток долга по ставке {formatPercent(loan.rate_percent, 0)} годовых.
          </div>
        </Accordion>
        <div className={s.muted}>Последний платёж может отличаться из-за округления. Точный график указан в договоре.</div>
        <div className={s.footer}>
          {contract.available ? (
            <Btn variant='outline' size='l' leftAddons={<DocumentMIcon style={{ width: 18, height: 18 }} />} onClick={contract.open}>
              Открыть договор
            </Btn>
          ) : (
            <span />
          )}
          <TextLink arrow onClick={() => navigate(`/loans/${loan.id}`)}>
            Вернуться к кредиту
          </TextLink>
        </div>
      </Stack>
      {contract.dialog}
    </div>
  );
}
