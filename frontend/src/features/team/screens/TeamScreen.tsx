import { useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { ChevronRightMIcon } from '@alfalab/icons-glyph/ChevronRightMIcon';
import { DocumentLinesMIcon } from '@alfalab/icons-glyph/DocumentLinesMIcon';
import { PlusMIcon } from '@alfalab/icons-glyph/PlusMIcon';

import { can } from '@/app/access';
import { useCurrentHome } from '@/features/profile/components/AppShell/AppShell';
import { useTasks } from '@/features/tasks/hooks';
import { teamApi } from '@/features/team/api';
import { AccessDialog } from '@/features/team/components/AccessDialog';
import { AddMemberDialog } from '@/features/team/components/AddMemberDialog';
import t from '@/features/team/components/team.module.css';
import { useMembers } from '@/features/team/hooks';
import type { Member } from '@/features/team/types';
import { CompanyTab } from '@/features/team/screens/CompanyTab';
import { SigningTab } from '@/features/team/screens/SigningTab';
import { errorText, queryClient } from '@/shared/api/query';
import { keys } from '@/shared/api/queryKeys';
import { ROLE_LABELS } from '@/shared/i18n/ru';
import { appNo, norm, plural } from '@/shared/lib/format';
import { Avatar, Btn, Cell, IconCircle, InfoStrip, PageHead, Pill, SearchField, SkeletonLines, Stack, Table, Tabs, Text } from '@/shared/ui';

type TabId = 'team' | 'company' | 'signing';

export function TeamScreen() {
  const location = useLocation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const home = useCurrentHome();
  const tab: TabId = location.pathname.endsWith('/company') ? 'company' : location.pathname.endsWith('/signing') ? 'signing' : 'team';
  const canManage = can(home, 'manage_team');
  const [adding, setAdding] = useState(location.pathname.endsWith('/invite') || params.get('invite') === '1');

  return (
    <div>
      <PageHead
        title='Компания и команда'
        subtitle={tab === 'team' ? 'Сотрудники, доступ к заявкам и полномочия' : undefined}
        right={
          tab === 'team' && canManage ? (
            <Btn size='l' leftAddons={<PlusMIcon style={{ width: 20, height: 20 }} />} onClick={() => setAdding(true)}>
              Добавить сотрудника
            </Btn>
          ) : undefined
        }
      />
      <Tabs<TabId>
        value={tab}
        items={[
          { id: 'team', label: 'Команда', to: '/team' },
          { id: 'company', label: 'Данные компании', to: '/team/company' },
          { id: 'signing', label: 'Правила подписания', to: '/team/signing' },
        ]}
      />
      <div style={{ marginTop: 20 }}>
        {tab === 'team' && <TeamTab canManage={canManage} />}
        {tab === 'company' && <CompanyTab />}
        {tab === 'signing' && <SigningTab />}
      </div>
      {adding && (
        <AddMemberDialog
          companyName={home.company?.short_name ?? ''}
          onClose={() => {
            setAdding(false);
            if (location.pathname.endsWith('/invite') || params.get('invite')) navigate('/team', { replace: true });
          }}
        />
      )}
    </div>
  );
}

function accessText(m: Member) {
  const p = m.permissions;
  const main = p.includes('submit_applications') ? (p.includes('upload_documents') ? 'Заявки и документы' : 'Подбор и отправка заявок') : p.includes('upload_documents') ? 'Документы назначенных заявок' : 'Только просмотр';
  const sub = p.includes('sign') ? 'Подписание: полномочия подтверждены' : p.includes('submit_applications') ? 'Без права подписи' : 'Без отправки и подписи';
  return { main, sub };
}

function TeamTab({ canManage }: { canManage: boolean }) {
  const navigate = useNavigate();
  const home = useCurrentHome();
  const members = useMembers();
  const tasks = useTasks('all');
  const [query, setQuery] = useState('');
  const [access, setAccess] = useState<Member | null>(null);
  const [error, setError] = useState<string | null>(null);

  const approve = useMutation({
    mutationFn: (id: string) => teamApi.approve(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.members });
      void queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
    onError: (e) => setError(errorText(e)),
  });

  const q = norm(query.trim());
  const list = (members.data ?? []).filter((m) => m.status !== 'disabled').filter((m) => !q || norm(`${m.last_name} ${m.first_name} ${ROLE_LABELS[m.role]}`).includes(q));
  const tasksOf = (m: Member) => (tasks.data ?? []).filter((x) => x.assignee?.user_id === m.user_id);

  return (
    <Stack gap={16}>
      <SearchField value={query} onChange={setQuery} placeholder='Поиск по имени или должности' />
      {members.isLoading ? (
        <SkeletonLines lines={4} />
      ) : (
        <Table>
            <thead>
              <tr>
                <th>Сотрудник</th>
                <th>Доступ</th>
                <th>Задачи</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              {list.map((m) => {
                const name = `${m.first_name} ${m.last_name}`;
                const a = accessText(m);
                const own = tasksOf(m);
                const me = m.user_id === home.id;
                return (
                  <tr key={m.id}>
                    <td>
                      <Cell leading={<Avatar name={name} />} title={name} sub={`${ROLE_LABELS[m.role]}${me ? ' · это вы' : ''}`} />
                    </td>
                    <td>
                      {m.status === 'active' ? (
                        <Cell title={a.main} sub={a.sub} />
                      ) : (
                        <Pill small tone={m.status === 'pending_approval' ? 'yellow' : 'blue'}>
                          {m.status === 'pending_approval' ? 'Ждёт подтверждения' : 'Приглашён'}
                        </Pill>
                      )}
                    </td>
                    <td>
                      {own.length ? (
                        <Cell
                          title={`${own.length} ${plural(own.length, 'задача', 'задачи', 'задач')}`}
                          sub={
                            <>
                              {own[0].title}
                              {own[0].application ? ` по заявке ${appNo(own[0].application.number)}` : ''}
                            </>
                          }
                        />
                      ) : (
                        <span>Нет задач</span>
                      )}
                    </td>
                    <td>
                      {canManage && m.status === 'pending_approval' ? (
                        <Btn variant='outlineRed' size='m' loading={approve.isPending && approve.variables === m.id} onClick={() => approve.mutate(m.id)}>
                          Подтвердить
                        </Btn>
                      ) : canManage && !me && m.status === 'active' ? (
                        <Btn variant='outline' size='m' onClick={() => setAccess(m)}>
                          Настроить доступ
                        </Btn>
                      ) : (
                        <Btn variant='soft' size='m' onClick={() => setAccess(m)} disabled={!canManage}>
                          Посмотреть
                        </Btn>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
      )}
      {error && <Text color='negative' tag='div'>{error}</Text>}
      <InfoStrip>Должность и права доступа: разные настройки. Назначение задачи не выдаёт право подписи.</InfoStrip>
      <button type='button' className={t.sendRow} style={{ background: '#fff', font: 'inherit', textAlign: 'left', cursor: 'pointer' }} onClick={() => navigate('/team/signing')}>
        <span style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          <IconCircle icon={DocumentLinesMIcon} />
          <span>
            <b style={{ display: 'block', fontSize: 17 }}>Доступ и полномочия</b>
            <span className={t.muted}>Изменение прав, ограничение доступа и правила подписи</span>
          </span>
        </span>
        <ChevronRightMIcon style={{ width: 22, height: 22, color: 'var(--a-text-2)' }} />
      </button>
      <div className={t.muted}>Изменять доступы могут только уполномоченные пользователи.</div>
      {access && (
        <AccessDialog
          member={access}
          assigned={tasksOf(access)[0]?.application ? `заявка ${appNo(tasksOf(access)[0].application!.number)}` : undefined}
          onClose={() => setAccess(null)}
        />
      )}
    </Stack>
  );
}
