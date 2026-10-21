import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@alfalab/core-components/button';

import { notificationsApi } from '@/features/notifications/api';
import { useNotifications } from '@/features/notifications/hooks';
import type { Notification } from '@/features/notifications/types';
import { queryClient } from '@/shared/api/query';
import { keys } from '@/shared/api/queryKeys';
import { formatRelative } from '@/shared/lib/format';
import { Card, EmptyState, PageHeader, QueryGate, Stack, Text } from '@/shared/ui';

import styles from '../notifications.module.css';

export function NotificationsScreen() {
  const navigate = useNavigate();
  const list = useNotifications();

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: keys.notifications });
    void queryClient.invalidateQueries({ queryKey: keys.home });
  };
  const read = useMutation({ mutationFn: (id: string) => notificationsApi.read(id), onSuccess: refresh });
  const readAll = useMutation({ mutationFn: notificationsApi.readAll, onSuccess: refresh });

  const open = (n: Notification) => {
    if (!n.read) read.mutate(n.id);
    if (n.route) navigate(n.route);
  };

  return (
    <div>
      <PageHeader
        title='Уведомления'
        right={
          list.data?.some((n) => !n.read) ? (
            <Button view='secondary' size={40} onClick={() => readAll.mutate()} loading={readAll.isPending}>
              Прочитать все
            </Button>
          ) : undefined
        }
      />
      <QueryGate query={list}>
        {(items) =>
          items.length === 0 ? (
            <Card>
              <EmptyState title='Уведомлений нет' text='Здесь появятся решения банка, запросы и задачи' />
            </Card>
          ) : (
            <Card style={{ padding: 8 }}>
              <ul className={styles.list}>
                {items.map((n) => (
                  <li key={n.id}>
                    <button type='button' className={`${styles.item} ${n.read ? '' : styles.unread}`} onClick={() => open(n)}>
                      <span className={styles.dot} aria-hidden />
                      <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
                        <Text medium={!n.read} tag='div'>
                          {n.title}
                        </Text>
                        <Text small secondary tag='div'>
                          {n.text}
                        </Text>
                      </Stack>
                      <Text small secondary>
                        {formatRelative(n.created_at)}
                      </Text>
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          )
        }
      </QueryGate>
    </div>
  );
}
