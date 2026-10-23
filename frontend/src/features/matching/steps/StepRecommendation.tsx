import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowLeftMIcon } from '@alfalab/icons-glyph/ArrowLeftMIcon';
import { ArrowRightMIcon } from '@alfalab/icons-glyph/ArrowRightMIcon';
import { ArrowsCwMIcon } from '@alfalab/icons-glyph/ArrowsCwMIcon';
import { ChevronDownMIcon } from '@alfalab/icons-glyph/ChevronDownMIcon';
import { DocumentLinesMIcon } from '@alfalab/icons-glyph/DocumentLinesMIcon';
import { ExclamationCircleMIcon } from '@alfalab/icons-glyph/ExclamationCircleMIcon';
import { ListBulletedMIcon } from '@alfalab/icons-glyph/ListBulletedMIcon';
import { QuestionCircleMIcon } from '@alfalab/icons-glyph/QuestionCircleMIcon';

import { applicationsApi } from '@/features/applications/api';
import { matchingApi } from '@/features/matching/api';
import type { MatchingSession, Recommendation, RecommendResponse } from '@/features/matching/types';
import { useProducts } from '@/features/products/hooks';
import { useCurrentHome } from '@/features/profile/components/AppShell/AppShell';
import { errorText, invalidateApplication } from '@/shared/api/query';
import { READINESS_STATUS } from '@/shared/i18n/ru';
import { formatMoney, formatMonths, formatPercent } from '@/shared/lib/format';
import { AiBadge, Btn, Dialog, ErrorState, SkeletonLines, Stack, TextLink, ToneLabel } from '@/shared/ui';

import m from '../matching.module.css';

type View = 'carousel' | 'why' | 'other';

export function StepRecommendation({ session, onClose }: { session: MatchingSession; onClose: () => void }) {
  const recommend = useQuery({
    queryKey: ['matching', session.id, 'recommend', session.updated_at],
    queryFn: () => matchingApi.recommend(session.id),
    staleTime: Infinity,
    retry: false,
  });

  if (!recommend.data) {
    return (
      <Dialog open onClose={onClose} title='Ваша рекомендация' subtitle='Подбираем варианты, это займёт до 30 секунд'>
        {recommend.isError ? <ErrorState error={recommend.error} onRetry={() => recommend.refetch()} /> : <SkeletonLines lines={6} />}
      </Dialog>
    );
  }
  return <Recommendations session={session} data={recommend.data} onClose={onClose} />;
}

function Recommendations({ session, data, onClose }: { session: MatchingSession; data: RecommendResponse; onClose: () => void }) {
  const navigate = useNavigate();
  const home = useCurrentHome();
  const products = useProducts(home.company?.legal_form);
  const all = [data.primary, ...data.alternatives];
  const [index, setIndex] = useState(0);
  const [view, setView] = useState<View>('carousel');
  const [error, setError] = useState<string | null>(null);
  const rec = all[index];
  const description = products.data?.find((p) => p.code === rec.product.code)?.description;
  const warning = data.warnings.find((w) => w.code === 'LOAD_ABOVE_THRESHOLD');

  const create = useMutation({
    mutationFn: (p: { rank: number; keep?: boolean }) =>
      applicationsApi.create({ source: 'recommendation', matching_session_id: session.id, recommendation_rank: p.rank, keep_requested: p.keep }),
    onSuccess: (app) => {
      invalidateApplication(app.id);
      navigate(`/applications/${app.id}/edit`);
    },
    onError: (e) => setError(errorText(e)),
  });

  if (view === 'why') {
    const reasons = [
      ...rec.reasons.map((r) => ({ title: r.text, text: r.data_ref ? reasonHint(r.code) : null })),
      {
        title: `Срок ${formatMonths(rec.term_months)}`,
        text: `Платёж ${formatPercent(rec.load.load_percent, 0)} от свободного денежного потока (допустимо до ${rec.load.threshold_percent}%)`,
      },
    ];
    return (
      <Dialog open onClose={onClose} title='Почему именно этот вариант?' subtitle={`${rec.product.name} · объяснение подбора`}>
        <Stack gap={16}>
          <div className={m.pinkBox}>
            <b>Мы изучили ваши ответы</b>
            <div className={m.small} style={{ color: 'var(--a-text)' }}>
              И подобрали вариант под заявленную потребность бизнеса.
            </div>
          </div>
          <div className={m.sectionTitle}>Что повлияло на рекомендацию</div>
          <ol className={m.reasons}>
            {reasons.map((r, i) => (
              <li key={r.title}>
                <span className={m.reasonNum}>{String(i + 1).padStart(2, '0')}</span>
                <span>
                  <b>{r.title}</b>
                  {r.text && <span className={m.small} style={{ display: 'block' }}>{r.text}</span>}
                </span>
              </li>
            ))}
          </ol>
          <AiBadge source={data.text_source} />
          <div className={m.final}>Окончательное решение за вами.</div>
          <Btn size='l' block loading={create.isPending} onClick={() => create.mutate({ rank: rec.rank })}>
            Выбрать этот вариант
          </Btn>
          <button type='button' className={m.softButton} onClick={() => setView('carousel')}>
            Назад к рекомендации
          </button>
        </Stack>
      </Dialog>
    );
  }

  if (view === 'other') {
    return (
      <Dialog open onClose={onClose} title='Подберём другой путь' subtitle='Не нужно заполнять анкету заново'>
        <Stack gap={14}>
          <div className={m.sectionTitle}>Как хотите продолжить?</div>
          <button type='button' className={`${m.pathCard} ${m.pathPink}`} onClick={() => navigate(`/match/${session.id}/step/1`)}>
            <b>
              <ArrowsCwMIcon className={m.pathIcon} /> Обновить рекомендации
            </b>
            <span>Измените сумму, срок или финансовые приоритеты. Мы учтём новые пожелания.</span>
          </button>
          <button type='button' className={`${m.pathCard} ${m.pathBlue}`} onClick={() => navigate(`/products?session=${session.id}`)}>
            <b>
              <ListBulletedMIcon className={m.pathIcon} /> Выбрать кредит самостоятельно
            </b>
            <span>Откройте каталог продуктов и сравните условия без алгоритма подбора.</span>
          </button>
          <div className={m.small}>Ваши ранее введённые данные сохранятся.</div>
          <button type='button' className={m.softButton} onClick={() => setView('carousel')}>
            Вернуться к рекомендациям
          </button>
        </Stack>
      </Dialog>
    );
  }

  return (
    <Dialog open onClose={onClose} title='Ваша рекомендация' subtitle={`Вариант ${index + 1} из ${all.length} · ${data.is_preliminary ? 'предварительный подбор' : 'подбор по вашим данным'}`}>
      <Stack gap={12}>
        <div className={m.recCard}>
          <div className={m.recNav}>
            <button type='button' className={m.arrow} disabled={index === 0} onClick={() => setIndex(index - 1)} aria-label='Предыдущий вариант'>
              <ArrowLeftMIcon />
            </button>
            <b>
              {index + 1} из {all.length}
            </b>
            <button type='button' className={m.arrow} disabled={index === all.length - 1} onClick={() => setIndex(index + 1)} aria-label='Следующий вариант'>
              <ArrowRightMIcon />
            </button>
          </div>
          {index > 0 && <div className={m.recLabel}>Рекомендуемый вариант</div>}
          <div className={m.recTitle}>
            {rec.product.name}
            {rec.product.is_fictional && <span className={m.small}> · вымышленный продукт</span>}
          </div>
          {description && <div className={m.small}>{description}</div>}
          <div className={m.recMain}>
            <span className={m.recAmount}>{formatMoney(rec.amount)}</span>
            <span className={m.recTerm}>{formatMonths(rec.term_months)}</span>
          </div>
          <div>
            {formatPercent(rec.rate_percent, 0)} годовых · ≈ {formatMoney(rec.monthly_payment)}/мес.
          </div>
          <div className={m.small} style={{ marginTop: 10 }}>
            Демо-условия. Не является одобрением.
          </div>
        </div>

        {index === 0 && warning && (
          <Expandable
            tone='yellow'
            icon={<ExclamationCircleMIcon />}
            title={rec.amount.value < data.requested.amount.value ? 'Снизили сумму, чтобы уменьшить нагрузку' : rec.term_months > data.requested.term_months ? 'Увеличили срок, чтобы снизить платёж' : 'Нагрузка выше рекомендуемой'}
            body={warning.text}
          />
        )}
        {index > 0 && <div className={m.altReason}>✓ {rec.reasons[0]?.text}</div>}

        {index === 0 && (
          <Expandable
            tone='white'
            icon={<DocumentLinesMIcon />}
            title={`Готовность компании: ${data.readiness.ok_count} из ${data.readiness.total}`}
            subtitle={data.readiness.ok_count < data.readiness.total ? 'Нужно уточнить документы' : 'Всё в порядке'}
            body={
              <Stack gap={6}>
                {data.readiness.items.map((i) => (
                  <ToneLabel key={i.code} tone={READINESS_STATUS[i.status].tone} small>
                    {i.title}
                  </ToneLabel>
                ))}
              </Stack>
            }
          />
        )}

        <button type='button' className={m.whyRow} onClick={() => setView('why')}>
          <QuestionCircleMIcon className={m.whyIcon} />
          <span style={{ flex: 1 }}>Почему именно этот вариант?</span>
          <ChevronDownMIcon className={m.whyChevron} />
        </button>

        {error && <div className={m.error}>{error}</div>}

        <Btn size='l' block loading={create.isPending && !create.variables?.keep} onClick={() => create.mutate({ rank: rec.rank })}>
          Продолжить с этим вариантом
        </Btn>
        {warning && index === 0 && (
          <Btn variant='outline' size='l' block loading={create.isPending && !!create.variables?.keep} onClick={() => create.mutate({ rank: 1, keep: true })}>
            Оставить исходный запрос ({formatMoney(data.requested.amount)})
          </Btn>
        )}
        <div style={{ textAlign: 'center', paddingTop: 4 }}>
          <TextLink tone='red' arrow onClick={() => setView('other')}>
            Ни один вариант не подошёл
          </TextLink>
        </div>
      </Stack>
    </Dialog>
  );
}

function reasonHint(code: string) {
  const hints: Record<string, string> = {
    purpose_fit: 'Продукт подходит для такой задачи.',
    business_age: 'Бизнес давно работает, текущие кредиты платятся вовремя.',
    seasonality: 'Платёж выдержит спад поступлений.',
    load_fit: 'Останется запас на непредвиденные расходы.',
    load_ok: 'Нагрузка в пределах нормы.',
  };
  return hints[code] ?? null;
}

function Expandable({
  tone,
  icon,
  title,
  subtitle,
  body,
}: {
  tone: 'yellow' | 'white';
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  body: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className={tone === 'yellow' ? m.expYellow : m.expWhite}>
      <button type='button' className={m.expHead} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className={tone === 'yellow' ? m.expIconYellow : m.expIcon}>{icon}</span>
        <span style={{ flex: 1 }}>
          <b>{title}</b>
          {subtitle && <span className={m.small} style={{ display: 'block' }}>{subtitle}</span>}
          {tone === 'yellow' && !open && <span className={m.expMore}>Подробнее</span>}
        </span>
        <ChevronDownMIcon className={m.whyChevron} style={{ transform: open ? 'rotate(180deg)' : undefined }} />
      </button>
      {open && <div className={m.expBody}>{body}</div>}
    </div>
  );
}

export type { Recommendation };
