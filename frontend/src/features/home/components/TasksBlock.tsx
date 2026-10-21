import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@alfalab/core-components/button';

import type { Home } from '@/features/profile/types';
import { tasksApi } from '@/features/tasks/api';
import { useTasks } from '@/features/tasks/hooks';
import type { Task } from '@/features/tasks/types';
import { MemberPicker } from '@/features/team/components/MemberPicker';
import { invalidateApplication } from '@/shared/api/query';
import { formatDate, formatRelative } from '@/shared/lib/format';
import { Card, CardTitle, ErrorState, Row, SkeletonLines, SmallTag, Text } from '@/shared/ui';

import styles from '../home.module.css';

export function TasksBlock({ home }: { home: Home }) {
  const navigate = useNavigate();
  const mine = useTasks('mine');
  const others = useTasks('waiting_others');
  const [reassign, setReassign] = useState<Task | null>(null);

  const reassignMutation = (task: Task) => async (memberId: string) => {
    await tasksApi.reassign(task.id, memberId);
    invalidateApplication(task.application?.id);
  };

  const myTasks = mine.data ?? [];
  const otherTasks = others.data ?? [];

  return (
    <Card>
      <CardTitle right={myTasks.length ? <SmallTag tone='attention'>{myTasks.length}</SmallTag> : undefined}>
        Требуется ваше действие
      </CardTitle>

      {mine.isLoading ? (
        <SkeletonLines lines={2} />
      ) : mine.isError ? (
        <ErrorState error={mine.error} onRetry={() => mine.refetch()} />
      ) : myTasks.length === 0 ? (
        <Text secondary>Сейчас от вас ничего не нужно. Новые задачи появятся здесь</Text>
      ) : (
        <ul className={styles.tasks}>
          {myTasks.map((t) => (
            <li key={t.id} className={styles.task}>
              <div className={styles.taskBody}>
                <Text medium tag='div'>
                  {t.title}
                </Text>
                <Text small secondary tag='div'>
                  {t.application ? `Заявка ${t.application.number} · ` : ''}
                  {t.due_at ? `до ${formatDate(t.due_at)} · ` : ''}
                  {formatRelative(t.created_at)}
                </Text>
              </div>
              <Row gap={8}>
                {t.available_actions.includes('task.reassign') && (
                  <Button view='transparent' size={40} onClick={() => setReassign(t)}>
                    Передать
                  </Button>
                )}
                <Button view='primary' size={40} onClick={() => navigate(t.cta.route)}>
                  {t.cta.label}
                </Button>
              </Row>
            </li>
          ))}
        </ul>
      )}

      {otherTasks.length > 0 && (
        <>
          <Text small secondary medium tag='div' className={styles.othersTitle}>
            {home.home_profile === 'accountant' ? 'Задачи компании' : 'Передано другим сотрудникам'}
          </Text>
          <ul className={styles.tasks}>
            {otherTasks.map((t) => (
              <li key={t.id} className={styles.task}>
                <div className={styles.taskBody}>
                  <Text tag='div'>{t.title}</Text>
                  <Text small secondary tag='div'>
                    {t.waiting_for_text}
                  </Text>
                </div>
                {t.type === 'sign' && (
                  <Button view='secondary' size={32} onClick={() => navigate(t.cta.route)}>
                    Ознакомиться
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {reassign && (
        <MemberPicker
          open
          title='Передать задачу'
          subtitle={reassign.title}
          permission={reassign.type === 'send_application' ? 'submit_applications' : 'upload_documents'}
          excludeUserId={home.id}
          onClose={() => setReassign(null)}
          onSelect={(m) => reassignMutation(reassign)(m.id)}
        />
      )}
    </Card>
  );
}
