import type { DocumentRef } from '@/features/documents/types';
import { appNo, formatFileSize } from '@/shared/lib/format';
import { Btn, Cell, Table } from '@/shared/ui';

import { DocStatusPill } from './DocStatusPill';
import { PdfIcon } from './PdfIcon';

export function DocumentsTable({ docs, appNumber, onOpen }: { docs: DocumentRef[]; appNumber: (id: string | null) => string | undefined; onOpen: (id: string) => void }) {
  return (
    <Table>
      <thead>
        <tr>
          <th>Документ</th>
          <th>Статус</th>
          <th>Действия</th>
        </tr>
      </thead>
      <tbody>
        {docs.map((d) => (
          <DocRow key={d.id} doc={d} appNumber={appNumber(d.application_id)} onOpen={() => onOpen(d.id)} />
        ))}
      </tbody>
    </Table>
  );
}

function DocRow({ doc, appNumber, onOpen }: { doc: DocumentRef; appNumber?: string; onOpen: () => void }) {
  const details = [
    doc.file_name.split('.').pop()?.toUpperCase(),
    formatFileSize(doc.size_bytes),
    `версия ${doc.version}`,
    appNumber ? `заявка ${appNo(appNumber)}` : null,
    doc.origin === 'alfa_lk' ? 'из Альфа-Бизнеса' : `добавил ${doc.uploaded_by.name}`,
  ];
  return (
    <tr>
      <td>
        <Cell leading={<PdfIcon name={doc.file_name} />} title={doc.file_name} sub={details.filter(Boolean).join(' · ')} />
      </td>
      <td>
        <DocStatusPill doc={doc} />
      </td>
      <td>
        <Btn variant='outline' size='m' onClick={onOpen}>
          {doc.status === 'rejected' ? 'Подробнее' : 'Открыть'}
        </Btn>
      </td>
    </tr>
  );
}
