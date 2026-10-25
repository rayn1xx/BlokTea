import { CheckmarkCircleMIcon } from '@alfalab/icons-glyph/CheckmarkCircleMIcon';
import { ExclamationCircleMIcon } from '@alfalab/icons-glyph/ExclamationCircleMIcon';

import type { DocumentRef } from '@/features/documents/types';
import { AiBadge, Btn, Card, Pill, Row, Stack, TextLink } from '@/shared/ui';

import { PdfIcon } from './PdfIcon';

import s from './LastCheckCard.module.css';

export function LastCheckCard({ doc, onOpen }: { doc: DocumentRef; onOpen: () => void }) {
  const checking = !doc.analysis || doc.analysis.status !== 'done';
  return (
    <Card compact title='Проверка документа'>
      <Stack gap={12}>
        <div className={s.file}>
          <PdfIcon name={doc.file_name} />
          <div>
            <b>{doc.file_name}</b>
            <Row gap={8}>
              <AiBadge source={doc.analysis?.text_source} hint={false} />
              {checking && <Pill small>Проверяется</Pill>}
            </Row>
          </div>
        </div>
        <Stack gap={6}>
          {doc.analysis?.checks.map((c) => (
            <div key={c.code} className={s.check}>
              {c.passed ? <CheckmarkCircleMIcon className={s.ok} /> : <ExclamationCircleMIcon className={s.warn} />}
              {c.text}
            </div>
          ))}
        </Stack>
        {doc.status === 'rejected' && (
          <>
            <div className={s.muted}>Проверьте файл перед отправкой в банк.</div>
            <Btn variant='outline' size='m' block onClick={onOpen}>
              Загрузить исправленный файл
            </Btn>
          </>
        )}
        <div>
          <TextLink tone='blue' underline onClick={onOpen}>
            Подробнее
          </TextLink>
        </div>
        <div className={s.muted}>Окончательная проверка: сотрудником банка.</div>
      </Stack>
    </Card>
  );
}
