import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Button } from '@alfalab/core-components/button';
import { Skeleton } from '@alfalab/core-components/skeleton';

import { applicationsApi } from '@/features/applications/api';
import { matchingApi } from '@/features/matching/api';
import { ReadinessDetails } from '@/features/matching/components/ReadinessDetails';
import { RecommendationCard } from '@/features/matching/components/RecommendationCard';
import { Footer } from '@/features/matching/components/StepFooter';
import type { MatchingSession, RecommendResponse } from '@/features/matching/types';
import { errorText, invalidateApplication } from '@/shared/api/query';
import { READINESS_STATUS, TEXTS } from '@/shared/i18n/ru';
import { formatMoney } from '@/shared/lib/format';
import { AiBadge, Card, CardTitle, ErrorState, LinkButton, Note, Row, SmallTag, Stack, Text, ToneLabel, uiStyles as s } from '@/shared/ui';

import styles from '../matching.module.css';

export function StepRecommendation({ session }: { session: MatchingSession }) {
  const recommend = useQuery({
    queryKey: ['matching', session.id, 'recommend', session.updated_at],
    queryFn: () => matchingApi.recommend(session.id),
    staleTime: Infinity,
    retry: false,
  });

  if (recommend.isLoading) {
    return (
      <Card>
        <Stack gap={16}>
          <Text medium>Подбираем варианты…</Text>
          <Text small secondary>
            Считаем нагрузку и сравниваем продукты. Это займёт до 30 секунд
          </Text>
          <Skeleton visible>
            <div style={{ height: 180, borderRadius: 16 }} />
          </Skeleton>
          <Skeleton visible>
            <div style={{ height: 80, borderRadius: 16 }} />
          </Skeleton>
        </Stack>
      </Card>
    );
  }
  if (recommend.isError || !recommend.data) {
    return (
      <Card>
        <ErrorState error={recommend.error} onRetry={() => recommend.refetch()} />
      </Card>
    );
  }
  return <RecommendationView session={session} data={recommend.data} />;
}

function RecommendationView({ session, data }: { session: MatchingSession; data: RecommendResponse }) {
  const navigate = useNavigate();
  const all = [data.primary, ...data.alternatives];
  const [rank, setRank] = useState(data.primary.rank);
  const [showReadiness, setShowReadiness] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chosen = all.find((r) => r.rank === rank) ?? data.primary;
  const loadWarning = data.warnings.find((w) => w.code === 'LOAD_ABOVE_THRESHOLD');

  const create = useMutation({
    mutationFn: (params: { rank: number; keep?: boolean }) =>
      applicationsApi.create({
        source: 'recommendation',
        matching_session_id: session.id,
        recommendation_rank: params.rank,
        keep_requested: params.keep,
      }),
    onSuccess: (app) => {
      invalidateApplication(app.id);
      navigate(`/applications/${app.id}/edit`);
    },
    onError: (e) => setError(errorText(e)),
  });

  return (
    <Stack gap={16}>
      <Row gap={12}>
        {data.is_preliminary && <SmallTag tone='attention'>предварительно</SmallTag>}
        <AiBadge source={data.text_source} />
      </Row>

      <div className={s.mainAside}>
        <Stack gap={16}>
          <RecommendationCard rec={chosen} main />

          {loadWarning && (
            <Note
              tone='attention'
              title='Нагрузка выше рекомендуемой'
              action={
                <Row gap={8}>
                  <Button view='primary' size={40} onClick={() => create.mutate({ rank: 1 })} loading={create.isPending && create.variables?.rank === 1 && !create.variables?.keep}>
                    Оформить на {formatMoney(data.primary.amount)}
                  </Button>
                  <Button view='secondary' size={40} onClick={() => create.mutate({ rank: 1, keep: true })} loading={create.isPending && !!create.variables?.keep}>
                    Оставить {formatMoney(data.requested.amount)}
                  </Button>
                </Row>
              }
            >
              {loadWarning.text}
            </Note>
          )}
          {data.warnings
            .filter((w) => w.code !== 'LOAD_ABOVE_THRESHOLD')
            .map((w) => (
              <Note key={w.code} tone={w.code === 'DATA_STALE' ? 'attention' : 'info'}>
                {w.text}
              </Note>
            ))}

          {data.alternatives.length > 0 && (
            <Card>
              <CardTitle>Другие варианты</CardTitle>
              <div className={s.grid2}>
                {all
                  .filter((r) => r.rank !== rank)
                  .map((r) => (
                    <button key={r.rank} type='button' className={styles.altCard} onClick={() => setRank(r.rank)}>
                      <RecommendationCard rec={r} />
                    </button>
                  ))}
              </div>
            </Card>
          )}

          {error && <Note tone='negative'>{error}</Note>}

          <Note tone='neutral'>{TEXTS.notADecision}</Note>
        </Stack>

        <Stack gap={16}>
          <Card>
            <CardTitle right={<Text small secondary>{`${data.readiness.ok_count} из ${data.readiness.total}`}</Text>}>Готовность</CardTitle>
            <div className={s.chips}>
              {data.readiness.items.map((i) => (
                <ToneLabel key={i.code} tone={READINESS_STATUS[i.status].tone} small>
                  {i.title}
                </ToneLabel>
              ))}
            </div>
            <div style={{ marginTop: 12 }}>
              <LinkButton onClick={() => setShowReadiness((v) => !v)}>{showReadiness ? 'Скрыть' : 'Подробнее'}</LinkButton>
            </div>
            {showReadiness && <ReadinessDetails amount={chosen.amount.value / 100} term={chosen.term_months} />}
          </Card>
          <Card compact>
            <Text small secondary>
              {data.submit_requirements_text}
            </Text>
          </Card>
        </Stack>
      </div>

      <Footer
        left={
          <Button view='secondary' size={56} onClick={() => navigate(`/match/${session.id}/step/1`)}>
            Изменить ответы
          </Button>
        }
        right={
          <Button view='primary' size={56} onClick={() => create.mutate({ rank })} loading={create.isPending && create.variables?.rank === rank && !create.variables?.keep}>
            Перейти к заявке
          </Button>
        }
      />
    </Stack>
  );
}
