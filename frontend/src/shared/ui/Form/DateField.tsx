import { useState } from 'react';
import { DateInput } from '@alfalab/core-components/date-input';

const toView = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split('-').reverse().join('.') : '');

const toIso = (view: string) => (/^\d{2}\.\d{2}\.\d{4}$/.test(view) ? view.split('.').reverse().join('-') : '');

export function DateField({
  label,
  value,
  onChange,
  error,
  size = 48,
}: {
  label: string;
  value: string;
  onChange: (iso: string) => void;
  error?: string;
  size?: 48 | 56;
}) {
  const [text, setText] = useState(toView(value));
  return (
    <DateInput
      label={label}
      size={size}
      block
      value={text}
      error={error}
      onChange={(_, { value: v }) => {
        setText(v);
        const iso = toIso(v);
        if (iso || !v) onChange(iso);
      }}
    />
  );
}
