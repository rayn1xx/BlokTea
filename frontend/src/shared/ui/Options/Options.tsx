import type { CSSProperties, ReactNode } from 'react';

import { cx } from '@/shared/lib/cx';

import s from './Options.module.css';

export type Option<T extends string> = { value: T; label: ReactNode; description?: ReactNode };

export function Options<T extends string>({
  options,
  value,
  values,
  onChange,
  columns = 3,
  radio,
  disabled,
}: {
  options: Option<T>[];
  value?: T | null | undefined;
  values?: T[];
  onChange: (v: T) => void;
  columns?: number;
  radio?: boolean;
  disabled?: boolean;
}) {
  const isOn = (v: T) => (values ? values.includes(v) : value === v);
  return (
    <div className={s.options} style={{ '--cols': columns } as CSSProperties} role={values ? 'group' : 'radiogroup'}>
      {options.map((o) => (
        <button
          key={o.value}
          type='button'
          role={values ? 'checkbox' : 'radio'}
          aria-checked={isOn(o.value)}
          disabled={disabled}
          className={cx(s.option, isOn(o.value) && s.active, !radio && s.center)}
          onClick={() => onChange(o.value)}
        >
          {radio && <span className={s.radio} />}
          <span className={radio ? s.text : undefined}>
            {o.label}
            {o.description && <span className={s.description}>{o.description}</span>}
          </span>
        </button>
      ))}
    </div>
  );
}
