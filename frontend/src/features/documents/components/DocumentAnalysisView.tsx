import { CheckmarkCircleMIcon } from '@alfalab/icons-glyph/CheckmarkCircleMIcon';
import { CrossCircleMIcon } from '@alfalab/icons-glyph/CrossCircleMIcon';

import { useDocumentTypes } from '@/features/documents/hooks';
import type { DocumentRef } from '@/features/documents/types';
import { AiBadge, Note, Row, SkeletonLines, Stack, Text } from '@/shared/ui';

export function DocumentAnalysisView({ doc }: { doc: DocumentRef }) {
  const types = useDocumentTypes();
  const a = doc.analysis;

  if (doc.origin === 'alfa_lk' && !a) {
    return <Note tone='positive'>Документ сформирован из данных Альфа-Бизнеса, проверка не нужна</Note>;
  }
  if (!a || a.status === 'pending' || doc.status === 'analyzing') {
    return (
      <Stack gap={8}>
        <Text secondary>ИИ проверяет документ: тип, ИНН, период и подпись…</Text>
        <SkeletonLines lines={2} height={14} />
      </Stack>
    );
  }
  if (a.status === 'unavailable' || a.status === 'failed') {
    return <Note tone='info'>Документ уйдёт на ручную проверку</Note>;
  }

  const detected = types.data?.find((t) => t.code === a.detected_type)?.title ?? a.detected_type;

  return (
    <Stack gap={12}>
      <AiBadge source={a.text_source} />
      {detected && (
        <Text small>
          Тип документа: <b>{detected}</b>
          {a.detected_type_confidence ? ` (уверенность ${Math.round(a.detected_type_confidence * 100)}%)` : ''}
        </Text>
      )}
      {a.checks.length > 0 && (
        <Stack gap={6}>
          {a.checks.map((c) => (
            <Row key={c.code} gap={8} align='flex-start'>
              {c.passed ? (
                <CheckmarkCircleMIcon style={{ width: 20, height: 20, color: 'var(--color-light-graphic-positive, #0cc44d)', flexShrink: 0 }} />
              ) : (
                <CrossCircleMIcon style={{ width: 20, height: 20, color: 'var(--color-light-graphic-negative, #ff5431)', flexShrink: 0 }} />
              )}
              <Text small>{c.text}</Text>
            </Row>
          ))}
        </Stack>
      )}
      {a.issues.map((i) => (
        <Note key={i.text} tone={i.severity === 'error' ? 'negative' : i.severity === 'warning' ? 'attention' : 'info'}>
          {i.text}
        </Note>
      ))}
      {a.extracted_fields.length > 0 && (
        <Stack gap={4}>
          <Text small medium>
            Извлечённые поля
          </Text>
          {a.extracted_fields.map((f) => (
            <Text key={f.key} small secondary>
              {f.label}: {f.value}
            </Text>
          ))}
        </Stack>
      )}
    </Stack>
  );
}
