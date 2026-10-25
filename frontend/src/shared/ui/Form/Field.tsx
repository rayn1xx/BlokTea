import type { ReactNode } from 'react';

import { Text } from '../Typography/Text';

import s from './Field.module.css';

export function Field({
  label,
  optional,
  hint,
  error,
  children,
}: {
  label?: ReactNode;
  optional?: string | boolean;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
}) {
  return (
    <div>
      {label && (
        <div className={s.label}>
          {label}
          {optional && <span className={s.optional}>{optional === true ? 'Необязательно' : optional}</span>}
        </div>
      )}
      {children}
      {error ? <div className={s.error}>{error}</div> : hint ? <div className={s.hint}>{hint}</div> : null}
    </div>
  );
}

export function FieldGroup({ label, children, error, hint }: { label: ReactNode; children: ReactNode; error?: string | null; hint?: ReactNode }) {
  return (
    <div className={s.group}>
      {label}
      {children}
      {hint && !error && (
        <Text small secondary>
          {hint}
        </Text>
      )}
      {error && (
        <Text small color='negative'>
          {error}
        </Text>
      )}
    </div>
  );
}
