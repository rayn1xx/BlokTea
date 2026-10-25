import { CheckmarkMIcon } from '@alfalab/icons-glyph/CheckmarkMIcon';

import { cx } from '@/shared/lib/cx';

import s from './StageLine.module.css';

export type TimelineStage = { key: string; title: string; time?: string | null; state: 'done' | 'current' | 'future' | 'negative' };

export function StageLine({ stages }: { stages: TimelineStage[] }) {
  return (
    <ol className={s.timeline}>
      {stages.map((st) => (
        <li key={st.key} className={cx(s.step, st.state !== 'future' && s[st.state])} aria-current={st.state === 'current' ? 'step' : undefined}>
          <span className={s.marker}>{st.state === 'done' && <CheckmarkMIcon />}</span>
          <div>
            <div className={s.title}>{st.title}</div>
            {st.time && <div className={s.time}>{st.time}</div>}
          </div>
        </li>
      ))}
    </ol>
  );
}
