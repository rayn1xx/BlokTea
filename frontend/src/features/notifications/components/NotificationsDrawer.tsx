import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { SidePanel } from '@alfalab/core-components/side-panel';
import { ArrowUpMIcon } from '@alfalab/icons-glyph/ArrowUpMIcon';
import { BellMIcon } from '@alfalab/icons-glyph/BellMIcon';
import { DocumentLinesMIcon } from '@alfalab/icons-glyph/DocumentLinesMIcon';
import { PencilMIcon } from '@alfalab/icons-glyph/PencilMIcon';
import { UserMIcon } from '@alfalab/icons-glyph/UserMIcon';
import { UserPlusMIcon } from '@alfalab/icons-glyph/UserPlusMIcon';

import { notificationsApi } from '@/features/notifications/api';
import { useNotifications } from '@/features/notifications/hooks';
import type { Notification } from '@/features/notifications/types';
import { queryClient } from '@/shared/api/query';
import { keys } from '@/shared/api/queryKeys';
import { formatDayMonth, formatTime } from '@/shared/lib/format';
import { EmptyState, ErrorState, IconCircle, SkeletonLines, Tabs, TextLink } from '@/shared/ui';

import n from './NotificationsDrawer.module.css';

function iconFor(item: Notification) {
  const t = item.title.toLowerCase();
  if (t.includes('подпис')) return PencilMIcon;
  if (t.includes('загрузил') || t.includes('документ')) return ArrowUpMIcon;
  if (t.includes('сотрудник') || t.includes('доступ')) return UserPlusMIcon;
  if (t.includes('передал') || t.includes('передан')) return UserMIcon;
  if (t.includes('запрос') || t.includes('заявк')) return DocumentLinesMIcon;
  return BellMIcon;
}

function groupOf(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(Date.now() - 864e5);
  if (d.toDateString() === today.toDateString()) return 'Сегодня';
  if (d.toDateString() === yesterday.toDateString()) return 'Вчера';
  return 'Ранее';
}

export function NotificationsDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const list = useNotifications();
  const [tab, setTab] = useState<'all' | 'unread'>('all');

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: keys.notifications });
    void queryClient.invalidateQueries({ queryKey: keys.home });
  };
  const read = useMutation({ mutationFn: (id: string) => notificationsApi.read(id), onSuccess: refresh });
  const readAll = useMutation({ mutationFn: notificationsApi.readAll, onSuccess: refresh });

  const items = (list.data ?? []).filter((x) => tab === 'all' || !x.read);
  const unread = (list.data ?? []).filter((x) => !x.read).length;
  const groups = ['Сегодня', 'Вчера', 'Ранее']
    .map((g) => ({ title: g, items: items.filter((x) => groupOf(x.created_at) === g) }))
    .filter((g) => g.items.length);

  const openItem = (item: Notification) => {
    if (!item.read) read.mutate(item.id);
    if (item.route) {
      onClose();
      navigate(item.route);
    }
  };

  return (
    <SidePanel open={open} onClose={onClose} size={500} breakpoint={768}>
      <SidePanel.Header title='Уведомления' hasCloser />
      <SidePanel.Content>
        <div className={n.top}>
          <Tabs
            items={[
              { id: 'all', label: 'Все' },
              { id: 'unread', label: 'Непрочитанные', count: unread },
            ]}
            value={tab}
            onChange={setTab}
          />
          {unread > 0 && (
            <TextLink tone='blue' onClick={() => readAll.mutate()}>
              Прочитать все
            </TextLink>
          )}
        </div>

        {list.isLoading ? (
          <SkeletonLines lines={4} />
        ) : list.isError ? (
          <ErrorState error={list.error} onRetry={() => list.refetch()} />
        ) : groups.length === 0 ? (
          <EmptyState title='Уведомлений нет' text='Здесь появятся решения банка, запросы и задачи' />
        ) : (
          groups.map((g) => (
            <section key={g.title} className={n.group}>
              <h3 className={n.groupTitle}>{g.title}</h3>
              {g.items.map((item) => {
                const Icon = iconFor(item);
                return (
                  <article key={item.id} className={`${n.item} ${item.read ? '' : n.unread}`}>
                    {!item.read && <span className={n.dot} aria-label='Не прочитано' />}
                    <IconCircle icon={Icon} style={{ background: '#fff' }} />
                    <div className={n.body}>
                      <div className={n.title}>{item.title}</div>
                      <div className={n.text}>{item.text}</div>
                      <div className={n.meta}>
                        <span>{g.title === 'Ранее' ? formatDayMonth(item.created_at) : formatTime(item.created_at)}</span>
                        {item.route && (
                          <TextLink tone='blue' arrow onClick={() => openItem(item)}>
                            Открыть
                          </TextLink>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </section>
          ))
        )}
        <p className={n.footer}>Здесь отображаются события, доступные вам по правам.</p>
      </SidePanel.Content>
    </SidePanel>
  );
}
