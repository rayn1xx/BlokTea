import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@alfalab/core-components/button';
import { Checkbox } from '@alfalab/core-components/checkbox';
import { Typography } from '@alfalab/core-components/typography';

import { companyApi } from '@/features/company/api';
import { useFinance } from '@/features/company/hooks';
import type { FinanceSummary } from '@/features/company/types';
import { UploadDialog } from '@/features/documents/components/UploadDialog';
import { matchingApi } from '@/features/matching/api';
import { EditMoney } from '@/features/matching/components/EditMoney';
import { Footer } from '@/features/matching/components/StepFooter';
import type { MatchingSession } from '@/features/matching/types';
import { useCurrentHome } from '@/features/profile/components/AppShell/AppShell';
import { errorText, fieldErrors, queryClient } from '@/shared/api/query';
import { keys } from '@/shared/api/queryKeys';
import { SOURCE_EXPLAIN } from '@/shared/i18n/ru';
import { formatMoney, formatMonth } from '@/shared/lib/format';
import type { Money } from '@/shared/types/common';
import { Card, CardTitle, FieldTag, InfoRow, InfoRows, Note, QueryGate, Row, SourcedValue, SourceTag, Stack, Text, ToneLabel, uiStyles as s } from '@/shared/ui';

import styles from '../matching.module.css';

export function StepFinance({ session }: { session: MatchingSession }) {
  const finance = useFinance();
  return <QueryGate query={finance}>{(data) => <FinanceForm session={session} finance={data} />}</QueryGate>;
}

function FinanceForm({ session, finance }: { session: MatchingSession; finance: FinanceSummary }) {
  const navigate = useNavigate();
  const home = useCurrentHome();
  const [confirmed, setConfirmed] = useState(session.finance_confirmed);
  const [editing, setEditing] = useState<null | 'inflow' | 'outflow'>(null);
  const [draft, setDraft] = useState<Money | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const patchFinance = useMutation({
    mutationFn: companyApi.patchFinanceSummary,
    onSuccess: (f) => {
      queryClient.setQueryData(keys.finance, f);
      setEditing(null);
    },
    onError: (e) => setError(errorText(e)),
  });

  const toggleConfirm = useMutation({
    mutationFn: async (value: boolean) => {
      if (value) await companyApi.patchFinanceSummary({ confirm: true });
      return matchingApi.patch(session.id, { finance_confirmed: value });
    },
    onSuccess: (updated) => queryClient.setQueryData(keys.matching(session.id), updated),
    onError: (e) => {
      setConfirmed(false);
      setError(errorText(e));
    },
  });

  const next = useMutation({
    mutationFn: () => matchingApi.patch(session.id, { step: 3 }),
    onSuccess: (updated) => {
      queryClient.setQueryData(keys.matching(session.id), updated);
      navigate(`/match/${session.id}/step/3`);
    },
    onError: (e) => setError(fieldErrors(e).finance_confirmed ?? errorText(e)),
  });

  const saveEdit = () => {
    if (!draft) return;
    patchFinance.mutate(editing === 'inflow' ? { monthly_inflow_avg: draft } : { monthly_operating_outflow_avg: draft });
  };

  const sources = [...new Set([finance.monthly_inflow_avg.source, ...finance.debts.items.map((d) => d.source), 'system' as const])];
  const canEdit = ['owner', 'director', 'cfo_or_accountant'].includes(home.role ?? '');

  return (
    <Stack gap={16}>
      {finance.stale.reason && (
        <Note
          tone='attention'
          title='Данные могут быть неполными'
          action={
            <Button view='secondary' size={32} onClick={() => setUploadOpen(true)}>
              Добавить отчётность
            </Button>
          }
        >
          {finance.stale.text}
        </Note>
      )}

      <div className={s.mainAside}>
        <Stack gap={16}>
          <Card>
            <CardTitle right={<Text small secondary>{`за ${formatMonth(finance.period.from.slice(0, 7))} - ${formatMonth(finance.period.to.slice(0, 7))}`}</Text>}>
              Поступления и расходы
            </CardTitle>
            <InfoRows>
              <InfoRow label='Поступления в месяц'>
                {editing === 'inflow' ? (
                  <EditMoney value={draft} onChange={setDraft} onSave={saveEdit} onCancel={() => setEditing(null)} loading={patchFinance.isPending} />
                ) : (
                  <SourcedValue
                    value={finance.monthly_inflow_avg}
                    render={(v) => formatMoney(v)}
                    onEdit={canEdit ? () => {
                      setDraft(finance.monthly_inflow_avg.value);
                      setEditing('inflow');
                    } : undefined}
                  />
                )}
              </InfoRow>
              <InfoRow label='Операционные расходы'>
                {editing === 'outflow' ? (
                  <EditMoney value={draft} onChange={setDraft} onSave={saveEdit} onCancel={() => setEditing(null)} loading={patchFinance.isPending} />
                ) : (
                  <SourcedValue
                    value={finance.monthly_operating_outflow_avg}
                    render={(v) => formatMoney(v)}
                    onEdit={canEdit ? () => {
                      setDraft(finance.monthly_operating_outflow_avg.value);
                      setEditing('outflow');
                    } : undefined}
                  />
                )}
              </InfoRow>
            </InfoRows>
            <div className={styles.freeFlow}>
              <Text secondary tag='div'>
                Свободный денежный поток
              </Text>
              <Typography.Title tag='div' view='small' weight='bold'>
                {formatMoney(finance.free_cash_flow.value)} в месяц
              </Typography.Title>
              <Text small secondary tag='div'>
                Поступления минус операционные расходы. Из этих денег бизнес платит по кредитам
              </Text>
            </div>
            {finance.seasonality && (
              <Text small secondary tag='p' className={s.pageSubtitle}>
                {finance.seasonality.text}
              </Text>
            )}
          </Card>

          <Card>
            <CardTitle right={<Text small secondary>{`всего ${formatMoney(finance.debts.total_monthly_payment)} в месяц`}</Text>}>
              Кредиты и платежи
            </CardTitle>
            {finance.debts.items.length === 0 ? (
              <Text secondary>Действующих кредитов нет</Text>
            ) : (
              <InfoRows>
                {finance.debts.items.map((d) => (
                  <InfoRow key={d.lender} label={<>{d.lender}</>}>
                    <Text>{formatMoney(d.monthly_payment)} в месяц</Text>
                    <SourceTag source={d.source} />
                    {d.overdue && <ToneLabel tone='negative' small>просрочка</ToneLabel>}
                  </InfoRow>
                ))}
              </InfoRows>
            )}
          </Card>

          <Card compact>
            <Checkbox
              checked={confirmed}
              disabled={toggleConfirm.isPending}
              onChange={(_, { checked }) => {
                setConfirmed(checked);
                setError(null);
                toggleConfirm.mutate(checked);
              }}
              label={
                <span className={s.fieldLabel}>
                  <Text medium>Данные актуальны</Text>
                  <FieldTag kind='required' />
                </span>
              }
              hint='Без подтверждения перейти дальше нельзя: на этих цифрах считаем нагрузку'
            />
          </Card>
          {error && <Note tone='negative'>{error}</Note>}
        </Stack>

        <Card>
          <CardTitle>Откуда подставляем</CardTitle>
          <Stack gap={14}>
            {sources.map((src) => (
              <Row key={src} gap={8} align='flex-start'>
                <SourceTag source={src} />
                <Text small>{SOURCE_EXPLAIN[src]}</Text>
              </Row>
            ))}
            {!finance.multibank_connected && <Note tone='neutral'>Счета в других банках учтены по БКИ</Note>}
          </Stack>
        </Card>
      </div>

      <Footer
        left={
          <Button view='secondary' size={56} onClick={() => navigate(`/match/${session.id}/step/1`)}>
            Назад
          </Button>
        }
        right={
          <Button view='primary' size={56} onClick={() => next.mutate()} loading={next.isPending} disabled={!confirmed || toggleConfirm.isPending}>
            Далее
          </Button>
        }
      />

      <UploadDialog
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        documentType={home.company?.legal_form === 'IP' ? 'tax_return' : 'fin_statements_2025'}
        title='Добавить отчётность'
      />
    </Stack>
  );
}
