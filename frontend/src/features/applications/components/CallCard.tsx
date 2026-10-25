import { CallMIcon } from '@alfalab/icons-glyph/CallMIcon';

import type { CallNote } from '@/features/applications/types';
import { formatDateTime, formatLongDate } from '@/shared/lib/format';
import { Card, IconCircle, Pill, Stack, Text } from '@/shared/ui';

import s from './CallCard.module.css';

export function CallCard({ call }: { call: CallNote }) {
  return (
    <Card compact>
      <Stack gap={12}>
        <div className={s.head}>
          <IconCircle icon={CallMIcon} />
          <div className={s.title}>
            <b>{call.topic}</b>
            <Text small secondary>
              {formatDateTime(call.called_at)}
              {call.duration_minutes ? ` · ${call.duration_minutes} мин` : ''} · {call.author_name}
            </Text>
          </div>
          <Pill small>{call.stage_title}</Pill>
        </div>
        <Text>{call.summary}</Text>
        {call.agreements.length > 0 && (
          <div>
            <Text small medium tag='div'>
              Договорились
            </Text>
            <ul className={s.list}>
              {call.agreements.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </div>
        )}
        {call.next_step && (
          <div className={s.next}>
            <Text small medium tag='div'>
              Следующий шаг{call.next_step_due ? ` до ${formatLongDate(call.next_step_due)}` : ''}
            </Text>
            <Text small>{call.next_step}</Text>
          </div>
        )}
      </Stack>
    </Card>
  );
}

export function CallList({ calls, empty }: { calls: CallNote[]; empty?: string }) {
  if (!calls.length) return empty ? <Text secondary>{empty}</Text> : null;
  return (
    <Stack gap={10}>
      {calls.map((c) => (
        <CallCard key={c.id} call={c} />
      ))}
    </Stack>
  );
}
