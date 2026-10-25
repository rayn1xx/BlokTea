import { useNavigate } from 'react-router-dom';
import { DocumentMIcon } from '@alfalab/icons-glyph/DocumentMIcon';

import type { MissingDocument } from '@/features/documents/types';
import type { Task } from '@/features/tasks/types';
import { Btn, Card, SkeletonLines, Stack, TextLink } from '@/shared/ui';

import s from './MissingDocuments.module.css';

export type DocumentWanted = { type: string; title: string; applicationId?: string };

export function MissingDocuments({
  items,
  requests,
  canUpload,
  onUpload,
  onAsk,
}: {
  items: MissingDocument[] | undefined;
  requests: Task[];
  canUpload: boolean;
  onUpload: (doc: DocumentWanted) => void;
  onAsk: (doc: DocumentWanted) => void;
}) {
  const navigate = useNavigate();
  return (
    <Card compact title='Нужно добавить'>
      {!items ? (
        <SkeletonLines lines={2} />
      ) : items.length === 0 ? (
        <div className={s.muted}>Все нужные документы на месте</div>
      ) : (
        <Stack gap={10}>
          {items.map((m) => {
            const task = requests.find((t) => t.application?.id === m.application_id);
            const wanted = { type: m.document_type, title: m.title, applicationId: m.application_id ?? undefined };
            return (
              <div key={`${m.document_type}-${m.application_id}`} className={s.item}>
                <div className={s.head}>
                  <DocumentMIcon className={s.icon} />
                  <div>
                    <b>{m.title}</b>
                    <div className={s.muted}>{m.reason}</div>
                    {task?.assignee && <div className={s.muted}>Ответственный: {task.assignee.name}</div>}
                  </div>
                </div>
                <Btn variant='outline' size='m' block disabled={!canUpload} onClick={() => (task ? navigate(task.cta.route) : onUpload(wanted))}>
                  Загрузить
                </Btn>
                {canUpload && !task && (
                  <TextLink tone='blue' underline onClick={() => onAsk(wanted)}>
                    Запросить у сотрудника
                  </TextLink>
                )}
                {task?.available_actions.includes('task.reassign') && (
                  <TextLink tone='blue' underline onClick={() => navigate(task.cta.route)}>
                    Назначить сотруднику
                  </TextLink>
                )}
              </div>
            );
          })}
        </Stack>
      )}
    </Card>
  );
}
