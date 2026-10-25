import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { ArrowRightMIcon } from '@alfalab/icons-glyph/ArrowRightMIcon';

import { applicationsApi } from '@/features/applications/api';
import type { ApplicationDetail, Decision } from '@/features/applications/types';
import { useFinance } from '@/features/company/hooks';
import { matchingApi } from '@/features/matching/api';
import { isApiError } from '@/shared/api/client';
import { errorText, invalidateApplication } from '@/shared/api/query';
import { ERRORS, TEXTS } from '@/shared/i18n/ru';
import { appNo, formatLongDate, formatMoney, formatMonths, formatPercent } from '@/shared/lib/format';
import type { Money } from '@/shared/types/common';
import { AiBadge, Btn, Dialog, Grid, Metrics, PageHead, Pill, Stack, TextLink } from '@/shared/ui';

import d from './DecisionView.module.css';

export function DecisionView({ app }: { app: ApplicationDetail }) {
  const decision = app.decision!;
  const amount = app.approved_amount ?? app.requested_amount;
  const term = app.approved_term_months ?? app.requested_term_months;
  return (
    <div className={d.page}>
      <PageHead
        back={{ label: 'Все заявки', to: '/applications' }}
        title={`Заявка ${appNo(app.number)} · Решение банка`}
        subtitle={`${app.product.name} · ${decision.type === 'counter_offer' ? `заявка на ${formatMoney(app.requested_amount)} · ${formatMonths(app.requested_term_months)}` : `${formatMoney(amount)} · ${formatMonths(term)}`}`}
      />
      {decision.type === 'approved' && <Approved app={app} decision={decision} />}
      {decision.type === 'counter_offer' && <CounterOffer app={app} decision={decision} />}
      {decision.type === 'rejected' && <Rejected app={app} decision={decision} />}
    </div>
  );
}

function useAccept(app: ApplicationDetail) {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const accept = useMutation({
    mutationFn: () => applicationsApi.acceptOffer(app.id),
    onSuccess: () => {
      invalidateApplication(app.id);
      navigate(`/applications/${app.id}/signing`);
    },
    onError: (e) => setError(isApiError(e, 'OFFER_EXPIRED') ? ERRORS.offerExpired : errorText(e)),
  });
  return { accept, error };
}

function useNewMatching(app: ApplicationDetail, decline: boolean) {
  const navigate = useNavigate();
  return useMutation({
    mutationFn: async () => {
      if (decline) await applicationsApi.declineOffer(app.id);
      const s = await matchingApi.create();
      await matchingApi.patch(s.id, {
        need: { purpose: app.purpose_code, amount: app.requested_amount, term_months: app.requested_term_months, need_type: 'one_time', disbursement: 'lump_sum', urgency: 'week' },
      });
      return s.id;
    },
    onSuccess: (id) => {
      invalidateApplication(app.id);
      navigate(`/match/${id}/step/1`);
    },
  });
}

function Approved({ app, decision }: { app: ApplicationDetail; decision: Decision }) {
  const { accept, error } = useAccept(app);
  const offered = decision.offered!;
  const total: Money = { value: offered.amount.value + offered.overpayment.value, currency: 'RUB' };
  const canAccept = app.available_actions.includes('offer.accept');
  return (
    <Stack gap={24}>
      <section className={d.green}>
        <Pill tone='green' caps>
          Одобрено
        </Pill>
        <h2 className={d.title}>Кредит одобрен</h2>
        <Metrics
          items={[
            { value: formatMoney(offered.amount), label: 'Сумма' },
            { value: formatMonths(offered.term_months), label: 'Срок' },
            { value: `≈ ${formatMoney(offered.monthly_payment)}/мес`, label: 'Платёж' },
            { value: `≈ ${formatMoney(total)}`, label: 'Всего к возврату', hint: `ставка ${formatPercent(offered.rate_percent, 0)} годовых` },
          ]}
        />
        {decision.offer_valid_until && <div className={d.muted}>Условия действуют до {formatLongDate(decision.offer_valid_until)}.</div>}
      </section>
      <div>
        <h3 className={d.subtitle}>Что дальше</h3>
        <section className={d.card}>
          <b className={d.cardTitle}>Перейти к подписанию</b>
          <div className={d.text}>Договор подписывает руководитель, поручительство подписывает второй собственник.</div>
          {canAccept ? (
            <Btn size='l' onClick={() => accept.mutate()} loading={accept.isPending} rightAddons={<ArrowRightMIcon style={{ width: 18, height: 18 }} />} className={d.wide}>
              К подписанию
            </Btn>
          ) : (
            <div className={d.muted}>{TEXTS.ownerDecides}</div>
          )}
          {error && <div className={d.error}>{error}</div>}
        </section>
      </div>
      <TextLink tone='muted' to='/applications'>
        Вернуться к заявкам
      </TextLink>
    </Stack>
  );
}

function CounterOffer({ app, decision }: { app: ApplicationDetail; decision: Decision }) {
  const finance = useFinance();
  const { accept, error } = useAccept(app);
  const decline = useNewMatching(app, true);
  const [confirmDecline, setConfirmDecline] = useState(false);
  const offered = decision.offered!;
  const canAccept = app.available_actions.includes('offer.accept');

  const loadOf = (payment: Money) => {
    if (!finance.data) return null;
    const free = finance.data.free_cash_flow.value.value;
    return free ? Math.round(((payment.value + finance.data.debts.total_monthly_payment.value) / free) * 100) : null;
  };
  const requestedLoad = app.load_at_submit ? Math.round(app.load_at_submit.load_percent) : null;
  const requestedPayment = app.load_at_submit?.new_payment;
  const offeredLoad = loadOf(offered.monthly_payment);

  return (
    <Stack gap={24}>
      <section className={d.yellow}>
        <div className={d.row}>
          <Pill tone='yellow' caps>
            Предложение банка
          </Pill>
          <AiBadge source={decision.text_source} hint={false} />
        </div>
        <h2 className={d.title}>Банк готов выдать кредит на других условиях</h2>
        <div className={d.compare}>
          <div className={d.box}>
            <div className={d.muted}>Вы просили</div>
            <div className={d.big}>{formatMoney(decision.requested.amount)}</div>
            <div>
              {formatMonths(decision.requested.term_months)}
              {requestedPayment ? ` · платёж ≈ ${formatMoney(requestedPayment)}` : ''}
            </div>
            {requestedLoad !== null && <div className={d.bad}>нагрузка {requestedLoad}%</div>}
          </div>
          <ArrowRightMIcon className={d.arrow} />
          <div className={`${d.box} ${d.boxGood}`}>
            <div className={d.muted}>Банк предлагает</div>
            <div className={d.big}>{formatMoney(offered.amount)}</div>
            <div>
              {formatMonths(offered.term_months)} · платёж ≈ {formatMoney(offered.monthly_payment)}
            </div>
            {offeredLoad !== null && <div className={d.good}>нагрузка {offeredLoad}%</div>}
          </div>
        </div>
        <div className={d.text}>Почему: {decision.explanation_text}</div>
        {decision.offer_valid_until && <div className={d.muted}>Условия действуют до {formatLongDate(decision.offer_valid_until)}.</div>}
      </section>

      <div>
        <h3 className={d.subtitle}>Как хотите продолжить?</h3>
        <div className={d.choices}>
          <section className={d.card}>
            <b className={d.cardTitle}>Принять предложение</b>
            <div className={d.text}>Перейти к подписанию договора</div>
            <Btn size='l' block disabled={!canAccept} onClick={() => accept.mutate()} loading={accept.isPending} rightAddons={<ArrowRightMIcon style={{ width: 18, height: 18 }} />}>
              Принять
            </Btn>
          </section>
          <section className={d.card}>
            <b className={d.cardTitle}>Отказаться</b>
            <div className={d.text}>Покажем другие варианты без повторного ввода данных</div>
            <Btn variant='outline' size='l' block disabled={!app.available_actions.includes('offer.decline')} onClick={() => setConfirmDecline(true)} rightAddons={<ArrowRightMIcon style={{ width: 18, height: 18 }} />}>
              Посмотреть варианты
            </Btn>
          </section>
        </div>
        <div className={d.muted} style={{ marginTop: 10 }}>
          Принять предложение может руководитель или собственник
        </div>
        {error && <div className={d.error}>{error}</div>}
      </div>
      <TextLink tone='muted' to='/applications'>
        Вернуться к заявкам
      </TextLink>

      {confirmDecline && (
        <Dialog open onClose={() => setConfirmDecline(false)} title='Отказаться от предложения?'>
          <Stack gap={16}>
            <div>Заявка закроется. Мы сразу откроем подбор с вашими прошлыми ответами.</div>
            <Grid gap={12}>
              <Btn variant='outline' size='l' block onClick={() => setConfirmDecline(false)}>
                Вернуться
              </Btn>
              <Btn size='l' block loading={decline.isPending} onClick={() => decline.mutate()}>
                Отказаться
              </Btn>
            </Grid>
          </Stack>
        </Dialog>
      )}
    </Stack>
  );
}

function Rejected({ app, decision }: { app: ApplicationDetail; decision: Decision }) {
  const navigate = useNavigate();
  const again = useNewMatching(app, false);
  const negative = decision.factors.filter((f) => f.impact === 'negative');
  return (
    <Stack gap={24}>
      <section className={d.red}>
        <Pill tone='white' caps>
          <span style={{ color: 'var(--a-red)' }}>Отказано</span>
        </Pill>
        <h2 className={d.title}>К сожалению, заявка не одобрена</h2>
        <div className={d.text}>{decision.explanation_text}</div>
        {negative.length > 0 && <div className={d.text}>Что повлияло: {negative.map((f) => f.title.toLowerCase()).join(', ')}.</div>}
        <div className={d.muted}>Решение относится к этой заявке. Можно рассмотреть другие варианты.</div>
      </section>
      <div>
        <h3 className={d.subtitle}>Как хотите продолжить?</h3>
        <div className={d.choices}>
          <section className={d.card}>
            <b className={d.cardTitle}>Оценить готовность компании</b>
            <div className={d.text}>Проверить показатели, документы и получить подсказки.</div>
            <Btn size='l' block onClick={() => navigate(`/readiness?application=${app.id}`)} rightAddons={<ArrowRightMIcon style={{ width: 18, height: 18 }} />}>
              Открыть оценку
            </Btn>
          </section>
          <section className={d.card}>
            <b className={d.cardTitle}>Подобрать другой кредит</b>
            <div className={d.text}>Изменить сумму, срок или продукт без повторного ввода.</div>
            <Btn size='l' block loading={again.isPending} onClick={() => again.mutate()} rightAddons={<ArrowRightMIcon style={{ width: 18, height: 18 }} />}>
              Перейти к подбору
            </Btn>
          </section>
        </div>
      </div>
      <TextLink tone='muted' to='/applications'>
        Вернуться к заявкам
      </TextLink>
    </Stack>
  );
}
