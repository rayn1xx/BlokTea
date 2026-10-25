import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';

import { can } from '@/app/access';
import { useApplications } from '@/features/applications/hooks';
import { useCurrentHome } from '@/features/profile/components/AppShell/AppShell';
import { useSigning } from '@/features/signing/hooks';
import { teamApi } from '@/features/team/api';
import t from '@/features/team/components/team.module.css';
import { useMembers, useSigningRules } from '@/features/team/hooks';
import type { SigningRules } from '@/features/team/types';
import { isApiError } from '@/shared/api/client';
import { errorText, queryClient } from '@/shared/api/query';
import { keys } from '@/shared/api/queryKeys';
import { ROLE_LABELS, SIGNING_DOCUMENT_LABELS } from '@/shared/i18n/ru';
import { appNo } from '@/shared/lib/format';
import type { UserRole } from '@/shared/types/common';
import { Accordion, Btn, Dialog, InfoLine, ModalFooter, Options, Pill, Row, SelectField, SkeletonLines, Stack, Text, TextLink } from '@/shared/ui';

type Card = { key: string; document: keyof typeof SIGNING_DOCUMENT_LABELS; name: string; text: string; status?: string };

export function SigningTab() {
  const navigate = useNavigate();
  const home = useCurrentHome();
  const [params, setParams] = useSearchParams();
  const rules = useSigningRules();
  const members = useMembers();
  const apps = useApplications({ status: ['approved', 'counter_offer', 'signing', 'issued'], page: 1, page_size: 50 });
  const deal = params.get('application') ?? '';
  const signing = useSigning(deal, !!deal);
  const [basis, setBasis] = useState<Card | null>(null);
  const [edit, setEdit] = useState<null | 'senders' | 'signers'>(null);
  const isOwner = can(home, 'manage_team');

  const memberName = (userId: string | null, role: UserRole | null) => {
    const m = (members.data ?? []).find((x) => x.user_id === userId) ?? (members.data ?? []).find((x) => x.role === role && x.status === 'active');
    return m ? `${m.last_name} ${m.first_name}${m.middle_name ? ` ${m.middle_name}` : ''}` : role ? ROLE_LABELS[role] : 'не выбран';
  };

  const cards: Card[] =
    deal && signing.data
      ? signing.data.signers.map((s) => ({
          key: `${s.order}`,
          document: s.document,
          name: s.person.name,
          text: s.document === 'contract' ? `${ROLE_LABELS[s.person.role]} · действует от имени компании` : 'Поручитель · подписывает от своего имени',
          status: s.status,
        }))
      : (rules.data?.signers ?? []).map((s) => ({
          key: `${s.order}`,
          document: s.document,
          name: memberName(s.user_id, s.role),
          text: s.document === 'contract' ? 'Действует от имени компании' : 'Подписывает от своего имени',
        }));

  const senders = (members.data ?? []).filter((m) => m.status === 'active' && rules.data?.can_send_to_signing.includes(m.role));

  return (
    <Stack gap={14}>
      <div>
        <h2 style={{ margin: 0, fontSize: 24 }}>Правила подписания</h2>
        <div className={t.muted} style={{ fontSize: 15, marginTop: 4 }}>
          Кто подписывает документы и на каком основании
        </div>
      </div>
      <div style={{ maxWidth: 300 }}>
        <SelectField
          value={deal}
          options={[{ value: '', label: 'Общие правила компании' }, ...(apps.data?.items ?? []).map((a) => ({ value: a.id, label: `По сделке: заявка ${appNo(a.number)}` }))]}
          onChange={(v) => setParams(v ? { application: v } : {})}
          ariaLabel='Сделка'
        />
      </div>
      {rules.isLoading ? (
        <SkeletonLines lines={4} />
      ) : (
        cards.map((c) => (
          <section key={c.key} className={t.ruleCard}>
            <div>
              <h3 className={t.ruleTitle}>{SIGNING_DOCUMENT_LABELS[c.document]}</h3>
              <b>{c.name}</b>
              <div className={t.muted} style={{ margin: '4px 0 10px' }}>
                {c.text}
              </div>
              {c.status === 'signed' ? (
                <Pill tone='green' small>
                  Подписано
                </Pill>
              ) : c.document === 'contract' ? (
                <Pill tone='green' small>
                  Полномочия подтверждены
                </Pill>
              ) : (
                <Pill small>Участие подтверждено</Pill>
              )}
            </div>
            <Btn variant='outline' size='m' onClick={() => setBasis(c)}>
              {c.document === 'contract' ? 'Посмотреть основание' : 'Посмотреть'}
            </Btn>
          </section>
        ))
      )}
      <Accordion title='Внутреннее согласование' subtitle='Дополнительная проверка перед отправкой на подпись'>
        <div className={t.muted} style={{ fontSize: 14 }}>
          Перед отправкой договора на подпись его проверяет сотрудник с правом отправки. Отдельной подписи согласование не требует.
        </div>
      </Accordion>
      <InfoLine>Назначение задач и доступ к документам не дают права подписи.</InfoLine>
      <section className={t.sendRow}>
        <div>
          <b>Кто может отправлять документы на подпись</b>
          <div className={t.muted}>{senders.map((m) => `${m.first_name} ${m.last_name}`).join(' · ') || 'никто'}</div>
        </div>
        {isOwner && (
          <TextLink tone='blue' arrow onClick={() => setEdit('senders')}>
            Настроить доступ
          </TextLink>
        )}
      </section>
      <Row gap={16}>
        <Btn variant='outline' size='l' disabled={!isOwner} onClick={() => setEdit('signers')}>
          Запросить изменение подписанта
        </Btn>
        <span className={t.muted}>Изменения применяются после проверки полномочий и подготовки документов.</span>
      </Row>
      {deal && (
        <TextLink tone='blue' onClick={() => navigate(`/applications/${deal}`)}>
          ← К заявке {appNo(apps.data?.items.find((a) => a.id === deal)?.number ?? '')}
        </TextLink>
      )}

      {basis && (
        <Dialog open onClose={() => setBasis(null)} title={SIGNING_DOCUMENT_LABELS[basis.document]} subtitle={basis.name}>
          <Stack gap={10}>
            <div>{basis.document === 'contract' ? 'Подписывает руководитель компании по уставу. Полномочия подтверждены выпиской из реестра.' : 'Подписывает собственник бизнеса от своего имени как поручитель.'}</div>
            <InfoLine>Каждый участник подписывает свой документ. Отправка на подпись не заменяет подпись участника.</InfoLine>
          </Stack>
        </Dialog>
      )}
      {edit && rules.data && <RulesEditor mode={edit} rules={rules.data} onClose={() => setEdit(null)} />}
    </Stack>
  );
}

function RulesEditor({ mode, rules, onClose }: { mode: 'senders' | 'signers'; rules: SigningRules; onClose: () => void }) {
  const members = useMembers();
  const [draft, setDraft] = useState(rules);
  const [error, setError] = useState<string | null>(null);
  const active = (members.data ?? []).filter((m) => m.status === 'active' && m.user_id);
  const save = useMutation({
    mutationFn: () => teamApi.putSigningRules(draft),
    onSuccess: (r) => {
      queryClient.setQueryData(keys.signingRules, r);
      onClose();
    },
    onError: (e) => setError(isApiError(e, 'VERSION_CONFLICT') ? 'Правила изменил другой сотрудник, откройте окно заново' : errorText(e)),
  });

  return (
    <Dialog
      open
      onClose={onClose}
      title={mode === 'senders' ? 'Кто может отправлять на подпись' : 'Подписанты'}
      footer={
        <ModalFooter>
          <Btn variant='outline' size='l' onClick={onClose}>
            Отмена
          </Btn>
          <Btn size='l' loading={save.isPending} onClick={() => save.mutate()}>
            Сохранить
          </Btn>
        </ModalFooter>
      }
    >
      <Stack gap={16}>
        {mode === 'senders' ? (
          <Options<UserRole>
            columns={1}
            options={(Object.keys(ROLE_LABELS) as UserRole[]).map((r) => ({ value: r, label: ROLE_LABELS[r] }))}
            values={draft.can_send_to_signing}
            onChange={(r) =>
              setDraft({ ...draft, can_send_to_signing: draft.can_send_to_signing.includes(r) ? draft.can_send_to_signing.filter((x) => x !== r) : [...draft.can_send_to_signing, r] })
            }
          />
        ) : (
          draft.signers.map((s, i) => (
            <div key={s.order}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>{SIGNING_DOCUMENT_LABELS[s.document]}</div>
              <SelectField
                value={s.user_id ?? ''}
                placeholder='Выберите сотрудника'
                options={active.map((m) => ({ value: m.user_id!, label: `${m.last_name} ${m.first_name} · ${ROLE_LABELS[m.role]}` }))}
                onChange={(v) => setDraft({ ...draft, signers: draft.signers.map((x, j) => (j === i ? { ...x, user_id: v } : x)) })}
                ariaLabel={SIGNING_DOCUMENT_LABELS[s.document]}
              />
            </div>
          ))
        )}
        {error && <Text color='negative' tag='div'>{error}</Text>}
      </Stack>
    </Dialog>
  );
}
