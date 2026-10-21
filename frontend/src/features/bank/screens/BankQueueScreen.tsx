import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';

import { bankApi } from '@/features/bank/api';
import { QueueRow } from '@/features/bank/components/QueueRow';
import { useBankQueue } from '@/features/bank/hooks';
import type { BankQueueParams } from '@/features/bank/types';
import { errorText, queryClient } from '@/shared/api/query';
import { keys } from '@/shared/api/queryKeys';
import { Card, Chips, EmptyState, ErrorState, LoadingState, Note, PageHeader, Row, Stack, uiStyles as s } from '@/shared/ui';

type Filter = 'all' | 'mine' | 'risk' | 'stop';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'Все' },
  { value: 'mine', label: 'Мои' },
  { value: 'risk', label: 'Высокий риск' },
  { value: 'stop', label: 'Стоп-фактор' },
];

export function BankQueueScreen() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<'queue_time' | 'risk'>('queue_time');
  const [error, setError] = useState<string | null>(null);

  const params: BankQueueParams = {
    sort,
    mine: filter === 'mine' || undefined,
    risk: filter === 'risk' ? 'high' : undefined,
    checks: filter === 'stop' ? 'stop' : undefined,
  };
  const queue = useBankQueue(params);

  const take = useMutation({
    mutationFn: (id: string) => bankApi.take(id),
    onSuccess: (detail) => {
      queryClient.setQueryData(keys.bankApplication(detail.id), detail);
      void queryClient.invalidateQueries({ queryKey: ['bank'] });
      navigate(`/bank/applications/${detail.id}`);
    },
    onError: (e) => setError(errorText(e)),
  });

  return (
    <div>
      <PageHeader title='Очередь заявок' subtitle='Заявки после автопроверок. Авторешённые показаны внизу без действий' />
      <Stack gap={16}>
        <Row justify='space-between' gap={12}>
          <Chips options={FILTERS} value={filter} onChange={setFilter} />
          <Chips
            options={[
              { value: 'queue_time', label: 'Дольше ждут' },
              { value: 'risk', label: 'Сначала рискованные' },
            ]}
            value={sort}
            onChange={setSort}
          />
        </Row>
        {error && <Note tone='negative'>{error}</Note>}
        {queue.isLoading ? (
          <LoadingState />
        ) : queue.isError || !queue.data ? (
          <Card>
            <ErrorState error={queue.error} onRetry={() => queue.refetch()} />
          </Card>
        ) : queue.data.items.length === 0 ? (
          <Card>
            <EmptyState title='Очередь пуста' text='Новые заявки появятся здесь после автопроверок' />
          </Card>
        ) : (
          <Card style={{ padding: '8px 16px' }}>
            <div className={s.tableScroll}>
              <table className={`${s.table} ${s.tableClickable}`}>
                <thead>
                  <tr>
                    <th>№</th>
                    <th>Компания</th>
                    <th>Продукт и сумма</th>
                    <th className={s.right}>Балл</th>
                    <th>Автопроверки</th>
                    <th>В очереди</th>
                    <th>Ответственный</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {queue.data.items.map((item) => (
                    <QueueRow key={item.id} item={item} onOpen={() => navigate(`/bank/applications/${item.id}`)} onTake={() => take.mutate(item.id)} taking={take.isPending && take.variables === item.id} />
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </Stack>
    </div>
  );
}
