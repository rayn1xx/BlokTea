import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@alfalab/core-components/button';
import { Checkbox } from '@alfalab/core-components/checkbox';

import { teamApi } from '@/features/team/api';
import { ROLES } from '@/features/team/constants';
import type { Member, SigningRules } from '@/features/team/types';
import { isApiError } from '@/shared/api/client';
import { errorText, queryClient } from '@/shared/api/query';
import { keys } from '@/shared/api/queryKeys';
import { ROLE_LABELS, SIGNING_DOCUMENT_LABELS } from '@/shared/i18n/ru';
import type { UserRole } from '@/shared/types/common';
import { Card, CardTitle, Chips, FieldGroup, FieldLabel, InfoRow, InfoRows, Note, Row, SmallTag, Stack, Text } from '@/shared/ui';

export function SigningRulesCard({ rules, members, editable }: { rules: SigningRules; members: Member[]; editable: boolean }) {
  const [draft, setDraft] = useState(rules);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const active = members.filter((m) => m.status === 'active' && m.user_id);
  const dirty = JSON.stringify(draft) !== JSON.stringify(rules);

  const save = useMutation({
    mutationFn: () => teamApi.putSigningRules(draft),
    onSuccess: (r) => {
      queryClient.setQueryData(keys.signingRules, r);
      setDraft(r);
      setSaved(true);
    },
    onError: async (e) => {
      if (isApiError(e, 'VERSION_CONFLICT')) {
        const fresh = await teamApi.signingRules();
        queryClient.setQueryData(keys.signingRules, fresh);
        setDraft(fresh);
        setError('Правила изменил другой сотрудник, проверьте их ещё раз');
      } else setError(errorText(e));
    },
  });

  const nameOf = (userId: string | null, role: UserRole | null) => {
    const m = active.find((x) => x.user_id === userId);
    if (m) return `${m.last_name} ${m.first_name}`;
    return role ? `Любой: ${ROLE_LABELS[role].toLowerCase()}` : 'не выбран';
  };

  return (
    <Card>
      <CardTitle right={<SmallTag>{rules.legal_form === 'IP' ? 'ИП' : 'ООО'}</SmallTag>}>Правила подписи</CardTitle>
      <Stack gap={16}>
        {draft.signers
          .slice()
          .sort((a, b) => a.order - b.order)
          .map((sg, i) => (
            <div key={i} style={{ padding: 16, borderRadius: 16, background: 'var(--color-light-bg-secondary, #f2f3f5)' }}>
              <Row justify='space-between' gap={12}>
                <div>
                  <Text medium tag='div'>
                    {sg.order}. {SIGNING_DOCUMENT_LABELS[sg.document]}
                  </Text>
                  <Text small secondary tag='div'>
                    Подписывает: {nameOf(sg.user_id, sg.role)} · {sg.required ? 'обязательно' : 'по желанию'}
                  </Text>
                </div>
                {editable && (
                  <Checkbox
                    label='Обязательно'
                    checked={sg.required}
                    onChange={(_, { checked }) => setDraft({ ...draft, signers: draft.signers.map((x, j) => (j === i ? { ...x, required: checked } : x)) })}
                  />
                )}
              </Row>
              {editable && (
                <div style={{ marginTop: 12 }}>
                  <Chips
                    options={active.map((m) => ({ value: m.user_id!, label: `${m.last_name} ${m.first_name[0]}.` }))}
                    value={sg.user_id}
                    onChange={(userId) => setDraft({ ...draft, signers: draft.signers.map((x, j) => (j === i ? { ...x, user_id: userId } : x)) })}
                  />
                </div>
              )}
            </div>
          ))}

        <InfoRows>
          <InfoRow label='Кто может отправлять на подпись'>{draft.can_send_to_signing.map((r) => ROLE_LABELS[r]).join(', ')}</InfoRow>
        </InfoRows>
        {editable && (
          <FieldGroup label={<FieldLabel>Отправлять на подпись могут</FieldLabel>}>
            <Chips
              multiple
              options={ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] }))}
              value={draft.can_send_to_signing}
              onChange={(r) =>
                setDraft({
                  ...draft,
                  can_send_to_signing: draft.can_send_to_signing.includes(r) ? draft.can_send_to_signing.filter((x) => x !== r) : [...draft.can_send_to_signing, r],
                })
              }
            />
          </FieldGroup>
        )}

        {error && <Note tone='attention'>{error}</Note>}
        {saved && !dirty && <Note tone='positive'>Правила сохранены</Note>}
        {editable && (
          <div>
            <Button view='primary' size={48} disabled={!dirty} onClick={() => save.mutate()} loading={save.isPending}>
              Сохранить правила
            </Button>
          </div>
        )}
      </Stack>
    </Card>
  );
}
