import { Input } from '@alfalab/core-components/input';

import { formatNumberInput, parseNumberInput, rubToMoney } from '@/shared/lib/format';
import type { Money } from '@/shared/types/common';

export function MoneyInput({
  label,
  value,
  onChange,
  error,
  hint,
  disabled,
  block = true,
  size = 56,
}: {
  label: string;
  value: Money | null | undefined;
  onChange: (value: Money | null) => void;
  error?: string | false | null;
  hint?: string;
  disabled?: boolean;
  block?: boolean;
  size?: 48 | 56 | 64;
}) {
  return (
    <Input
      label={label}
      inputMode='numeric'
      size={size}
      block={block}
      disabled={disabled}
      value={formatNumberInput(value ? value.value / 100 : null)}
      onChange={(_, { value: v }) => {
        const rub = parseNumberInput(v);
        onChange(rub === null ? null : rubToMoney(rub));
      }}
      rightAddons='₽'
      error={error || undefined}
      hint={hint}
    />
  );
}

export function NumberInput({
  label,
  value,
  onChange,
  error,
  suffix,
  hint,
  disabled,
  size = 56,
}: {
  label: string;
  value: number | null | undefined;
  onChange: (value: number | null) => void;
  error?: string | false | null;
  suffix?: string;
  hint?: string;
  disabled?: boolean;
  size?: 48 | 56 | 64;
}) {
  return (
    <Input
      label={label}
      inputMode='numeric'
      size={size}
      block
      disabled={disabled}
      value={formatNumberInput(value)}
      onChange={(_, { value: v }) => onChange(parseNumberInput(v))}
      rightAddons={suffix}
      error={error || undefined}
      hint={hint}
    />
  );
}
