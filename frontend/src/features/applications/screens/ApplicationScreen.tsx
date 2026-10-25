import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { BankMIcon } from '@alfalab/icons-glyph/BankMIcon';
import { CallMIcon } from '@alfalab/icons-glyph/CallMIcon';
import { ClockLineMIcon } from '@alfalab/icons-glyph/ClockLineMIcon';
import { DocumentLinesMIcon } from '@alfalab/icons-glyph/DocumentLinesMIcon';
import { DocumentMIcon } from '@alfalab/icons-glyph/DocumentMIcon';
import { MagnifierMIcon } from '@alfalab/icons-glyph/MagnifierMIcon';
import { PencilMIcon } from '@alfalab/icons-glyph/PencilMIcon';

import { CallList } from '@/features/applications/components/CallCard';
import { CancelDialog } from '@/features/applications/components/CancelDialog';
import { DecisionView } from '@/features/applications/components/DecisionView';
import { AppStatusPill } from '@/features/applications/components/StatusLabel';
import { useApplication } from '@/features/applications/hooks';
import type { ApplicationDetail, TimelineEvent } from '@/features/applications/types';
import { useDocumentsForApplication } from '@/features/documents/hooks';
import { useLoans } from '@/features/loans/hooks';
import { useCurrentHome } from '@/features/profile/components/AppShell/AppShell';
import { appNo, formatLongDate, formatMoney, formatMonths, formatPercent, formatShortDateTime, formatTime, plural } from '@/shared/lib/format';
import type { ApplicationStatus } from '@/shared/types/common';
import { Accordion, Btn, Card, IconCircle, PageHead, QueryGate, Stack, StageLine, TextLink, type TimelineStage } from '@/shared/ui';

import c from './ApplicationScreen.module.css';

export function ApplicationScreen() {
  const { id = '' } = useParams();
  const app = useApplication(id, true);
  return <QueryGate query={app}>{(data) => (data.decision && ['approved', 'counter_offer', 'rejected'].includes(data.status) ? <DecisionView app={data} /> : <CardView app={data} />)}</QueryGate>;
}

const STAGES: { key: string; title: string; statuses: ApplicationStatus[] }[] = [
  { key: 'draft', title: 'Черновик', statuses: ['draft'] },
  { key: 'submitted', title: 'Отправлена', statuses: ['submitted'] },
  { key: 'review', title: 'Проверка', statuses: ['in_review', 'info_requested'] },
  { key: 'decision', title: 'Решение', statuses: ['approved', 'counter_offer', 'rejected'] },
  { key: 'signing', title: 'Подписание', statuses: ['signing'] },
  { key: 'issued', title: 'Выдача', statuses: ['issued'] },
];

function stagesFor(status: ApplicationStatus, events: TimelineEvent[]): TimelineStage[] {
  const current = STAGES.findIndex((s) => s.statuses.includes(status));
  const seen = (s: (typeof STAGES)[number]) => [...events].reverse().find((e) => s.statuses.includes(e.status));
  return STAGES.map((s, i) => {
    const event = seen(s);
    const cancelled = status === 'cancelled';
    const state: TimelineStage['state'] = cancelled
      ? event
        ? 'done'
        : 'future'
      : i < current || (status === 'issued' && i === current)
        ? 'done'
        : i === current
          ? 'current'
          : 'future';
    return { key: s.key, title: s.title, state, time: state === 'current' ? 'Сейчас' : event && state === 'done' ? formatShortDateTime(event.at) : null };
  });
}

const NOW_TEXT: Partial<Record<ApplicationStatus, { title: string; text: string; actor: string; icon: typeof MagnifierMIcon }>> = {
  draft: { title: 'Заявка ещё не отправлена', text: 'Проверьте данные и подтвердите заявку.', actor: 'вы', icon: PencilMIcon },
  submitted: { title: 'Заявка отправлена в банк', text: 'Банк скоро возьмёт заявку в работу.', actor: 'банк', icon: BankMIcon },
  in_review: { title: 'Банк проверяет заявку', text: 'Проверяем сведения о компании и финансовые данные.', actor: 'банк', icon: MagnifierMIcon },
  info_requested: { title: 'Банку нужен документ', text: 'Ответьте на запрос, и рассмотрение продолжится.', actor: 'вы', icon: DocumentMIcon },
  signing: { title: 'Идёт подписание договора', text: 'Документы подписывают по правилам компании.', actor: 'подписанты', icon: PencilMIcon },
  issued: { title: 'Кредит выдан', text: 'Деньги зачислены на расчётный счёт.', actor: 'никто, всё готово', icon: BankMIcon },
  cancelled: { title: 'Заявка отозвана', text: 'Рассмотрение прекращено. Данные и документы сохранились.', actor: 'никто', icon: DocumentMIcon },
};

function CardView({ app }: { app: ApplicationDetail }) {
  const navigate = useNavigate();
  const home = useCurrentHome();
  const loans = useLoans();
  const docs = useDocumentsForApplication(app.id);
  const [cancelOpen, setCancelOpen] = useState(false);
  const openRequest = app.info_requests.find((r) => r.status === 'open');
  const loan = loans.data?.find((l) => l.application_id === app.id);
  const amount = app.approved_amount ?? app.requested_amount;
  const term = app.approved_term_months ?? app.requested_term_months;
  const now = NOW_TEXT[app.status] ?? NOW_TEXT.in_review!;
  const clientTurn = app.status_text.actor === 'client';
  const waiting = app.awaiting_from && app.awaiting_from.user_id !== home.id ? app.awaiting_from.name : null;
  const last = app.timeline[app.timeline.length - 1];

  return (
    <div>
      <PageHead
        back={{ label: 'Все заявки', to: '/applications' }}
        title={`Заявка ${appNo(app.number)}`}
        subtitle={`${app.product.name} · ${formatMoney(amount)} · ${formatMonths(term)}`}
        right={<AppStatusPill status={app.status} />}
      />
      <Stack gap={14}>
        <Card>
          <StageLine stages={stagesFor(app.status, app.timeline)} />
        </Card>

        <section className={`${c.now} ${app.status === 'info_requested' ? c.nowYellow : ''}`}>
          <div className={c.nowMain}>
            <IconCircle icon={now.icon} white large />
            <div>
              <h2 className={c.nowTitle}>{now.title}</h2>
              <p className={c.nowText}>{app.status === 'info_requested' && openRequest ? openRequest.question : now.text}</p>
              <div className={c.actor}>
                <BankMIcon /> Сейчас действует: <u>{waiting ?? now.actor}</u>
              </div>
              {clientTurn && app.status !== 'cancelled' ? (
                <div className={c.nowActions}>
                  {app.status === 'draft' && app.available_actions.includes('application.edit') && (
                    <Btn size='l' onClick={() => navigate(`/applications/${app.id}/edit`)}>
                      Продолжить оформление
                    </Btn>
                  )}
                  {openRequest && (
                    <Btn size='l' onClick={() => navigate(`/applications/${app.id}/info-requests/${openRequest.id}`)}>
                      Ответить на запрос
                    </Btn>
                  )}
                  {app.status === 'signing' && (
                    <Btn size='l' onClick={() => navigate(`/applications/${app.id}/signing`)}>
                      {app.available_actions.includes('signing.sign') ? 'Подписать договор' : 'К подписанию'}
                    </Btn>
                  )}
                </div>
              ) : (
                <div className={c.nothing}>{app.status === 'issued' ? 'От вас больше ничего не требуется' : 'От вас пока ничего не требуется'}</div>
              )}
              {app.status === 'issued' && loan && (
                <div className={c.nowActions}>
                  <Btn size='l' onClick={() => navigate(`/loans/${loan.id}`)}>
                    Кредит и график
                  </Btn>
                </div>
              )}
            </div>
          </div>
          {app.status_text.due_at || openRequest?.due_at ? (
            <div className={c.nowSide}>
              <div className={c.muted}>Ориентир ответа</div>
              <div className={c.due}>{formatLongDate(openRequest?.due_at ?? app.status_text.due_at)}</div>
              <div className={c.muted}>Срок может измениться.</div>
            </div>
          ) : null}
        </section>

        <Accordion icon={DocumentLinesMIcon} title='Условия заявки' right={<span className={c.muted}>Посмотреть</span>}>
          <dl className={c.terms}>
            <div>
              <dt>Продукт</dt>
              <dd>{app.product.name}</dd>
            </div>
            <div>
              <dt>Сумма</dt>
              <dd>
                {formatMoney(app.requested_amount)}
                {app.approved_amount && app.approved_amount.value !== app.requested_amount.value ? `, одобрено ${formatMoney(app.approved_amount)}` : ''}
              </dd>
            </div>
            <div>
              <dt>Срок</dt>
              <dd>{formatMonths(term)}</dd>
            </div>
            <div>
              <dt>Ставка</dt>
              <dd>{formatPercent(app.rate_percent, 0)} годовых, условная</dd>
            </div>
            <div>
              <dt>Платёж</dt>
              <dd>≈ {formatMoney(app.monthly_payment_estimate)} в месяц</dd>
            </div>
            <div>
              <dt>Цель</dt>
              <dd>{app.purpose}</dd>
            </div>
          </dl>
        </Accordion>
        <Accordion
          icon={DocumentMIcon}
          title='Документы заявки'
          subtitle={docs.data ? `${docs.data.length} ${plural(docs.data.length, 'документ', 'документа', 'документов')}` : undefined}
          right={
            <TextLink arrow onClick={() => navigate(`/applications/${app.id}/documents`)}>
              Открыть
            </TextLink>
          }
          onClick={() => navigate(`/applications/${app.id}/documents`)}
          arrow='none'
        />
        {app.calls.length > 0 && (
          <Accordion
            icon={CallMIcon}
            title='Звонки с банком'
            subtitle={`Итоги разговоров с менеджером: ${app.calls.length} ${plural(app.calls.length, 'звонок', 'звонка', 'звонков')}`}
            defaultOpen
          >
            <CallList calls={app.calls} />
          </Accordion>
        )}
        <Accordion icon={ClockLineMIcon} title='История заявки' subtitle={last ? `Последнее событие: ${last.title.toLowerCase()} · ${formatTime(last.at)}` : undefined}>
          <ul className={c.history}>
            {[...app.timeline].reverse().map((ev, i) => (
              <li key={`${ev.at}-${i}`}>
                <span className={c.muted}>{formatShortDateTime(ev.at)}</span>
                <span>
                  <b>{ev.title}</b>
                  {ev.description ? `. ${ev.description}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </Accordion>

        <div className={c.muted}>Статус обновляется автоматически. О решении сообщим в кабинете.</div>

        <div className={c.footer}>
          <div>
            {app.available_actions.includes('application.cancel') && (
              <>
                <TextLink underline onClick={() => setCancelOpen(true)}>
                  Отозвать заявку
                </TextLink>
                <div className={c.muted} style={{ marginTop: 6 }}>
                  Доступно до подписания договора
                </div>
              </>
            )}
          </div>
          <Btn variant='outline' size='l' onClick={() => navigate('/home')}>
            В кабинет
          </Btn>
        </div>
      </Stack>
      {cancelOpen && <CancelDialog app={app} onClose={() => setCancelOpen(false)} />}
    </div>
  );
}
