import { useState } from 'react';

import type { FinanceSummary } from '@/features/company/types';
import { formatMoney, formatMonth, formatPercent, plural } from '@/shared/lib/format';
import type { Money } from '@/shared/types/common';
import { Bar, Card, Chips, Grid, Metrics, Note, Slider, Stack, Text } from '@/shared/ui';

import { STRESS_PRESETS, stressTest } from '../stress';

import s from './StressTest.module.css';

const rub = (value: number): Money => ({ value, currency: 'RUB' });
const percent = (share: number) => `${Math.round(share * 100)}%`;
const signed = (share: number) => (share > 0 ? `+${percent(share)}` : percent(share));

export function StressTest({ finance }: { finance: FinanceSummary }) {
  const [drop, setDrop] = useState(0.2);
  const [costs, setCosts] = useState(0);
  const [months, setMonths] = useState(6);

  const input = {
    inflow: finance.monthly_inflow_avg.value.value,
    outflow: finance.monthly_operating_outflow_avg.value.value,
    payments: finance.debts.total_monthly_payment.value,
  };
  const now = stressTest(input, { revenueDrop: 0, costChange: 0, months });
  const r = stressTest(input, { revenueDrop: drop, costChange: costs, months });
  const preset = STRESS_PRESETS.find((p) => Math.abs(p - drop) < 0.001);

  return (
    <Card title='Запас прочности' right={<Text small secondary>Если выручка упадёт</Text>}>
      <Stack gap={20}>
        <Text secondary>
          Посмотрите, что будет с платежами по кредитам, если продажи просядут, например из-за изменений на маркетплейсе, и сколько стоит отложить на такой случай.
        </Text>

        <Stack gap={12}>
          <Chips
            options={STRESS_PRESETS.map((p) => ({ value: String(p), label: `Выручка −${percent(p)}` }))}
            value={preset === undefined ? null : String(preset)}
            onChange={(v) => setDrop(Number(v))}
          />
          <Grid>
            <Slider label='Падение выручки' value={Math.round(drop * 100)} min={0} max={70} step={5} valueText={`−${percent(drop)}`} onChange={(v) => setDrop(v / 100)} />
            <Slider label='Изменение расходов' value={Math.round(costs * 100)} min={-30} max={30} step={5} valueText={signed(costs)} onChange={(v) => setCosts(v / 100)} />
          </Grid>
        </Stack>

        <Metrics
          items={[
            { value: formatMoney(rub(r.inflow)), label: 'Поступления в месяц', hint: `сейчас ${formatMoney(rub(now.inflow))}` },
            { value: formatMoney(rub(r.outflow)), label: 'Расходы в месяц', hint: `сейчас ${formatMoney(rub(now.outflow))}` },
            { value: formatMoney(rub(input.payments)), label: 'Платежи по кредитам' },
            { value: <span className={r.afterPayments < 0 ? s.negative : s.positive}>{formatMoney(rub(r.afterPayments)) || '0 ₽'}</span>, label: 'Остаётся после платежей' },
          ]}
        />

        {r.coverage !== null && (
          <Stack gap={6}>
            <div className={s.coverageHead}>
              <Text small>Чем покрыты платежи</Text>
              <Text small medium>
                {r.coverage > 0 ? `${formatPercent(Math.min(r.coverage, 9.9) * 100, 0)} от суммы платежей` : 'не покрыты'}
              </Text>
            </div>
            <Bar value={Math.min(100, Math.max(0, r.coverage * 50))} tone={r.coverage >= 1.5 ? 'green' : r.coverage >= 1 ? 'yellow' : 'red'} />
          </Stack>
        )}

        {r.afterPayments < 0 ? (
          <Note tone='attention' title={`Подушка на ${months} ${plural(months, 'месяц', 'месяца', 'месяцев')}: ${formatMoney(rub(r.reserve))}`}>
            При таком сценарии не хватает {formatMoney(rub(-r.afterPayments))} в месяц на платежи. Эту сумму стоит держать на отдельном счёте или депозите.
          </Note>
        ) : (
          <Note tone='positive' title='Платежи покрываются'>
            Даже при этом сценарии после платежей остаётся {formatMoney(rub(r.afterPayments)) || '0 ₽'} в месяц.
          </Note>
        )}

        <Grid>
          <Slider label='На сколько месяцев подушка' value={months} min={1} max={12} valueText={`${months} мес.`} onChange={setMonths} />
          <Stack gap={4}>
            <Text small secondary>
              Платежи перестают покрываться, если выручка упадёт на
            </Text>
            <Text bold>{now.breakEvenDrop > 0 ? `${percent(now.breakEvenDrop)} и больше` : 'уже сейчас'}</Text>
          </Stack>
        </Grid>

        <Text small secondary>
          Расчёт по средним поступлениям и расходам: {formatMonth(finance.period.from.slice(0, 7))} — {formatMonth(finance.period.to.slice(0, 7))}. Это ориентир, а не решение банка.
        </Text>
      </Stack>
    </Card>
  );
}
