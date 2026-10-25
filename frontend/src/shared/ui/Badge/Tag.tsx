import type { ReactNode } from 'react';

import { useHealth } from '@/shared/api/health';
import { SOURCE_LABELS, TEXTS } from '@/shared/i18n/ru';
import { cx } from '@/shared/lib/cx';
import type { DataSource, Sourced, TextSource } from '@/shared/types/common';

import { InlineLink } from '../Button/TextLink';
import { Text } from '../Typography/Text';

import s from './Tag.module.css';

type FieldKind = 'required' | 'situational' | 'auto' | 'lk';

const FIELD_TAGS: Record<FieldKind, [string, string]> = {
  required: [s.required, 'обяз.'],
  situational: [s.situational, 'ситуат.'],
  auto: [s.auto, 'авто'],
  lk: [s.lk, 'из ЛК'],
};

export function FieldTag({ kind }: { kind: FieldKind }) {
  const [cls, label] = FIELD_TAGS[kind];
  return <span className={cx(s.tag, cls)}>{label}</span>;
}

export function sourceTagKind(source: DataSource | 'documents' | null | undefined) {
  if (source === 'registry' || source === 'bki' || source === 'fns') return 'auto' as const;
  if (source === 'alfa_lk' || source === 'multibank') return 'lk' as const;
  return null;
}

export function SourceTag({ source, withName }: { source: DataSource | 'documents' | null | undefined; withName?: boolean }) {
  const kind = sourceTagKind(source);
  if (!kind) return null;
  return (
    <span title={source && source !== 'documents' ? SOURCE_LABELS[source] : undefined}>
      <FieldTag kind={kind} />
      {withName && source && source !== 'documents' && (
        <Text small secondary>
          {' '}
          {SOURCE_LABELS[source]}
        </Text>
      )}
    </span>
  );
}

export function SourcedValue<T>({ value, render, onEdit }: { value: Sourced<T>; render: (v: T) => ReactNode; onEdit?: () => void }) {
  return (
    <span className={s.sourced}>
      <Text>{render(value.value)}</Text>
      <SourceTag source={value.source} />
      {value.editable && onEdit && <InlineLink onClick={onEdit}>Изменить</InlineLink>}
    </span>
  );
}

export function FieldLabel({ children, tag }: { children: ReactNode; tag?: FieldKind | null }) {
  return (
    <span className={s.fieldLabel}>
      <Text medium>{children}</Text>
      {tag && <FieldTag kind={tag} />}
    </span>
  );
}

export function AiBadge({ source, hint = true }: { source: TextSource | null | undefined; hint?: boolean }) {
  const health = useHealth();
  if (source !== 'llm' || health.data?.llm === 'stub') return null;
  return (
    <span className={s.ai}>
      <span className={cx(s.tag, s.purple)}>{TEXTS.aiBadge}</span>
      {hint && (
        <Text small secondary>
          {TEXTS.aiCheck}
        </Text>
      )}
    </span>
  );
}

export function SmallTag({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'info' | 'positive' | 'ai' | 'attention' }) {
  const cls = { neutral: s.neutral, info: s.auto, positive: s.lk, ai: s.purple, attention: s.situational }[tone];
  return <span className={cx(s.tag, cls)}>{children}</span>;
}
