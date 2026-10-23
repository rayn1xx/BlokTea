import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChartColumnThreeAscMIcon } from '@alfalab/icons-glyph/ChartColumnThreeAscMIcon';
import { DocumentLinesMIcon } from '@alfalab/icons-glyph/DocumentLinesMIcon';
import { OfficeMIcon } from '@alfalab/icons-glyph/OfficeMIcon';
import { QuestionCircleMIcon } from '@alfalab/icons-glyph/QuestionCircleMIcon';
import { StarMIcon } from '@alfalab/icons-glyph/StarMIcon';

import { feedApi } from '@/features/feed/api';
import type { FeedItem } from '@/features/feed/types';
import { useCurrentHome } from '@/features/profile/components/AppShell/AppShell';
import { keys } from '@/shared/api/queryKeys';
import { Accordion, Btn, EmptyState, InfoStrip, PageHead, Pill, QueryGate, Tabs, TextLink } from '@/shared/ui';

import f from '../feed.module.css';

type TabId = 'all' | 'program' | 'tip' | 'application_event';

const TYPE_META: Record<FeedItem['type'], { label: string; icon: typeof StarMIcon; tone: 'grey' | 'blue' }> = {
  program: { label: 'Программы финансирования', icon: ChartColumnThreeAscMIcon, tone: 'grey' },
  tip: { label: 'Полезное', icon: DocumentLinesMIcon, tone: 'grey' },
  industry: { label: 'Отрасль', icon: DocumentLinesMIcon, tone: 'grey' },
  product_update: { label: 'Ваши продукты', icon: StarMIcon, tone: 'grey' },
  application_event: { label: 'Событие по заявке', icon: DocumentLinesMIcon, tone: 'blue' },
};

export function FeedScreen() {
  const navigate = useNavigate();
  const home = useCurrentHome();
  const [tab, setTab] = useState<TabId>('all');
  const feed = useQuery({ queryKey: [...keys.feed(50), tab], queryFn: () => feedApi.list({ page: 1, page_size: 50, type: tab === 'all' ? undefined : tab }) });
  const company = home.company;
  const okved = company?.okved_main.replace(/^\S+\s/, '').split(' ').slice(0, 2).join(' ').toLowerCase();

  return (
    <div>
      <PageHead
        back={{ label: 'Кредитование', to: '/home' }}
        title='Для вашей компании'
        subtitle='Программы финансирования, полезные материалы и события по заявкам.'
        right={
          company ? (
            <Pill icon={<OfficeMIcon style={{ width: 18, height: 18 }} />}>
              {company.legal_form === 'IP' ? 'ИП' : 'ООО'} · {okved}
            </Pill>
          ) : undefined
        }
      />
      <Tabs<TabId>
        value={tab}
        onChange={setTab}
        items={[
          { id: 'all', label: 'Все' },
          { id: 'program', label: 'Программы' },
          { id: 'tip', label: 'Советы' },
          { id: 'application_event', label: 'События по заявкам' },
        ]}
      />
      <div style={{ marginTop: 20 }}>
        <QueryGate query={feed}>
          {(data) =>
            data.items.length === 0 ? (
              <EmptyState title='Материалов пока нет' text='Здесь появятся программы и советы для вашего бизнеса' />
            ) : (
              <div className={f.grid}>
                {data.items.map((item, i) => {
                  const meta = TYPE_META[item.type];
                  return (
                    <article key={item.id} className={f.card}>
                      <div className={f.head}>
                        <meta.icon className={f.icon} />
                        <Pill small tone={meta.tone}>
                          {meta.label}
                        </Pill>
                        {i === 0 && (
                          <span className={f.new}>
                            <Pill small tone='red'>
                              Новое
                            </Pill>
                          </span>
                        )}
                      </div>
                      <h2 className={f.title}>{item.title}</h2>
                      <p className={f.body}>{item.body}</p>
                      <InfoStrip>{item.relevance_reason.replace(/^Показано, потому что:\s*/, 'Показано: ')}</InfoStrip>
                      <div className={f.foot}>
                        {item.cta ? (
                          item.type === 'application_event' ? (
                            <Btn variant='outline' size='l' onClick={() => navigate(item.cta!.route)}>
                              {item.cta.label}
                            </Btn>
                          ) : (
                            <TextLink tone={item.type === 'program' ? 'red' : 'default'} arrow onClick={() => navigate(item.cta!.route)}>
                              {item.cta.label}
                            </TextLink>
                          )
                        ) : (
                          <span />
                        )}
                        <span className={f.muted}>Демонстрационная подборка</span>
                      </div>
                    </article>
                  );
                })}
              </div>
            )
          }
        </QueryGate>
      </div>
      <div style={{ marginTop: 16 }}>
        <Accordion icon={QuestionCircleMIcon} title='Как формируется лента' subtitle='Учитываем данные компании, интересы и события по заявкам.'>
          <div className={f.muted} style={{ fontSize: 14 }}>
            Мы смотрим на ОКВЭД, форму бизнеса, обороты и ваши заявки. Каждая карточка объясняет, почему она показана. Персональные данные сотрудников для ленты не используются.
          </div>
        </Accordion>
      </div>
    </div>
  );
}
