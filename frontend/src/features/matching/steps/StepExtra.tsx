import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@alfalab/core-components/button';
import { Input } from '@alfalab/core-components/input';

import { useFinance } from '@/features/company/hooks';
import { matchingApi } from '@/features/matching/api';
import { MonthsChart } from '@/features/matching/components/MonthsChart';
import { Footer } from '@/features/matching/components/StepFooter';
import { hasExtra, mergePatch, useSessionAutosave } from '@/features/matching/lib';
import type { MatchingExtra, MatchingSession } from '@/features/matching/types';
import { errorText, queryClient } from '@/shared/api/query';
import { keys } from '@/shared/api/queryKeys';
import { COLLATERAL_LABELS, PREFERENCE_LABELS } from '@/shared/i18n/ru';
import { monthName } from '@/shared/lib/format';
import { autosaveText } from '@/shared/lib/useAutosave';
import type { Preference } from '@/shared/types/common';
import { Card, CardTitle, Chips, DateField, FieldGroup, FieldLabel, FieldTag, MoneyInput, Note, Row, Stack, Text, uiStyles as s } from '@/shared/ui';

export function StepExtra({ session }: { session: MatchingSession }) {
  const navigate = useNavigate();
  const finance = useFinance();
  const [expanded, setExpanded] = useState(!session.extra.skipped && hasExtra(session.extra));
  const [extra, setExtra] = useState(session.extra);
  const [error, setError] = useState<string | null>(null);
  const { state, schedule, flush } = useSessionAutosave(session);

  const update = <K extends keyof MatchingExtra>(key: K, value: MatchingExtra[K]) => {
    setExtra((x) => ({ ...x, [key]: value }));
    schedule({ extra: { [key]: value } }, mergePatch);
  };

  const go = useMutation({
    mutationFn: async (skipped: boolean) => {
      await flush().catch(() => undefined);
      return matchingApi.patch(session.id, { extra: skipped ? { skipped: true } : { ...extra, skipped: false }, step: 4 });
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(keys.matching(session.id), updated);
      navigate(`/match/${session.id}/step/4`);
    },
    onError: (e) => setError(errorText(e)),
  });

  const withCollateral = session.need.collateral && session.need.collateral !== 'none';

  return (
    <Stack gap={16}>
      <Card>
        <Stack gap={16}>
          <Text>Можно дополнить данные: с ними подбор будет точнее. Или сразу получить предварительный результат</Text>
          <Row>
            <Button view={expanded ? 'secondary' : 'primary'} size={48} onClick={() => setExpanded(true)} disabled={expanded}>
              Дополнить данные
            </Button>
            <Button view='secondary' size={48} onClick={() => go.mutate(true)} loading={go.isPending && !expanded}>
              Продолжить предварительный подбор
            </Button>
          </Row>
        </Stack>
      </Card>

      {expanded && (
        <>
          {finance.data && (
            <Card>
              <CardTitle right={<FieldTag kind='lk' />}>Выручка по месяцам</CardTitle>
              <MonthsChart finance={finance.data} />
              {finance.data.seasonality && (
                <Text small secondary tag='p' className={s.pageSubtitle}>
                  Сезонность: спад в {finance.data.seasonality.low_months.map((m) => monthName(m)).join(' и ')}
                </Text>
              )}
            </Card>
          )}

          <Card>
            <Stack gap={24}>
              <FieldGroup label={<FieldLabel tag='situational'>Ожидаемые оплаты от покупателей</FieldLabel>}>
                <Stack gap={10}>
                  {extra.expected_payments.map((p, i) => (
                    <div key={i} className={s.grid3}>
                      <Input
                        label='От кого'
                        size={48}
                        block
                        value={p.counterparty}
                        onChange={(_, { value }) =>
                          update('expected_payments', extra.expected_payments.map((x, j) => (j === i ? { ...x, counterparty: value } : x)))
                        }
                      />
                      <MoneyInput
                        label='Сумма'
                        size={48}
                        value={p.amount}
                        onChange={(v) =>
                          update('expected_payments', extra.expected_payments.map((x, j) => (j === i ? { ...x, amount: v ?? { value: 0, currency: 'RUB' } } : x)))
                        }
                      />
                      <DateField
                        label='Когда'
                        value={p.date}
                        onChange={(value) =>
                          update('expected_payments', extra.expected_payments.map((x, j) => (j === i ? { ...x, date: value } : x)))
                        }
                      />
                    </div>
                  ))}
                  <div>
                    <Button
                      view='transparent'
                      size={32}
                      onClick={() =>
                        update('expected_payments', [
                          ...extra.expected_payments,
                          { counterparty: '', amount: { value: 0, currency: 'RUB' }, date: '', source: 'client' },
                        ])
                      }
                    >
                      Добавить оплату
                    </Button>
                  </div>
                </Stack>
              </FieldGroup>

              <div className={s.grid2}>
                <FieldGroup label={<FieldLabel tag='situational'>Обороты в других банках</FieldLabel>}>
                  <MoneyInput label='В месяц' value={extra.other_bank_turnover_monthly} onChange={(v) => update('other_bank_turnover_monthly', v)} />
                </FieldGroup>
                <FieldGroup label={<FieldLabel tag='situational'>Собственные средства</FieldLabel>} hint='Сколько готовы вложить сами'>
                  <MoneyInput label='Сумма' value={extra.own_funds} onChange={(v) => update('own_funds', v)} />
                </FieldGroup>
              </div>

              {withCollateral && (
                <FieldGroup label={<FieldLabel tag='situational'>Залог: {COLLATERAL_LABELS[session.need.collateral!]}</FieldLabel>}>
                  <div className={s.grid2}>
                    <Input
                      label='Что это'
                      size={56}
                      block
                      value={extra.collateral_details?.description ?? ''}
                      onChange={(_, { value }) =>
                        update('collateral_details', {
                          type: session.need.collateral!,
                          description: value,
                          estimated_value: extra.collateral_details?.estimated_value ?? { value: 0, currency: 'RUB' },
                        })
                      }
                    />
                    <MoneyInput
                      label='Примерная стоимость'
                      value={extra.collateral_details?.estimated_value}
                      onChange={(v) =>
                        update('collateral_details', {
                          type: session.need.collateral!,
                          description: extra.collateral_details?.description ?? '',
                          estimated_value: v ?? { value: 0, currency: 'RUB' },
                        })
                      }
                    />
                  </div>
                </FieldGroup>
              )}

              <FieldGroup label={<FieldLabel tag='situational'>Что для вас важнее</FieldLabel>}>
                <Chips
                  options={(Object.keys(PREFERENCE_LABELS) as Preference[]).map((p) => ({ value: p, label: PREFERENCE_LABELS[p] }))}
                  value={extra.preference}
                  onChange={(v) => update('preference', v)}
                />
              </FieldGroup>
            </Stack>
          </Card>
        </>
      )}

      {error && <Note tone='negative'>{error}</Note>}

      <Footer
        left={
          <Button view='secondary' size={56} onClick={() => navigate(`/match/${session.id}/step/2`)}>
            Назад
          </Button>
        }
        saved={expanded ? autosaveText(state) : undefined}
        right={
          expanded ? (
            <Button view='primary' size={56} onClick={() => go.mutate(false)} loading={go.isPending}>
              Подобрать кредит
            </Button>
          ) : undefined
        }
      />
    </Stack>
  );
}
