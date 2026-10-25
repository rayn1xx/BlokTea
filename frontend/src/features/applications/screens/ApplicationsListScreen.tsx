import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { can } from '@/app/access';
import { AppStatusPill } from '@/features/applications/components/StatusLabel';
import { useApplications } from '@/features/applications/hooks';
import type { ApplicationSort, ApplicationSummary } from '@/features/applications/types';
import { useStartMatching } from '@/features/matching/lib';
import { useCurrentHome } from '@/features/profile/components/AppShell/AppShell';
import { APP_STATUS, APPLICATION_GROUPS } from '@/shared/i18n/ru';
import { appNo, formatLongDate, formatMoney, norm } from '@/shared/lib/format';
import { Btn, Cell, EmptyState, ErrorState, PageHead, SearchField, SelectField, SkeletonLines, Table, Tabs, TextLink } from '@/shared/ui';

import s from './ApplicationsListScreen.module.css';

type TabId = 'all' | (typeof APPLICATION_GROUPS)[number]['id'];

const SORTS: { value: ApplicationSort; label: string }[] = [
  { value: '-created_at', label: 'Сначала новые' },
  { value: 'created_at', label: 'Сначала старые' },
  { value: '-requested_amount', label: 'Сначала крупные' },
  { value: '-updated_at', label: 'Недавно изменённые' },
];

export function nextStep(app: ApplicationSummary) {
  return app.required_action ?? APP_STATUS[app.status].next;
}

export function actionFor(app: ApplicationSummary): { label: string; route: string; accent: boolean } {
  const open = `/applications/${app.id}`;
  if (app.status === 'draft' && app.available_actions.includes('application.edit')) return { label: 'Продолжить', route: `${open}/edit`, accent: true };
  if (app.status === 'info_requested' && app.available_actions.includes('info_request.respond')) return { label: 'Продолжить', route: open, accent: true };
  if (app.status === 'signing' && app.available_actions.includes('signing.sign')) return { label: 'Подписать', route: `${open}/signing`, accent: true };
  if ((app.status === 'approved' || app.status === 'counter_offer') && app.available_actions.includes('offer.accept')) return { label: 'Посмотреть', route: open, accent: true };
  return { label: 'Открыть', route: app.status === 'issued' ? open : open, accent: false };
}

export function ApplicationsListScreen() {
  const navigate = useNavigate();
  const home = useCurrentHome();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as TabId) ?? 'all';
  const [sort, setSort] = useState<ApplicationSort>('-created_at');
  const [query, setQuery] = useState('');
  const matching = useStartMatching();

  const statuses = APPLICATION_GROUPS.find((g) => g.id === tab)?.statuses ?? [];
  const list = useApplications({ status: statuses, page: 1, page_size: 100, sort }, true);
  const counters = list.data?.counters;
  const total = counters ? counters.drafts + counters.in_bank + counters.awaiting_signing + counters.finished : undefined;

  const q = norm(query.trim());
  const items = (list.data?.items ?? []).filter((a) => !q || norm(`${a.number} ${a.purpose} ${a.product.name}`).includes(q));

  return (
    <div>
      <PageHead
        back={{ label: 'Кредитование', to: '/home' }}
        title='Все заявки'
        subtitle='Статусы и следующие действия по заявкам компании'
        right={
          can(home, 'apply') ? (
            <Btn variant='outlineRed' size='l' onClick={matching.start} loading={matching.pending}>
              Новая заявка
            </Btn>
          ) : undefined
        }
      />
      <Tabs<TabId>
        value={tab}
        onChange={(id) => setParams(id === 'all' ? {} : { tab: id })}
        items={[
          { id: 'all', label: 'Все', count: total },
          ...APPLICATION_GROUPS.map((g) => ({ id: g.id as TabId, label: g.label, count: counters?.[g.id] })),
        ]}
      />
      <div className={s.toolbar}>
        <div className={s.search}>
          <SearchField value={query} onChange={setQuery} placeholder='Поиск по номеру или цели' />
        </div>
        <div className={s.sort}>
          <SelectField value={sort} options={SORTS} onChange={setSort} ariaLabel='Сортировка' />
        </div>
      </div>

      {list.isLoading ? (
        <SkeletonLines lines={6} />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState title='Заявок нет' text={q ? 'По запросу ничего не нашлось' : 'Когда вы подадите заявку, она появится здесь'} />
      ) : (
        <Table>
            <thead>
              <tr>
                <th>Заявка</th>
                <th>Сумма</th>
                <th>Статус и следующий шаг</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((a) => {
                const action = actionFor(a);
                return (
                  <tr key={a.id}>
                    <td>
                      <Cell title={a.purpose} sub={<>{a.status === 'draft' ? 'Черновик' : appNo(a.number)} · {formatLongDate(a.created_at)}</>} />
                    </td>
                    <td className={s.amount}>{formatMoney(a.approved_amount ?? a.requested_amount)}</td>
                    <td>
                      <AppStatusPill status={a.status} small />
                      <Cell sub={nextStep(a)} />
                    </td>
                    <td data-align='right'>
                      {action.accent ? (
                        <Btn variant='outlineRed' size='m' onClick={() => navigate(action.route)} className={s.action}>
                          {action.label}
                        </Btn>
                      ) : (
                        <TextLink arrow onClick={() => navigate(action.route)}>
                          {action.label}
                        </TextLink>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
      )}
      <div className={s.footer}>
        <span>Статусы обновляются автоматически</span>
        {list.data && (
          <span>
            Показано {items.length} из {list.data.total}
          </span>
        )}
      </div>
    </div>
  );
}
