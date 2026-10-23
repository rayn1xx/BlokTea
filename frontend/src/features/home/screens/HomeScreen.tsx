import { useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRightMIcon } from '@alfalab/icons-glyph/ChevronRightMIcon';

import { can } from '@/app/access';
import { useApplications } from '@/features/applications/hooks';
import { AppStatusPill } from '@/features/applications/components/StatusLabel';
import type { ApplicationSummary } from '@/features/applications/types';
import { useCompanyProfile } from '@/features/company/hooks';
import { useFeed } from '@/features/feed/hooks';
import { useLoans } from '@/features/loans/hooks';
import { useStartMatching } from '@/features/matching/lib';
import { PersonalOfferModal } from '@/features/products/components/PersonalOfferModal';
import { usePreapproved } from '@/features/products/hooks';
import { useCurrentHome, useShell } from '@/features/profile/components/AppShell/AppShell';
import { useTasks } from '@/features/tasks/hooks';
import type { Task } from '@/features/tasks/types';
import { TEXTS } from '@/shared/i18n/ru';
import { appNo, formatDayMonth, formatMoney, plural } from '@/shared/lib/format';
import { Accordion, Box, Btn, InfoLine, InfoStrip, PageHead, Panel, Pill, SkeletonLines, TextLink } from '@/shared/ui';

import h from '../home.module.css';

export function HomeScreen({ overlay }: { overlay?: ReactNode }) {
  const home = useCurrentHome();
  const canApply = can(home, 'apply');

  return (
    <div className={h.page}>
      <PageHead title='Кредитование' subtitle='Финансирование под задачи вашего бизнеса' />
      {canApply ? <Hero /> : <Panel tone='blue'>{TEXTS.accountantBanner}</Panel>}
      <ProfileStrip />
      <div className={h.columns}>
        <MyApplications />
        <ActiveLoans />
      </div>
      <FeedAccordion />
      {overlay}
    </div>
  );
}

function Hero() {
  const navigate = useNavigate();
  const offer = usePreapproved();
  const matching = useStartMatching();
  const [offerOpen, setOfferOpen] = useState(false);

  return (
    <section className={h.hero}>
      <div className={h.heroMain}>
        <h2 className={h.heroTitle}>Подберём кредит для вашего бизнеса</h2>
        <p className={h.heroText}>Расскажите, на что нужны деньги. Мы учтём данные компании и объясним подходящие варианты.</p>
        <div className={h.heroActions}>
          <Btn size='l' onClick={matching.start} loading={matching.pending} className={h.heroButton}>
            Подобрать кредит
          </Btn>
          <TextLink underline onClick={() => navigate('/products')}>
            Выбрать из каталога
          </TextLink>
        </div>
        {matching.error && <div className={h.error}>{matching.error}</div>}
      </div>
      {offer.data && (
        <div className={h.heroOffer}>
          <Pill small>Персональное предложение</Pill>
          <div className={h.offerAmount}>до {formatMoney(offer.data.limit)}</div>
          <div className={h.muted}>Доступно до {formatDayMonth(offer.data.valid_until)}</div>
          <TextLink arrow onClick={() => setOfferOpen(true)}>
            Посмотреть условия
          </TextLink>
        </div>
      )}
      {offerOpen && offer.data && <PersonalOfferModal offer={offer.data} onClose={() => setOfferOpen(false)} />}
    </section>
  );
}

function ProfileStrip() {
  const profile = useCompanyProfile();
  const shell = useShell();
  if (!profile.data || profile.data.completeness_percent >= 100) return null;
  return (
    <InfoStrip
      right={
        <TextLink underline onClick={shell.openProfile}>
          Проверить данные
        </TextLink>
      }
    >
      Профиль заполнен на <b>{profile.data.completeness_percent}%</b>. Недостающие сведения уточним при оформлении.
    </InfoStrip>
  );
}

function rowFor(task: Task | null, app: ApplicationSummary | undefined) {
  return {
    key: task?.id ?? app!.id,
    title: app?.purpose ?? task!.title,
    sub: app ? `Заявка ${appNo(app.number)} · ${formatMoney(app.approved_amount ?? app.requested_amount)}` : task?.waiting_for_text ?? '',
    status: app?.status,
    label: task?.cta.label ?? 'Открыть',
    route: task?.cta.route ?? (app ? `/applications/${app.id}` : '/applications'),
  };
}

function MyApplications() {
  const navigate = useNavigate();
  const tasks = useTasks('mine');
  const others = useTasks('waiting_others');
  const apps = useApplications({ page: 1, page_size: 50, sort: '-updated_at' }, true);

  const list = apps.data?.items ?? [];
  const mine = tasks.data ?? [];
  const rows = mine.length
    ? mine.slice(0, 3).map((t) => rowFor(t, list.find((a) => a.id === t.application?.id)))
    : list.slice(0, 2).map((a) => rowFor(null, a));
  const counters = apps.data?.counters;

  return (
    <Box
      title='Мои заявки'
      right={
        <TextLink arrow onClick={() => navigate('/applications')}>
          Все заявки
        </TextLink>
      }
    >
      {mine.length > 0 && (
        <div style={{ marginBottom: 6 }}>
          <Pill small>Требуют вашего действия · {mine.length}</Pill>
        </div>
      )}
      {apps.isLoading || tasks.isLoading ? (
        <SkeletonLines lines={3} />
      ) : rows.length === 0 ? (
        <div className={h.empty}>Заявок пока нет. Нажмите «Подобрать кредит», чтобы начать</div>
      ) : (
        <ul className={h.rows}>
          {rows.map((r) => (
            <li key={r.key} className={h.row}>
              <div className={h.rowMain}>
                <div className={h.rowTitle}>{r.title}</div>
                <div className={h.muted}>{r.sub}</div>
              </div>
              {r.status && <AppStatusPill status={r.status} small />}
              <Btn variant='outline' size='m' onClick={() => navigate(r.route)}>
                {r.label}
              </Btn>
            </li>
          ))}
        </ul>
      )}
      {(others.data ?? []).slice(0, 2).map((t) => (
        <InfoLine key={t.id} style={{ marginTop: 8 }}>
          {t.title}. {t.waiting_for_text}
        </InfoLine>
      ))}
      {counters && (
        <div className={h.counters}>
          <TextLink onClick={() => navigate('/applications?tab=drafts')}>
            Черновики · {counters.drafts} <ChevronRightMIcon className={h.chev} />
          </TextLink>
          <TextLink onClick={() => navigate('/applications?tab=in_bank')}>
            На рассмотрении · {counters.in_bank} <ChevronRightMIcon className={h.chev} />
          </TextLink>
        </div>
      )}
    </Box>
  );
}

function ActiveLoans() {
  const navigate = useNavigate();
  const loans = useLoans();
  const list = loans.data ?? [];
  return (
    <Box title='Действующие кредиты'>
      {loans.isLoading ? (
        <SkeletonLines lines={3} />
      ) : list.length === 0 ? (
        <div className={h.empty}>Действующих кредитов нет</div>
      ) : (
        <ul className={h.rows}>
          {list.map((l) => (
            <li key={l.id}>
              <button type='button' className={h.loan} onClick={() => navigate(`/loans/${l.id}`)}>
                <span className={h.rowMain}>
                  <span className={h.rowTitle}>{l.product.name}</span>
                  <span className={h.muted}>Остаток {formatMoney(l.balance)}</span>
                  {l.next_payment && (
                    <span className={h.muted}>
                      {formatMoney(l.next_payment.amount)} · платёж {formatDayMonth(l.next_payment.date)}
                    </span>
                  )}
                </span>
                <ChevronRightMIcon className={h.chev} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Box>
  );
}

function FeedAccordion() {
  const navigate = useNavigate();
  const feed = useFeed(3);
  const items = feed.data?.items ?? [];
  if (!items.length) return null;
  const total = feed.data?.total ?? items.length;
  return (
    <Accordion
      title='Программы и новости для вашей компании'
      right={
        <span className={h.muted}>
          {total} {plural(total, 'новый материал', 'новых материала', 'новых материалов')}
        </span>
      }
    >
      <div className={h.feedGrid}>
        {items.map((f) => (
          <button key={f.id} type='button' className={h.feedItem} onClick={() => navigate(f.cta?.route ?? '/feed')}>
            <span className={h.rowTitle}>{f.title}</span>
            <span className={h.muted}>{f.relevance_reason}</span>
          </button>
        ))}
      </div>
      <div style={{ marginTop: 12 }}>
        <TextLink arrow onClick={() => navigate('/feed')}>
          Все материалы
        </TextLink>
      </div>
    </Accordion>
  );
}
