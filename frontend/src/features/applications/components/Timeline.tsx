import { CheckmarkMIcon } from '@alfalab/icons-glyph/CheckmarkMIcon';
import { CrossMIcon } from '@alfalab/icons-glyph/CrossMIcon';

import type { TimelineEvent } from '@/features/applications/types';
import { formatDateTime } from '@/shared/lib/format';
import type { ApplicationStatus } from '@/shared/types/common';
import { cx, Text, uiStyles as s } from '@/shared/ui';

type Stage = { key: string; title: string; statuses: ApplicationStatus[] };

const BASE: Stage[] = [
  { key: 'draft', title: 'Черновик', statuses: ['draft'] },
  { key: 'submitted', title: 'Отправлена', statuses: ['submitted'] },
  { key: 'review', title: 'Проверка', statuses: ['in_review'] },
  { key: 'decision', title: 'Решение', statuses: ['approved', 'rejected'] },
  { key: 'signing', title: 'Подписание', statuses: ['signing'] },
  { key: 'issued', title: 'Выдача', statuses: ['issued'] },
];

export function Timeline({ status, events }: { status: ApplicationStatus; events: TimelineEvent[] }) {
  const seen = new Set(events.map((e) => e.status));
  const stages = [...BASE];

  if (seen.has('info_requested') || status === 'info_requested') {
    stages.splice(3, 0, { key: 'info', title: 'Уточнения', statuses: ['info_requested'] });
  }
  if (seen.has('counter_offer') || status === 'counter_offer') {
    const i = stages.findIndex((x) => x.key === 'decision');
    stages[i] = { key: 'decision', title: 'Предложение банка', statuses: ['counter_offer', 'approved', 'rejected'] };
  }

  const currentIdx = stages.findIndex((st) => st.statuses.includes(status));
  const terminalNegative = status === 'rejected' || status === 'cancelled';

  return (
    <ol className={s.timeline}>
      {stages.map((st, i) => {
        const event = [...events].reverse().find((e) => st.statuses.includes(e.status));

        const done =
          currentIdx > i ||
          (status === 'issued' && i === currentIdx) ||
          (currentIdx === -1 && st.statuses.some((x) => seen.has(x)));
        const current = i === currentIdx && status !== 'issued';
        const attention = current && (status === 'info_requested' || status === 'counter_offer' || status === 'approved' || status === 'signing');
        const negative = current && status === 'rejected';
        return (
          <li
            key={st.key}
            className={cx(
              s.timelineStep,
              done && s.timelineDone,
              current && !attention && !negative && s.timelineCurrent,
              attention && s.timelineAttention,
              negative && s.timelineNegative,
            )}
            aria-current={current ? 'step' : undefined}
          >
            <span className={s.timelineMarker}>{done ? <CheckmarkMIcon /> : negative ? <CrossMIcon /> : null}</span>
            <div className={s.timelineText}>
              <Text small medium={current || done} secondary={!current && !done} tag='div'>
                {st.key === 'decision' && status === 'rejected' ? 'Отказ' : st.title}
              </Text>
              {event && (done || current) && (
                <Text small secondary tag='div'>
                  {formatDateTime(event.at)}
                </Text>
              )}
            </div>
          </li>
        );
      })}
      {terminalNegative && status === 'cancelled' && (
        <li className={cx(s.timelineStep, s.timelineNegative)}>
          <span className={s.timelineMarker}>
            <CrossMIcon />
          </span>
          <div className={s.timelineText}>
            <Text small medium tag='div'>
              Отозвана
            </Text>
          </div>
        </li>
      )}
    </ol>
  );
}
