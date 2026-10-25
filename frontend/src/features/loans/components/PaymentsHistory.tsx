import { useState } from 'react';

import { formatMoney, formatNumericDate, monthName } from '@/shared/lib/format';
import type { Money } from '@/shared/types/common';
import { Card, SelectField } from '@/shared/ui';

import type { LoanPayment } from '../types';
import { formatShort, niceMax, paymentsByYear, paymentTotal, SERIES } from './paymentsChart';

import c from './PaymentsHistory.module.css';

const rub = (value: number): Money => ({ value, currency: 'RUB' });
const capital = (s: string) => s[0].toUpperCase() + s.slice(1);
const monthOf = (date: string) => capital(monthName(Number(date.slice(5, 7))));

export function PaymentsHistory({ payments }: { payments: LoanPayment[] }) {
  const { years, of } = paymentsByYear(payments);
  const [year, setYear] = useState(years[0] ?? '');
  const [selected, setSelected] = useState<string | null>(null);
  const rows = of(year);
  const active = rows.find((p) => p.date === selected) ?? rows[rows.length - 1];

  if (!active) return null;

  const max = niceMax(Math.max(...rows.map(paymentTotal)));
  const hasEarly = rows.some((p) => p.early.value > 0);
  const series = SERIES.filter((s) => s.key !== 'early' || hasEarly);
  const total = rows.reduce((sum, p) => sum + paymentTotal(p), 0);

  return (
    <Card
      title='История платежей'
      right={
        years.length > 1 && (
          <div className={c.year}>
            <SelectField
              value={year}
              options={years.map((y) => ({ value: y, label: y }))}
              onChange={(y) => {
                setYear(y);
                setSelected(null);
              }}
              ariaLabel='Год'
            />
          </div>
        )
      }
    >
      <div className={c.layout}>
        <div>
          <div className={c.plot}>
            <div className={c.axis} aria-hidden>
              {[max, max / 2, 0].map((v) => (
                <span key={v}>{v ? formatShort(v) : '0'}</span>
              ))}
            </div>
            <div className={c.bars} role='list' aria-label={`Платежи за ${year} год`}>
              <span className={`${c.grid} ${c.gridTop}`} />
              <span className={`${c.grid} ${c.gridMid}`} />
              {rows.map((p) => {
                const sum = paymentTotal(p);
                const isActive = p === active;
                return (
                  <button
                    key={p.date}
                    type='button'
                    role='listitem'
                    className={`${c.col} ${isActive ? c.colActive : ''}`}
                    onMouseEnter={() => setSelected(p.date)}
                    onFocus={() => setSelected(p.date)}
                    onClick={() => setSelected(p.date)}
                    aria-label={`${monthOf(p.date)}: ${formatMoney(rub(sum))}. ${series.map((s) => `${s.label} ${formatMoney(p[s.key]) || '0 ₽'}`).join(', ')}`}
                    aria-current={isActive || undefined}
                  >
                    <span className={c.stack} style={{ height: `${(sum / max) * 100}%` }}>
                      {isActive && <span className={c.value}>{formatShort(sum)}</span>}
                      {series.map((s) =>
                        p[s.key].value > 0 ? <span key={s.key} className={c.segment} style={{ flexGrow: p[s.key].value, background: s.color }} /> : null,
                      )}
                    </span>
                    <span className={c.month}>{monthOf(p.date).slice(0, 3)}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <ul className={c.legend}>
            {series.map((s) => (
              <li key={s.key}>
                <span className={c.swatch} style={{ background: s.color }} />
                {s.label}
              </li>
            ))}
          </ul>
          <div className={c.total}>
            Всего внесено за {year} год <b>{formatMoney(rub(total))}</b> · включая проценты
          </div>
        </div>

        <aside className={c.detail} aria-live='polite'>
          <div className={c.detailMonth}>{monthOf(active.date)}</div>
          <div className={c.detailSum}>{formatMoney(rub(paymentTotal(active)))}</div>
          <div className={c.muted}>{formatNumericDate(active.date)}</div>
          <dl className={c.rows}>
            {series.map((s) => (
              <div key={s.key} className={c.row}>
                <dt>
                  <span className={c.swatch} style={{ background: s.color }} />
                  {s.label}
                </dt>
                <dd>{formatMoney(active[s.key]) || '0 ₽'}</dd>
              </div>
            ))}
          </dl>
        </aside>
      </div>
    </Card>
  );
}
