import type { ReactNode } from 'react';
import { Button } from '@alfalab/core-components/button';
import { Typography } from '@alfalab/core-components/typography';
import { DocumentLinesMIcon } from '@alfalab/icons-glyph/DocumentLinesMIcon';
import { ExclamationCircleMIcon } from '@alfalab/icons-glyph/ExclamationCircleMIcon';
import { LockClosedMIcon } from '@alfalab/icons-glyph/LockClosedMIcon';

import { isApiError } from '@/shared/api/client';
import { errorText } from '@/shared/api/query';

import { SkeletonLines } from './feedback';
import { Card, Stack, Text, uiStyles as s } from './layout';

export function LoadingState({ cards = 2 }: { cards?: number }) {
  return (
    <Stack gap={16} aria-busy='true'>
      {Array.from({ length: cards }, (_, i) => (
        <Card key={i}>
          <SkeletonLines lines={i === 0 ? 4 : 3} height={i === 0 ? 22 : 18} />
        </Card>
      ))}
    </Stack>
  );
}

export function EmptyState({ title, text, action }: { title: string; text?: ReactNode; action?: ReactNode }) {
  return (
    <div className={s.state}>
      <span className={s.stateIcon}>
        <DocumentLinesMIcon />
      </span>
      <Typography.Title tag='h3' view='xsmall' weight='bold'>
        {title}
      </Typography.Title>
      {text && (
        <Text secondary className={s.stateText}>
          {text}
        </Text>
      )}
      {action}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error?: unknown; onRetry?: () => void }) {
  if (isApiError(error, 'FORBIDDEN_ACTION') || isApiError(error, 'NO_COMPANY_ROLE')) {
    return <NoRightsState text={errorText(error)} />;
  }
  return (
    <div className={s.state} role='alert'>
      <span className={s.stateIcon} style={{ color: 'var(--color-light-graphic-negative, #ff5431)' }}>
        <ExclamationCircleMIcon />
      </span>
      <Typography.Title tag='h3' view='xsmall' weight='bold'>
        Не удалось загрузить данные
      </Typography.Title>
      <Text secondary className={s.stateText}>
        {isApiError(error, 'NOT_FOUND') ? 'Такой страницы нет или у вас нет к ней доступа' : errorText(error)}
      </Text>
      {onRetry && !isApiError(error, 'NOT_FOUND') && (
        <Button view='secondary' size={40} onClick={onRetry}>
          Повторить
        </Button>
      )}
    </div>
  );
}

export function NoRightsState({ text, title = 'Недостаточно прав' }: { text: ReactNode; title?: string }) {
  return (
    <div className={s.state}>
      <span className={s.stateIcon}>
        <LockClosedMIcon />
      </span>
      <Typography.Title tag='h3' view='xsmall' weight='bold'>
        {title}
      </Typography.Title>
      <Text secondary className={s.stateText}>
        {text}
      </Text>
    </div>
  );
}

export function QueryGate<T>({
  query,
  children,
  loading,
}: {
  query: { data: T | undefined; isLoading: boolean; isError: boolean; error: unknown; refetch: () => unknown };
  children: (data: T) => ReactNode;
  loading?: ReactNode;
}) {
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
