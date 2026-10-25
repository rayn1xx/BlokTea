import type { ReactNode } from 'react';
import { DocumentLinesMIcon } from '@alfalab/icons-glyph/DocumentLinesMIcon';
import { ExclamationCircleMIcon } from '@alfalab/icons-glyph/ExclamationCircleMIcon';
import { LockClosedMIcon } from '@alfalab/icons-glyph/LockClosedMIcon';

import { isApiError } from '@/shared/api/client';
import { errorText } from '@/shared/api/query';
import { cx } from '@/shared/lib/cx';

import { Btn } from '../Button/Btn';
import { Card } from '../Card/Card';
import { SkeletonLines } from '../Feedback/Hints';
import { Stack } from '../Layout/Layout';
import type { Icon } from '../types';

import s from './PageState.module.css';

function State({ icon: IconCmp, tone, title, text, action, role }: { icon: Icon; tone?: 'negative'; title: string; text?: ReactNode; action?: ReactNode; role?: 'alert' }) {
  return (
    <div className={s.state} role={role}>
      <span className={cx(s.icon, tone && s[tone])}>
        <IconCmp />
      </span>
      <h3 className={s.title}>{title}</h3>
      {text && <div className={s.text}>{text}</div>}
      {action}
    </div>
  );
}

export function LoadingState({ cards = 2 }: { cards?: number }) {
  return (
    <div aria-busy='true'>
      <Stack gap={16}>
        {Array.from({ length: cards }, (_, i) => (
          <Card key={i}>
            <SkeletonLines lines={i === 0 ? 4 : 3} height={i === 0 ? 22 : 18} />
          </Card>
        ))}
      </Stack>
    </div>
  );
}

export function EmptyState({ title, text, action }: { title: string; text?: ReactNode; action?: ReactNode }) {
  return <State icon={DocumentLinesMIcon} title={title} text={text} action={action} />;
}

export function NoRightsState({ text, title = 'Недостаточно прав' }: { text: ReactNode; title?: string }) {
  return <State icon={LockClosedMIcon} title={title} text={text} />;
}

export function ErrorState({ error, onRetry }: { error?: unknown; onRetry?: () => void }) {
  if (isApiError(error, 'FORBIDDEN_ACTION') || isApiError(error, 'NO_COMPANY_ROLE')) {
    return <NoRightsState text={errorText(error)} />;
  }
  const notFound = isApiError(error, 'NOT_FOUND');
  return (
    <State
      icon={ExclamationCircleMIcon}
      tone='negative'
      role='alert'
      title='Не удалось загрузить данные'
      text={notFound ? 'Такой страницы нет или у вас нет к ней доступа' : errorText(error)}
      action={
        onRetry && !notFound ? (
          <Btn variant='soft' onClick={onRetry}>
            Повторить
          </Btn>
        ) : undefined
      }
    />
  );
}

type QueryLike<T> = { data: T | undefined; isLoading: boolean; isError: boolean; error: unknown; refetch: () => unknown };

export function QueryGate<T>({ query, children, loading }: { query: QueryLike<T>; children: (data: T) => ReactNode; loading?: ReactNode }) {
  if (query.isLoading) return <>{loading ?? <LoadingState />}</>;
  if (query.isError || query.data === undefined) {
    return (
      <Card>
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      </Card>
    );
  }
  return <>{children(query.data)}</>;
}
