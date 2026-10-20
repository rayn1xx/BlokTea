import { useEffect, useState } from 'react';
import { Amount } from '@alfalab/core-components/amount';
import { Button } from '@alfalab/core-components/button';
import { Skeleton } from '@alfalab/core-components/skeleton';
import { Table } from '@alfalab/core-components/table';
import { Tab, Tabs } from '@alfalab/core-components/tabs';
import { Typography } from '@alfalab/core-components/typography';

import { getApplications } from '../../api/applications';
import type {
  ApplicationListResponse,
  ApplicationSort,
  ApplicationSortField,
  ApplicationSummary,
  Money,
} from '../../models';

import { PRODUCT_ICONS, STATUS_FILTERS, STATUS_META } from './statuses';
import styles from './ApplicationsTable.module.css';

const PER_PAGE_OPTIONS = [10, 25, 50];

const dateFormat = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

function formatDate(iso: string) {
  return dateFormat.format(new Date(iso)).replace(' г.', '');
}

function MoneyAmount({ money }: { money: Money }) {
  return (
    <Amount
      value={money.value}
      minority={100}
      // Core DS обозначает рубль кодом RUR
      currency={money.currency === 'RUB' ? 'RUR' : (money.currency as 'RUR')}
      view='default'
      bold='none'
    />
  );
}

function ApplicationRow({ item }: { item: ApplicationSummary }) {
  const status = STATUS_META[item.status];
  const ProductIcon = PRODUCT_ICONS[item.product.code];
  const offerDiffers =
    item.approved_amount !== null && item.approved_amount.value !== item.requested_amount.value;

  return (
    <Table.TRow>
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
          <MoneyAmount money={offerDiffers ? item.approved_amount! : item.requested_amount} />
        </Typography.Text>
        {offerDiffers && (
          <Typography.Text view='primary-small' color='secondary' tag='div'>
            запрошено <MoneyAmount money={item.requested_amount} />
          </Typography.Text>
        )}
      </Table.TCell>

      <Table.TCell>
        <Typography.Text view='primary-medium'>
          {item.approved_term_months ?? item.requested_term_months} мес.
        </Typography.Text>
      </Table.TCell>

      <Table.TCell>
        <div className={`${styles.status} ${styles[status.tone]}`}>
          <span className={styles.dot} />
          <Typography.Text view='primary-small' weight='medium'>
            {status.label}
          </Typography.Text>
        </div>
        {item.required_action && (
          <Typography.Text view='primary-small' color='secondary' tag='div' className={styles.action}>
            {item.required_action}
          </Typography.Text>
        )}
      </Table.TCell>
    </Table.TRow>
  );
}

function SkeletonRows({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <Table.TRow key={i}>
          {[
            <Table.TCell key='product'>
              <div className={styles.product}>
                <Skeleton visible className={styles.skeletonIcon} />
                <div className={styles.productText}>
                  <Skeleton visible className={styles.skeletonLine} />
                  <Skeleton visible className={styles.skeletonLineShort} />
                </div>
              </div>
            </Table.TCell>,
            ...[0, 1, 2, 3].map((cell) => (
              <Table.TCell key={cell}>
                <Skeleton visible className={styles.skeletonLineShort} />
              </Table.TCell>
            )),
          ]}
        </Table.TRow>
      ))}
    </>
  );
}

export function ApplicationsTable() {
  const [filterId, setFilterId] = useState(STATUS_FILTERS[0].id);
  const [sort, setSort] = useState<ApplicationSort>('-created_at');
  const [pageIndex, setPageIndex] = useState(0);
  const [perPage, setPerPage] = useState(PER_PAGE_OPTIONS[0]);
  const [data, setData] = useState<ApplicationListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const statuses = STATUS_FILTERS.find((f) => f.id === filterId)?.statuses ?? [];

    setLoading(true);
    setError(false);

    getApplications({ status: statuses, page: pageIndex + 1, page_size: perPage, sort })
      .then((response) => {
        if (!cancelled) setData(response);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [filterId, sort, pageIndex, perPage, reloadKey]);

  const handleFilterChange = (id: string) => {
    setFilterId(id);
    setPageIndex(0);
    setData(null);
  };

  const handleSort = (field: ApplicationSortField) => {
    // первый клик — по убыванию, повторный — по возрастанию
    setSort((current) => (current === `-${field}` ? field : `-${field}`));
    setPageIndex(0);
  };

  const sortState = (field: ApplicationSortField) => {
    if (sort === `-${field}`) return true;
    if (sort === field) return false;
    return undefined;
  };

  const handlePerPageChange = (value: number) => {
    setPerPage(value);
    setPageIndex(0);
  };

  const pagesCount = data ? Math.max(1, Math.ceil(data.total / perPage)) : 1;
  const isEmpty = data !== null && data.items.length === 0;

  return (
    <section className={styles.section}>
      <Typography.Title tag='h2' view='medium' className={styles.title}>
        Заявки на кредит
      </Typography.Title>

      <Tabs
        view='primary'
        size='s'
        selectedId={filterId}
        onChange={(_, { selectedId }) => handleFilterChange(String(selectedId))}
        className={styles.tabs}
      >
        {STATUS_FILTERS.map((filter) => (
          <Tab key={filter.id} id={filter.id} title={filter.label} />
        ))}
      </Tabs>

      <div className={styles.card}>
        {error ? (
          <div className={styles.placeholder}>
            <Typography.Text view='primary-medium'>Не удалось загрузить заявки</Typography.Text>
            <Button view='secondary' size={40} onClick={() => setReloadKey((k) => k + 1)}>
              Повторить
            </Button>
          </div>
        ) : isEmpty ? (
          <div className={styles.placeholder}>
            <Typography.Text view='primary-medium' weight='medium'>
              Здесь пока пусто
            </Typography.Text>
            <Typography.Text view='primary-small' color='secondary'>
              {filterId === 'all'
                ? 'Когда вы подадите заявку на кредит, она появится в этом списке'
                : 'В этом разделе нет заявок'}
            </Typography.Text>
          </div>
        ) : (
          <div className={loading && data ? styles.refreshing : undefined}>
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
                    onPerPageChange={handlePerPageChange}
                  />
                ) : undefined
              }
            >
              <Table.THead>
                <Table.THeadCell title='Продукт'>Продукт</Table.THeadCell>
                <Table.TSortableHeadCell
                  title='Заявка'
                  width={200}
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
                <Table.THeadCell title='Срок' width={100} textAlign='right'>
                  Срок
                </Table.THeadCell>
                <Table.THeadCell title='Статус' width={290}>
                  Статус
                </Table.THeadCell>
              </Table.THead>

              <Table.TBody>
                {data ? (
                  data.items.map((item) => <ApplicationRow key={item.id} item={item} />)
                ) : (
                  <SkeletonRows count={5} />
                )}
              </Table.TBody>
            </Table>
          </div>
        )}
      </div>
    </section>
  );
}
