import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { Typography } from '@alfalab/core-components/typography';

import { CallList } from '@/features/applications/components/CallCard';
import { StatusLabel } from '@/features/applications/components/StatusLabel';
import { bankApi } from '@/features/bank/api';
import { CallNoteForm } from '@/features/bank/components/CallNoteForm';
import { useBankApplication } from '@/features/bank/hooks';
import type { BankApplicationDetail, CheckResult } from '@/features/bank/types';
import { errorText, queryClient } from '@/shared/api/query';
import { keys } from '@/shared/api/queryKeys';
import { DOCUMENT_STATUS, TEXTS } from '@/shared/i18n/ru';
import { businessAge } from '@/shared/lib/business';
import { formatDateTime, formatMoney, formatPercent } from '@/shared/lib/format';
import { AiBadge, Bar, Btn, Card, Grid, InfoRow, InfoRows, Note, PageHead, QueryGate, Row, SmallTag, SourceTag, Stack, Table, Text, ToneLabel } from '@/shared/ui';

const CHECK_TITLES: Record<CheckResult['source'], string> = {
  registry: 'ЕГРЮЛ / ЕГРИП',
  credit_bureau: 'Бюро кредитных историй',
  turnover: 'Обороты по счетам',
  fns_transparent: 'ФНС «Прозрачный бизнес»',
  load: 'Долговая нагрузка',
};

export function BankApplicationScreen() {
  const { id = '' } = useParams();
  const app = useBankApplication(id);
  return <QueryGate query={app}>{(data) => <BankApplicationView app={data} />}</QueryGate>;
}

function BankApplicationView({ app }: { app: BankApplicationDetail }) {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [callOpen, setCallOpen] = useState(false);
  const set = (d: BankApplicationDetail) => queryClient.setQueryData(keys.bankApplication(app.id), d);

  const summary = useMutation({ mutationFn: () => bankApi.aiSummary(app.id), onSuccess: set, onError: (e) => setError(errorText(e)) });
  const rerun = useMutation({ mutationFn: () => bankApi.rerunChecks(app.id), onSuccess: set, onError: (e) => setError(errorText(e)) });

  const company = app.company.company;
  const sc = app.scoring;
  const canDecide = app.status === 'in_review' || app.status === 'submitted';
  const load = app.load_at_submit;

  return (
    <div>
      <PageHead
        title={`Заявка ${app.number}`}
        subtitle={`${company.short_name} · ${app.product.name} · ${formatMoney(app.requested_amount)} на ${app.requested_term_months} мес.`}
        right={
          <Row gap={12}>
            <StatusLabel status={app.status} />
            <Btn variant='outline' onClick={() => navigate('/bank/queue')}>
              К очереди
            </Btn>
            {canDecide && (
              <Btn onClick={() => navigate(`/bank/applications/${app.id}/decision`)}>
                Принять решение
              </Btn>
            )}
          </Row>
        }
      />

      <Stack gap={16}>
        {app.client_warning_accepted && <Note tone='attention'>Клиент оставил сумму вопреки предупреждению о нагрузке выше порога</Note>}
        {app.decision && (
          <Note tone='info' title={`Решение: ${app.decision.type === 'approved' ? 'одобрено' : app.decision.type === 'counter_offer' ? 'другие условия' : 'отказ'}`}>
            {app.decision.explanation_text}
          </Note>
        )}
        {error && <Note tone='negative'>{error}</Note>}

        <Grid>
          <Card
            title='Автопроверки'
            right={
              <Btn variant='ghost' size='s' onClick={() => rerun.mutate()} loading={rerun.isPending}>
                Повторить проверки
              </Btn>
            }
          >
            <Stack gap={12}>
              {app.checks.map((c) => (
                <div key={c.source}>
                  <Row justify='space-between' gap={8}>
                    <Row gap={8}>
                      <Text medium>{CHECK_TITLES[c.source]}</Text>
                      {c.is_mock && <SmallTag>{TEXTS.mockCheck}</SmallTag>}
                    </Row>
                    <ToneLabel tone={c.status === 'ok' ? 'positive' : c.status === 'warning' ? 'attention' : 'negative'} small>
                      {c.status === 'ok' ? 'в норме' : c.status === 'warning' ? 'внимание' : c.status === 'stop' ? 'стоп-фактор' : 'ошибка'}
                    </ToneLabel>
                  </Row>
                  <Text small secondary tag='div'>
                    {c.summary}
                  </Text>
                </div>
              ))}
            </Stack>
          </Card>

          <Card title='Скоринг' right={<Typography.Title tag='div' view='small' weight='bold'>{sc.total}</Typography.Title>}>
            <Stack gap={12}>
              {sc.factors.map((f) => (
                <Stack key={f.code} gap={4}>
                  <Row justify='space-between'>
                    <Text small>
                      {f.title}: {f.value_text}
                    </Text>
                    <Text small medium>
                      {f.points} из {f.max_points}
                    </Text>
                  </Row>
                  <Bar value={(f.points / f.max_points) * 100} tone={f.points / f.max_points >= 0.6 ? 'green' : f.points / f.max_points >= 0.3 ? 'yellow' : 'red'} />
                </Stack>
              ))}
              <Text small secondary>
                Пороги: одобрение от {sc.thresholds.approve_min}, другие условия от {sc.thresholds.counter_offer_min}, ручное рассмотрение от {sc.thresholds.manual_review_min}. Нагрузка до {sc.thresholds.load_threshold_percent}%
              </Text>
              <Text small>
                Рекомендация модели:{' '}
                <b>{{ approved: 'одобрить', counter_offer: 'предложить другие условия', manual_review: 'ручное рассмотрение', rejected: 'отказать' }[sc.outcome]}</b>
              </Text>
              {sc.stop_factors.length > 0 && <Note tone='negative'>Стоп-факторы: {sc.stop_factors.join(', ')}</Note>}
            </Stack>
          </Card>
        </Grid>

        <Grid>
          <Card title='Финансы и нагрузка'>
            <InfoRows>
              <InfoRow label='Компания'>
                {company.short_name}, {businessAge(company.registration_date)}
              </InfoRow>
              <InfoRow label='Поступления'>
                {formatMoney(app.finance.monthly_inflow_avg.value)} <SourceTag source={app.finance.monthly_inflow_avg.source} />
              </InfoRow>
              <InfoRow label='Операционные расходы'>{formatMoney(app.finance.monthly_operating_outflow_avg.value)}</InfoRow>
              <InfoRow label='Свободный поток'>{formatMoney(app.finance.free_cash_flow.value)}</InfoRow>
              <InfoRow label='Текущие платежи'>{formatMoney(app.finance.debts.total_monthly_payment)}</InfoRow>
              {load && (
                <>
                  <InfoRow label='Новый платёж'>{formatMoney(load.new_payment)}</InfoRow>
                  <InfoRow label='Нагрузка'>
                    <ToneLabel tone={load.load_percent > load.threshold_percent ? 'negative' : 'positive'} small>
                      {formatPercent(load.load_percent)}
                    </ToneLabel>
                    <Text small secondary>
                      порог {load.threshold_percent}%
                    </Text>
                  </InfoRow>
                </>
              )}
              {app.finance.seasonality && <InfoRow label='Сезонность'>{app.finance.seasonality.text}</InfoRow>}
            </InfoRows>
          </Card>

          <Card
            title='ИИ-резюме'
            right={
              <Btn variant='ghost' size='s' onClick={() => summary.mutate()} loading={summary.isPending}>
                Обновить резюме
              </Btn>
            }
          >
            {app.ai_summary ? (
              <Stack gap={12}>
                <AiBadge source={app.ai_summary.text_source} hint={false} />
                <Text>{app.ai_summary.text}</Text>
                <div>
                  <Text small medium tag='div'>
                    Риски
                  </Text>
                  {app.ai_summary.risks.map((r) => (
                    <Text key={r} small tag='div'>
                      • {r}
                    </Text>
                  ))}
                </div>
                <div>
                  <Text small medium tag='div'>
                    Проверить
                  </Text>
                  {app.ai_summary.to_check.map((r) => (
                    <Text key={r} small tag='div'>
                      • {r}
                    </Text>
                  ))}
                </div>
                <Text small secondary>
                  {TEXTS.aiBankNote}
                </Text>
              </Stack>
            ) : (
              <Stack gap={8}>
                <Text secondary>Резюме ещё не сформировано</Text>
                <Text small secondary>
                  {TEXTS.aiBankNote}
                </Text>
              </Stack>
            )}
          </Card>
        </Grid>

        <Card
          title='Звонки с клиентом'
          right={
            !callOpen && (
              <Btn variant='ghost' size='s' onClick={() => setCallOpen(true)}>
                Записать итоги звонка
              </Btn>
            )
          }
        >
          <Stack gap={14}>
            {callOpen && <CallNoteForm app={app} onDone={() => setCallOpen(false)} />}
            <CallList calls={app.calls} empty='Звонков пока не было. Запишите итоги после разговора: клиент увидит их в карточке заявки' />
          </Stack>
        </Card>

        <Card title='Документы'>
          {app.documents.length === 0 ? (
            <Text secondary>Документов нет</Text>
          ) : (
            <Table variant='plain'>
                <thead>
                  <tr>
                    <th>Документ</th>
                    <th>Статус</th>
                    <th>ИИ-проверка</th>
                    <th>Загружен</th>
                  </tr>
                </thead>
                <tbody>
                  {app.documents.map((d) => (
                    <tr key={d.id}>
                      <td>
                        <Text small medium tag='div'>
                          {d.title}
                        </Text>
                        <Text small secondary tag='div'>
                          {d.file_name}
                        </Text>
                      </td>
                      <td>
                        <ToneLabel tone={DOCUMENT_STATUS[d.status].tone} small>
                          {DOCUMENT_STATUS[d.status].label}
                        </ToneLabel>
                      </td>
                      <td>
                        {d.analysis?.status === 'done' ? (
                          <Text small>
                            {d.analysis.checks.filter((c) => c.passed).length} из {d.analysis.checks.length} проверок
                            {d.analysis.issues.length ? `, замечаний: ${d.analysis.issues.length}` : ''}
                          </Text>
                        ) : (
                          <Text small secondary>
                            {d.analysis?.status === 'unavailable' ? 'ручная проверка' : d.origin === 'alfa_lk' ? 'из Альфа-Бизнеса' : 'нет'}
                          </Text>
                        )}
                      </td>
                      <td>
                        <Text small>{formatDateTime(d.uploaded_at)}</Text>
                      </td>
                    </tr>
                  ))}
                </tbody>
            </Table>
          )}
        </Card>

        <Grid>
          <Card title='История'>
            <Stack gap={10}>
              {[...app.timeline].reverse().map((e, i) => (
                <div key={i}>
                  <Text small secondary tag='div'>
                    {formatDateTime(e.at)}
                  </Text>
                  <Text small tag='div'>
                    {e.title}
                    {e.description ? `: ${e.description}` : ''}
                  </Text>
                </div>
              ))}
            </Stack>
          </Card>
          <Card title='Аудит'>
            {app.audit.length === 0 ? (
              <Text secondary>Действий пока не было</Text>
            ) : (
              <Stack gap={10}>
                {[...app.audit].reverse().map((a, i) => (
                  <div key={i}>
                    <Text small secondary tag='div'>
                      {formatDateTime(a.at)} · {a.actor}
                    </Text>
                    <Text small tag='div'>
                      {a.action}
                      {a.details ? `: ${a.details}` : ''}
                    </Text>
                  </div>
                ))}
              </Stack>
            )}
          </Card>
        </Grid>
      </Stack>
    </div>
  );
}
