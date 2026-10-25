import { useFinance, useReadiness } from '@/features/company/hooks';
import { formatMoney } from '@/shared/lib/format';
import { Card, InfoRow, InfoRows, Note, QueryGate, SourcedValue, SourceTag } from '@/shared/ui';

export function FinanceStep({ amount, term }: { amount: number; term: number }) {
  const finance = useFinance();
  const readiness = useReadiness(amount, term);
  const load = readiness.data?.items.find((i) => i.code === 'debt_load');
  return (
    <QueryGate query={finance}>
      {(f) => (
        <Card title='Финансы'>
          <InfoRows>
            <InfoRow label='Поступления в месяц'>
              <SourcedValue value={f.monthly_inflow_avg} render={(v) => formatMoney(v)} />
            </InfoRow>
            <InfoRow label='Операционные расходы'>
              <SourcedValue value={f.monthly_operating_outflow_avg} render={(v) => formatMoney(v)} />
            </InfoRow>
            <InfoRow label='Свободный денежный поток'>
              <b>{formatMoney(f.free_cash_flow.value)}</b>
            </InfoRow>
            <InfoRow label='Платежи по кредитам'>
              {formatMoney(f.debts.total_monthly_payment)}
              {[...new Set(f.debts.items.map((d) => d.source))].map((src) => (
                <SourceTag key={src} source={src} />
              ))}
            </InfoRow>
            <InfoRow label='Нагрузка с новым кредитом'>{load ? load.value_text : '…'}</InfoRow>
          </InfoRows>
          {f.stale.text && (
            <div style={{ marginTop: 16 }}>
              <Note tone='attention'>{f.stale.text}</Note>
            </div>
          )}
        </Card>
      )}
    </QueryGate>
  );
}
