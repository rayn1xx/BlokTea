import type { DocumentRef } from '@/features/documents/types';
import { Pill, type PillTone } from '@/shared/ui';

const MAP: Record<DocumentRef['status'], { label: string; tone: PillTone }> = {
  uploaded: { label: 'Загружен', tone: 'grey' },
  analyzing: { label: 'Проверяется', tone: 'grey' },
  accepted: { label: 'Принят', tone: 'green' },
  rejected: { label: 'Есть замечание', tone: 'yellow' },
  expiring: { label: 'Скоро устареет', tone: 'yellow' },
};

export function DocStatusPill({ doc }: { doc: DocumentRef }) {
  const m = MAP[doc.status];
  return (
    <Pill tone={m.tone} small>
      {m.label}
    </Pill>
  );
}

export function docSource(doc: DocumentRef) {
  if (doc.origin === 'alfa_lk') return 'Из Альфа-Бизнеса';
  if (doc.scope === 'company' && !doc.application_id) return 'Документы компании';
  return `Добавил ${doc.uploaded_by.name}`;
}
