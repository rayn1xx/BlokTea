import type { DocumentRef } from '@/features/documents/types';
import { formatFileSize } from '@/shared/lib/format';
import { Btn, Cell, DotsMenu, Row, Table } from '@/shared/ui';

import { DocStatusPill, docSource } from './DocStatusPill';
import { PdfIcon } from './PdfIcon';

export function ApplicationFilesTable({
  docs,
  canUpload,
  onOpen,
  onAnalyze,
  onRemove,
}: {
  docs: DocumentRef[];
  canUpload: boolean;
  onOpen: (id: string) => void;
  onAnalyze: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <Table>
      <thead>
        <tr>
          <th>Документ</th>
          <th>Источник</th>
          <th>Статус</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {docs.map((d) => (
          <tr key={d.id}>
            <td>
              <Cell
                leading={<PdfIcon name={d.file_name} />}
                title={d.file_name}
                sub={`${d.file_name.split('.').pop()?.toUpperCase()} · ${formatFileSize(d.size_bytes)} · версия ${d.version}`}
              />
            </td>
            <td>{docSource(d)}</td>
            <td>
              <DocStatusPill doc={d} />
            </td>
            <td>
              <Row gap={8} justify='flex-end' wrap={false}>
                <Btn variant='outline' size='m' onClick={() => onOpen(d.id)}>
                  Открыть
                </Btn>
                <DotsMenu
                  items={[
                    ...(canUpload && d.origin !== 'alfa_lk' ? [{ label: 'Проверить снова', onClick: () => onAnalyze(d.id) }] : []),
                    ...(canUpload && d.application_id ? [{ label: 'Удалить', onClick: () => onRemove(d.id), danger: true }] : []),
                    { label: 'Подробнее', onClick: () => onOpen(d.id) },
                  ]}
                />
              </Row>
            </td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}
