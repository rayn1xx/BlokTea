import type { CSSProperties, ReactNode } from 'react';
import { MagnifierMIcon } from '@alfalab/icons-glyph/MagnifierMIcon';

import { cx } from '@/shared/lib/cx';

import s from './Inputs.module.css';

export function SelectField<T extends string>({
  value,
  options,
  onChange,
  placeholder,
  disabled,
  ariaLabel,
}: {
  value: T | '' | null | undefined;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  placeholder?: string;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  return (
    <select className={s.select} value={value ?? ''} onChange={(e) => onChange(e.target.value as T)} disabled={disabled} aria-label={ariaLabel}>
      {placeholder !== undefined && (
        <option value='' disabled>
          {placeholder}
        </option>
      )}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function TextField({
  value,
  onChange,
  placeholder,
  suffix,
  error,
  type = 'text',
  inputMode,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  suffix?: ReactNode;
  error?: boolean;
  type?: string;
  inputMode?: 'numeric' | 'email' | 'text';
  ariaLabel?: string;
}) {
  return (
    <div className={s.wrap}>
      <input
        className={cx(s.input, error && s.invalid, !!suffix && s.withSuffix)}
        value={value}
        type={type}
        inputMode={inputMode}
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
      {suffix && <span className={s.suffix}>{suffix}</span>}
    </div>
  );
}

export function SearchField({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <label className={s.search}>
      <MagnifierMIcon />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
    </label>
  );
}

export function TextArea({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return <textarea className={s.textarea} value={value} placeholder={placeholder} aria-label={placeholder} onChange={(e) => onChange(e.target.value)} />;
}

export function CheckField({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; disabled?: boolean }) {
  return (
    <label className={cx(s.check, disabled && s.checkDisabled)}>
      <input type='checkbox' checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

export function Toggle({ checked, onChange, disabled, label }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <button
      type='button'
      role='switch'
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={cx(s.toggle, checked && s.toggleOn)}
      onClick={() => onChange(!checked)}
    />
  );
}

export function Slider({
  value,
  onChange,
  min,
  max,
  step = 1,
  label,
  valueText,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  label: string;
  valueText: string;
}) {
  const fill = ((value - min) / (max - min)) * 100;
  return (
    <label className={s.slider}>
      <span className={s.sliderHead}>
        <span>{label}</span>
        <b>{valueText}</b>
      </span>
      <input
        type='range'
        min={min}
        max={max}
        step={step}
        value={value}
        aria-valuetext={valueText}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ '--fill': `${fill}%` } as CSSProperties}
      />
    </label>
  );
}
