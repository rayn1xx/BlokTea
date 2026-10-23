import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CheckmarkCircleMIcon } from '@alfalab/icons-glyph/CheckmarkCircleMIcon';
import { ClockLineMIcon } from '@alfalab/icons-glyph/ClockLineMIcon';
import { InformationCircleLineMIcon } from '@alfalab/icons-glyph/InformationCircleLineMIcon';

import { isDemoMode } from '@/app/env';
import { useApplication } from '@/features/applications/hooks';
import type { ApplicationDetail } from '@/features/applications/types';
import { useLoans } from '@/features/loans/hooks';
import { useCurrentHome } from '@/features/profile/components/AppShell/AppShell';
import { signingApi } from '@/features/signing/api';
import { useSigning } from '@/features/signing/hooks';
import type { SigningState } from '@/features/signing/types';
import { requestFile } from '@/shared/api/client';
import { errorText, invalidateApplication, queryClient } from '@/shared/api/query';
import { keys } from '@/shared/api/queryKeys';
import { ROLE_SHORT, SIGNING_DOCUMENT_LABELS } from '@/shared/i18n/ru';
import { appNo, formatMoney, formatMonths, formatPercent } from '@/shared/lib/format';
import type { Challenge, Money } from '@/shared/types/common';
import { Avatar, Bar, Btn, Dialog, Metrics, PageHead, Panel, Pill, QueryGate, Stack, TextField, TextLink, kit } from '@/shared/ui';

import g from '../signing.module.css';

export function SigningScreen() {
  const { id = '' } = useParams();
  const signing = useSigning(id);
  const app = useApplication(id, true);
  return <QueryGate query={signing}>{(state) => (app.data ? <SigningView app={app.data} state={state} /> : null)}</QueryGate>;
}

export function ContractMetrics({ amount, term, payment, overpayment, rate }: { amount: Money; term: number; payment: Money; overpayment: Money; rate: number }) {
  return (
    <Metrics
      items={[
        { value: formatMoney(amount), label: 'Сумма' },
        { value: formatMonths(term), label: 'Срок' },
        { value: `≈ ${formatMoney(payment)}/мес`, label: 'Платёж' },
        { value: `≈ ${formatMoney({ value: amount.value + overpayment.value, currency: 'RUB' })}`, label: 'Всего к возврату', hint: `ставка ${formatPercent(rate, 0)} годовых` },
      ]}
    />
  );
}

function SigningView({ app, state }: { app: ApplicationDetail; state: SigningState }) {
  const navigate = useNavigate();
  const home = useCurrentHome();
  const loans = useLoans();
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [code, setCode] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [preview, setPreview] = useState<{ title: string; text: string } | null>(null);
  const [reminded, setReminded] = useState<string[]>([]);
  const [signedAt, setSignedAt] = useState<number | null>(null);

  const offered = app.decision?.offered;
  const amount = app.approved_amount ?? app.requested_amount;
  const term = app.approved_term_months ?? app.requested_term_months;
  const done = state.signed_count === state.required_count;
  const loan = loans.data?.find((l) => l.application_id === app.id);

  useEffect(() => {
    if (state.can_current_user_sign && !challenge && signedAt !== state.signed_count) {
      signingApi
        .challenge(app.id)
        .then(setChallenge)
        .catch((e) => setError(errorText(e)));
    }
  }, [state.can_current_user_sign, state.signed_count, signedAt, challenge, app.id]);

  useEffect(() => {
    if (app.status === 'issued') void queryClient.invalidateQueries({ queryKey: keys.loans });
  }, [app.status]);

  const sign = async () => {
    if (!challenge || !code.trim()) {
      setError('Введите код подтверждения');
      return;
    }
    setPending(true);
    setError(null);
    try {
      await signingApi.confirm(app.id, { challenge_id: challenge.challenge_id, code: code.trim() });
      setCode('');
      setSignedAt(state.signed_count);
      setChallenge(null);
      invalidateApplication(app.id);
      void queryClient.invalidateQueries({ queryKey: keys.signing(app.id) });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setPending(false);
    }
  };

  const openContract = async () => {
    const doc = state.documents.find((d) => d.type === (state.current_user_document ?? 'contract')) ?? state.documents[0];
    if (!doc) return;
    try {
      const blob = await requestFile(doc.url.replace('/api/v1', ''));
      setPreview({ title: doc.title, text: await blob.text() });
    } catch (e) {
      setError(errorText(e));
    }
  };

  return (
    <div className={g.page}>
      <PageHead
        back={{ label: `К заявке ${appNo(app.number)}`, to: `/applications/${app.id}` }}
        title={`Подписание договора · заявка ${appNo(app.number)}`}
        subtitle={`${app.product.name} · ${formatMoney(amount)} · ${formatMonths(term)}`}
        right={
          <Btn variant='outline' size='l' onClick={openContract}>
            Открыть договор
          </Btn>
        }
      />
      <Stack gap={16}>
        <Panel>
          <div className={g.section}>Условия договора</div>
          <ContractMetrics amount={amount} term={term} payment={offered?.monthly_payment ?? app.monthly_payment_estimate} overpayment={offered?.overpayment ?? { value: 0, currency: 'RUB' }} rate={app.rate_percent} />
        </Panel>

        <div>
          <div className={g.progressHead}>
            Подписано {state.signed_count} из {state.required_count}
          </div>
          <Bar value={(state.signed_count / Math.max(1, state.required_count)) * 100} tone='green' />
        </div>

        <Stack gap={10}>
          {state.signers.map((s) => {
            const me = s.person.user_id === home.id;
            return (
              <div key={`${s.order}-${s.person.user_id}`} className={g.signer}>
                <span style={{ flex: 1 }}>
                  <b>{s.person.name}</b> · {ROLE_SHORT[s.person.role]} · {SIGNING_DOCUMENT_LABELS[s.document].toLowerCase()}
                </span>
                {s.status === 'signed' ? (
                  <Pill tone='green' small icon={<CheckmarkCircleMIcon style={{ width: 14, height: 14 }} />}>
                    Подписано
                  </Pill>
                ) : (
                  <>
                    {!me && app.available_actions.includes('signing.remind') && (
                      <TextLink
                        tone='blue'
                        disabled={reminded.includes(s.person.user_id)}
                        onClick={async () => {
                          await signingApi.remind(app.id, s.person.user_id);
                          setReminded((r) => [...r, s.person.user_id]);
                        }}
                      >
                        {reminded.includes(s.person.user_id) ? 'Напомнили' : 'Напомнить'}
                      </TextLink>
                    )}
                    <Pill tone='yellow' small>
                      {me ? 'Ждём вашу подпись' : 'Ждём подпись'}
                    </Pill>
                  </>
                )}
              </div>
            );
          })}
        </Stack>

        {done && app.status === 'issued' ? (
          <Panel tone='green'>
            <b>Все подписали, кредит выдан.</b>{' '}
            {loan && (
              <TextLink arrow onClick={() => navigate(`/loans/${loan.id}`)}>
                Перейти к кредиту
              </TextLink>
            )}
          </Panel>
        ) : state.can_current_user_sign ? (
          <section className={kit.box}>
            <h2 className={kit.boxTitle} style={{ marginBottom: 14 }}>
              Ваша подпись
            </h2>
            <div className={g.signRow}>
              <div className={g.code}>
                <TextField value={code} onChange={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))} placeholder='Код подтверждения' inputMode='numeric' error={!!error} />
              </div>
              <Btn size='l' loading={pending} onClick={sign} className={g.signButton}>
                Подписать
              </Btn>
            </div>
            {error && <div className={g.error}>{error}</div>}
          </section>
        ) : (
          <Panel>
            {state.signers.some((s) => s.person.user_id === home.id && s.status === 'signed')
              ? 'Вы подписали. Ждём остальных подписантов.'
              : `Режим просмотра: вы не подписант по правилам компании. Подписывает: ${state.signers
                  .filter((s) => s.status !== 'signed')
                  .map((s) => s.person.name)
                  .join(', ')}.`}
          </Panel>
        )}

        {state.can_current_user_sign && (
          <div className={g.muted}>
            {isDemoMode() && challenge?.demo_code ? `Демо-код: ${challenge.demo_code}. ` : ''}В реальном продукте код приходит в кабинет, без SMS.
          </div>
        )}
        <div>
          <TextLink underline onClick={() => setRulesOpen(true)}>
            Правила подписи
          </TextLink>
        </div>
        <TextLink tone='muted' to='/applications'>
          Вернуться к заявкам
        </TextLink>
      </Stack>

      {rulesOpen && <SigningRulesDialog app={app} state={state} onClose={() => setRulesOpen(false)} />}
      {preview && (
        <Dialog open onClose={() => setPreview(null)} title={preview.title} size={800}>
          <pre className={g.preview}>{preview.text}</pre>
        </Dialog>
      )}
    </div>
  );
}

function SigningRulesDialog({ app, state, onClose }: { app: ApplicationDetail; state: SigningState; onClose: () => void }) {
  const navigate = useNavigate();
  return (
    <Dialog open onClose={onClose} title='Правила подписи' subtitle={`По заявке ${appNo(app.number)}`}>
      <Stack gap={14}>
        <div>
          Для завершения сделки нужны подписи {state.required_count === 2 ? 'двух' : state.required_count} {state.required_count === 1 ? 'участника' : 'участников'}.
        </div>
        {state.signers.map((s) => (
          <div key={`${s.order}-${s.person.user_id}`} className={g.ruleCard}>
            <Avatar name={s.person.name} />
            <div style={{ flex: 1 }}>
              <b>{SIGNING_DOCUMENT_LABELS[s.document]}</b>
              <div>{s.person.name}</div>
              <div className={g.muted}>
                {ROLE_SHORT[s.person.role]} · {s.document === 'contract' ? 'от имени компании' : 'от своего имени'}
              </div>
              <div className={g.verified}>
                <CheckmarkCircleMIcon /> Полномочия подтверждены
              </div>
            </div>
            {s.status === 'signed' ? (
              <Pill tone='green' small icon={<CheckmarkCircleMIcon style={{ width: 14, height: 14 }} />}>
                Подписано
              </Pill>
            ) : (
              <Pill small icon={<ClockLineMIcon style={{ width: 14, height: 14 }} />}>
                Ожидается подпись
              </Pill>
            )}
          </div>
        ))}
        <div className={g.infoBox}>
          <InformationCircleLineMIcon />
          <span>Каждый участник подписывает свой документ. Отправка на подпись не заменяет подпись участника.</span>
        </div>
        <div className={g.rulesFooter}>
          <TextLink tone='blue' arrow onClick={() => navigate('/team/signing')}>
            Подробнее о полномочиях
          </TextLink>
          <Btn size='l' onClick={onClose}>
            Вернуться к подписанию
          </Btn>
        </div>
      </Stack>
    </Dialog>
  );
}
