import type { ReactNode } from 'react';
import { Typography } from '@alfalab/core-components/typography';

import { useHealth } from '@/shared/api/health';
import { SOURCE_LABELS, type StatusTone, TEXTS } from '@/shared/i18n/ru';
import type { DataSource, Sourced, TextSource } from '@/shared/types/common';

import { cx, Text } from './layout';

import s from './ui.module.css';

export function FieldTag({ kind }: { kind: 'required' | 'situational' | 'auto' | 'lk' }) {
  const map = {
    required: [s.tagRequired, 'обяз.'],
    situational: [s.tagSituational, 'ситуат.'],
    auto: [s.tagAuto, 'авто'],
    lk: [s.tagLk, 'из ЛК'],
  } as const;
  const [cls, label] = map[kind];
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

export function SourcedValue<T>({
  value,
  render,
  onEdit,
}: {
  value: Sourced<T>;
  render: (v: T) => ReactNode;
  onEdit?: () => void;
}) {
  return (
    <span className={s.infoValue}>
      <Text>{render(value.value)}</Text>
      <SourceTag source={value.source} />
      {value.editable && onEdit && (
        <button type='button' className={s.linkButton} onClick={onEdit}>
          Изменить
        </button>
      )}
    </span>
  );
}

export function FieldLabel({
  children,
  tag,
}: {
  children: ReactNode;
  tag?: 'required' | 'situational' | 'auto' | 'lk' | null;
}) {
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
    <span className={s.row} style={{ gap: 8 }}>
      <span className={cx(s.tag, s.tagAi)}>{TEXTS.aiBadge}</span>
      {hint && (
        <Text small secondary>
          {TEXTS.aiCheck}
        </Text>
      )}
    </span>
  );
}

export function SmallTag({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'info' | 'positive' | 'ai' | 'attention' }) {
  const cls = { neutral: s.tagNeutral, info: s.tagAuto, positive: s.tagLk, ai: s.tagAi, attention: s.tagSituational }[tone];
  return <span className={cx(s.tag, cls)}>{children}</span>;
}

export function ToneLabel({ tone, children, small }: { tone: StatusTone; children: ReactNode; small?: boolean }) {
  return (
    <span className={cx(s.status, s[tone])}>
      <span className={s.dot} />
      <Typography.Text view={small ? 'primary-small' : 'primary-medium'} weight='medium'>
        {children}
      </Typography.Text>
    </span>
  );
}
