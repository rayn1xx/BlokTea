import type { FinanceSummary } from '@/features/company/types';
import { formatMoney, formatMonth, monthName } from '@/shared/lib/format';

import styles from '../matching.module.css';

export function MonthsChart({ finance }: { finance: FinanceSummary }) {
  const max = Math.max(...finance.months.map((m) => m.inflow.value));
  const low = finance.seasonality?.low_months ?? [];
  return (
    <div className={styles.chart} role='img' aria-label='Поступления по месяцам'>
      {finance.months.map((m) => {
        const month = Number(m.month.slice(5));
        return (
          <div key={m.month} className={styles.bar} title={`${formatMonth(m.month)}: ${formatMoney(m.inflow)}`}>
            <span className={`${styles.barFill} ${low.includes(month) ? styles.barLow : ''}`} style={{ height: `${(m.inflow.value / max) * 100}%` }} />
            <span className={styles.barLabel}>{monthName(month).slice(0, 3)}</span>
          </div>
        );
      })}
    </div>
  );
}
