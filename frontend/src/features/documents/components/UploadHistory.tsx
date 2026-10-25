import { ClockLineMIcon } from '@alfalab/icons-glyph/ClockLineMIcon';

import type { DocumentRef } from '@/features/documents/types';
import { formatShortDateTime } from '@/shared/lib/format';
import { Accordion, Stack } from '@/shared/ui';

import s from './UploadHistory.module.css';

export function UploadHistory({ docs, limit }: { docs: DocumentRef[]; limit?: number }) {
  const rows = [...docs].sort((a, b) => b.uploaded_at.localeCompare(a.uploaded_at)).slice(0, limit);
  return (
    <Accordion icon={ClockLineMIcon} title='История загрузок'>
      <Stack gap={8}>
        {rows.map((d) => (
          <div key={d.id} className={s.row}>
            <span className={s.time}>{formatShortDateTime(d.uploaded_at)}</span>
            <span>
              {d.file_name} · {d.origin === 'alfa_lk' ? 'из Альфа-Бизнеса' : d.uploaded_by.name}
            </span>
          </div>
        ))}
      </Stack>
    </Accordion>
  );
}
