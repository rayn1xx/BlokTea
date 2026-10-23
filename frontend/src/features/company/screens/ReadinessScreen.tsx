import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { InformationCircleLineMIcon } from '@alfalab/icons-glyph/InformationCircleLineMIcon';

import { useReadiness } from '@/features/company/hooks';
import type { ReadinessItem } from '@/features/company/types';
import { UploadDialog } from '@/features/documents/components/UploadDialog';
import { formatShortDateTime } from '@/shared/lib/format';
import { AiBadge, PageHead, QueryGate, TextLink } from '@/shared/ui';

import r from '../readiness.module.css';

const STATE = {
  ok: { text: 'В порядке', cls: r.ok },
  warning: { text: 'Стоит проверить', cls: r.warn },
  fail: { text: 'Не хватает данных', cls: r.fail },
  unknown: { text: 'Нет данных', cls: r.unknown },
};

export function ReadinessScreen() {
  const readiness = useReadiness();
  return (
    <div className={r.page}>
      <PageHead back={{ label: 'Кредитование', to: '/home' }} title='Кредитная готовность компании' subtitle='На что обратить внимание перед новым обращением' />
      <QueryGate query={readiness}>{(data) => <Grid items={data.items} summary={data.summary_text} source={data.text_source} disclaimer={data.disclaimer} at={data.calculated_at} />}</QueryGate>
    </div>
  );
}

function Grid({ items, summary, source, disclaimer, at }: { items: ReadinessItem[]; summary: string; source: 'llm' | 'template'; disclaimer: string; at: string }) {
  const navigate = useNavigate();
  const [selected, setSelected] = useState<ReadinessItem | null>(items.find((i) => i.status !== 'ok') ?? null);
  const [upload, setUpload] = useState(false);

  return (
    <div>
      <div className={r.note}>
        <div>
          <b>Это оценка по доступным данным, а не установленная причина отказа банка.</b>
          <div className={r.small}>Выберите показатель: подсказка откроется под карточками.</div>
        </div>
        <AiBadge source={source} hint={false} />
      </div>
      <div className={r.grid}>
        {items.map((i) => {
          const s = STATE[i.status];
          return (
            <button key={i.code} type='button' className={`${r.card} ${s.cls} ${selected?.code === i.code ? r.selected : ''}`} onClick={() => setSelected(i)} aria-pressed={selected?.code === i.code}>
              <span className={r.cardHead}>
                <b>{i.title}</b>
                <InformationCircleLineMIcon className={r.info} />
              </span>
              <span className={r.state}>
                {s.text} · {i.value_text}
              </span>
              <span className={r.hint}>Нажмите для пояснения →</span>
            </button>
          );
        })}
      </div>
      {selected && (
        <section className={r.detail}>
          <h2 className={r.detailTitle}>
            <InformationCircleLineMIcon className={r.info} /> {selected.title} · {STATE[selected.status].text}
          </h2>
          <p className={r.detailText}>
            {selected.explanation}. {selected.how_to_improve ?? 'Здесь всё в порядке, ничего делать не нужно.'}
          </p>
          {selected.action && selected.action.type !== 'none' && (
            <TextLink tone='red' arrow onClick={() => (selected.action!.type === 'upload_document' ? setUpload(true) : navigate(selected.action!.route ?? '/documents'))}>
              {selected.action.type === 'upload_document' ? 'Загрузить документ' : 'Открыть документы'}
            </TextLink>
          )}
        </section>
      )}
      <div className={r.small} style={{ marginTop: 14 }}>
        {summary}. {disclaimer}. Рассчитано {formatShortDateTime(at)}.
      </div>
      {upload && selected?.action && <UploadDialog open title={selected.title} documentType={selected.action.document_type ?? undefined} onClose={() => setUpload(false)} />}
    </div>
  );
}
