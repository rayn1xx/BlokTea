import { Tag } from '@alfalab/core-components/tag';

import s from './Chips.module.css';

export function Chips<T extends string>({
  options,
  value,
  onChange,
  multiple,
  disabled,
}: {
  options: { value: T; label: string }[];
  value: T | T[] | null | undefined;
  onChange: (value: T) => void;
  multiple?: boolean;
  disabled?: boolean;
}) {
  const isChecked = (v: T) => (multiple ? ((value as T[]) ?? []).includes(v) : value === v);
  return (
    <div className={s.chips} role={multiple ? 'group' : 'radiogroup'}>
      {options.map((o) => (
        <Tag
          key={o.value}
          size={40}
          checked={isChecked(o.value)}
          disabled={disabled}
          onClick={() => onChange(o.value)}
          role={multiple ? 'checkbox' : 'radio'}
          aria-checked={isChecked(o.value)}
        >
          {o.label}
        </Tag>
      ))}
    </div>
  );
}
