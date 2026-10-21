import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Amount } from '@alfalab/core-components/amount';
import { Skeleton } from '@alfalab/core-components/skeleton';
import { Table } from '@alfalab/core-components/table';
import { Tag } from '@alfalab/core-components/tag';
import { Typography } from '@alfalab/core-components/typography';
import { ChevronRightMIcon } from '@alfalab/icons-glyph/ChevronRightMIcon';

import { StatusLabel } from '@/features/applications/components/StatusLabel';
import { useApplications } from '@/features/applications/hooks';
import type { ApplicationSort, ApplicationSortField, ApplicationSummary } from '@/features/applications/types';
import { PRODUCT_ICONS } from '@/features/products/productIcons';
import { APPLICATION_GROUPS } from '@/shared/i18n/ru';
import { formatDate, formatRelative } from '@/shared/lib/format';
import type { Money } from '@/shared/types/common';
import { EmptyState, ErrorState, Text } from '@/shared/ui';

import styles from './ApplicationsTable.module.css';

const PER_PAGE_OPTIONS = [10, 25, 50];

type GroupId = (typeof APPLICATION_GROUPS)[number]['id'] | 'all';

function MoneyAmount({ money }: { money: Money }) {
  return (
    <Amount
      value={money.value}
      minority={100}

      currency='RUR'
      view='default'
      bold='none'
    />
  );
}

function amountShown(item: ApplicationSummary) {
  const differs = item.approved_amount !== null && item.approved_amount.value !== item.requested_amount.value;
  return { main: differs ? item.approved_amount! : item.requested_amount, requested: differs ? item.requested_amount : null };
}

export function ApplicationsTable({ readOnly }: { readOnly?: boolean }) {
  const navigate = useNavigate();
  const [group, setGroup] = useState<GroupId>('all');
  const [sort, setSort] = useState<ApplicationSort>('-created_at');
  const [pageIndex, setPageIndex] = useState(0);
  const [perPage, setPerPage] = useState(PER_PAGE_OPTIONS[0]);

  const statuses = APPLICATION_GROUPS.find((g) => g.id === group)?.statuses ?? [];
  const query = useApplications({ status: statuses, page: pageIndex + 1, page_size: perPage, sort }, true);
  const data = query.data;
  const counters = data?.counters;

  const handleGroup = (id: GroupId) => {
    setGroup(group === id ? 'all' : id);
    setPageIndex(0);
  };

  const handleSort = (field: ApplicationSortField) => {
    setSort((current) => (current === `-${field}` ? field : `-${field}`));
    setPageIndex(0);
  };

  const sortState = (field: ApplicationSortField) => (sort === `-${field}` ? true : sort === field ? false : undefined);

  const open = (item: ApplicationSummary) =>
    navigate(item.status === 'draft' && item.available_actions.includes('application.edit') && !readOnly ? `/applications/${item.id}/edit` : `/applications/${item.id}`);

  const pagesCount = data ? Math.max(1, Math.ceil(data.total / perPage)) : 1;

  return (
    <section className={styles.section}>
      <div className={styles.head}>
        <Typography.Title tag='h2' view='small' className={styles.title}>
          Мои заявки
        </Typography.Title>
      </div>

      <div className={styles.groups} role='group' aria-label='Фильтр заявок'>
        {APPLICATION_GROUPS.map((g) => (
          <Tag key={g.id} size={40} checked={group === g.id} onClick={() => handleGroup(g.id)}>
            {g.label}
            {counters && <span className={styles.counter}>{counters[g.id]}</span>}
          </Tag>
        ))}
      </div>

      <div className={styles.card}>
        {query.isError && !data ? (
          <ErrorState error={query.error} onRetry={() => query.refetch()} />
        ) : data && data.items.length === 0 ? (
          <EmptyState
            title='Здесь пока пусто'
            text={group === 'all' ? 'Когда вы подадите заявку на кредит, она появится в этом списке' : 'В этом разделе нет заявок'}
          />
        ) : (
          <>
            <div className={`${styles.desktop} ${query.isFetching && data ? styles.refreshing : ''}`}>
              <Table
                className={styles.table}
                pagination={
                  data && data.total > PER_PAGE_OPTIONS[0] ? (
                    <Table.Pagination
                      perPage={perPage}
                      currentPageIndex={pageIndex}
                      pagesCount={pagesCount}
                      possiblePerPage={PER_PAGE_OPTIONS}
                      onPageChange={setPageIndex}
                      onPerPageChange={(v) => {
                        setPerPage(v);
                        setPageIndex(0);
                      }}
                    />
                  ) : undefined
                }
              >
                <Table.THead>
                  <Table.THeadCell title='Продукт'>Продукт</Table.THeadCell>
                  <Table.TSortableHeadCell
                    title='Заявка'
                    width={190}
                    isSortedDesc={sortState('created_at')}
                    onSort={() => handleSort('created_at')}
                  >
                    Заявка
                  </Table.TSortableHeadCell>
                  <Table.TSortableHeadCell
                    title='Сумма'
                    width={190}
                    textAlign='right'
                    isSortedDesc={sortState('requested_amount')}
                    onSort={() => handleSort('requested_amount')}
                  >
                    Сумма
                  </Table.TSortableHeadCell>
                  <Table.THeadCell title='Срок' width={90} textAlign='right'>
                    Срок
                  </Table.THeadCell>
                  <Table.TSortableHeadCell
                    title='Статус'
                    width={300}
                    isSortedDesc={sortState('updated_at')}
                    onSort={() => handleSort('updated_at')}
                  >
                    Статус
                  </Table.TSortableHeadCell>
                </Table.THead>
                <Table.TBody>
                  {data ? data.items.map((item) => <Row key={item.id} item={item} onOpen={() => open(item)} />) : <SkeletonRows />}
                </Table.TBody>
              </Table>
            </div>

            <ul className={styles.mobile}>
              {data
                ? data.items.map((item) => <MobileCard key={item.id} item={item} onOpen={() => open(item)} />)
                : [0, 1, 2].map((i) => (
                    <li key={i} className={styles.mobileCard}>
                      <Skeleton visible className={styles.skeletonLine} />
                    </li>
                  ))}
              {data && data.items.length < data.total && (
                <li className={styles.mobileMore}>
                  <Text small secondary>
                    Показаны {data.items.length} из {data.total}.{' '}
                  </Text>
                  <button type='button' className={styles.moreButton} onClick={() => setPerPage(perPage + 10)}>
                    Показать ещё
                  </button>
                </li>
              )}
            </ul>
          </>
        )}
      </div>
    </section>
  );
}

function Row({ item, onOpen }: { item: ApplicationSummary; onOpen: () => void }) {
  const ProductIcon = PRODUCT_ICONS[item.product.code];
  const amount = amountShown(item);

  return (
    <Table.TRow onClick={onOpen}>
      <Table.TCell>
        <div className={styles.product}>
          <span className={styles.productIcon}>
            <ProductIcon />
          </span>
          <div className={styles.productText}>
            <Typography.Text view='primary-medium' weight='medium' tag='div'>
              {item.product.name}
            </Typography.Text>
            <Typography.Text view='primary-small' color='secondary' tag='div'>
              {item.purpose}
            </Typography.Text>
          </div>
        </div>
      </Table.TCell>
      <Table.TCell>
        <Typography.Text view='primary-small' tag='div'>
          {item.number}
        </Typography.Text>
        <Typography.Text view='primary-small' color='secondary' tag='div'>
          от {formatDate(item.created_at)}
        </Typography.Text>
      </Table.TCell>
      <Table.TCell>
        <Typography.Text view='primary-medium' weight='bold' tag='div'>
          <MoneyAmount money={amount.main} />
        </Typography.Text>
        {amount.requested && (
          <Typography.Text view='primary-small' color='secondary' tag='div'>
            запрошено <MoneyAmount money={amount.requested} />
          </Typography.Text>
        )}
      </Table.TCell>
      <Table.TCell>
        <Typography.Text view='primary-medium'>{item.approved_term_months ?? item.requested_term_months} мес.</Typography.Text>
      </Table.TCell>
      <Table.TCell>
        <StatusLabel status={item.status} small />
        {(item.required_action || item.awaiting_from) && (
          <Typography.Text view='primary-small' color='secondary' tag='div' className={styles.action}>
            {[item.awaiting_from && `Ждём: ${item.awaiting_from.name}`, item.required_action].filter(Boolean).join(' · ')}
          </Typography.Text>
        )}
        <Typography.Text view='primary-small' color='tertiary' tag='div' className={styles.action}>
          {formatRelative(item.updated_at)}
        </Typography.Text>
      </Table.TCell>
    </Table.TRow>
  );
}

function MobileCard({ item, onOpen }: { item: ApplicationSummary; onOpen: () => void }) {
  const ProductIcon = PRODUCT_ICONS[item.product.code];
  const amount = amountShown(item);
  return (
    <li>
      <button type='button' className={styles.mobileCard} onClick={onOpen}>
        <span className={styles.productIcon}>
          <ProductIcon />
        </span>
        <span className={styles.mobileBody}>
          <span className={styles.mobileTop}>
            <Typography.Text view='primary-medium' weight='medium'>
              {item.product.name}
            </Typography.Text>
            <Typography.Text view='primary-medium' weight='bold'>
              <MoneyAmount money={amount.main} />
            </Typography.Text>
          </span>
          <Typography.Text view='primary-small' color='secondary' tag='div'>
            {item.number} · {item.approved_term_months ?? item.requested_term_months} мес. · {formatRelative(item.updated_at)}
          </Typography.Text>
          <StatusLabel status={item.status} small />
          {item.required_action && (
            <Typography.Text view='primary-small' color='secondary' tag='div'>
              {item.required_action}
            </Typography.Text>
          )}
        </span>
        <ChevronRightMIcon className={styles.chevron} />
      </button>
    </li>
  );
}

function SkeletonRows() {
  return (
    <>
      {[0, 1, 2, 3].map((i) => (
        <Table.TRow key={i}>
          {[
            <Table.TCell key='p'>
              <div className={styles.product}>
                <Skeleton visible className={styles.skeletonIcon} />
                <Skeleton visible className={styles.skeletonLine} />
              </div>
            </Table.TCell>,
            ...[0, 1, 2, 3].map((c) => (
              <Table.TCell key={c}>
                <Skeleton visible className={styles.skeletonLineShort} />
              </Table.TCell>
            )),
          ]}
        </Table.TRow>
      ))}
    </>
  );
}
