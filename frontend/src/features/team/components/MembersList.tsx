import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@alfalab/core-components/button';

import { ROLE_PERMISSIONS as DEFAULT_PERMISSIONS } from '@/app/access';
import { teamApi } from '@/features/team/api';
import { MEMBER_STATUS, ROLES } from '@/features/team/constants';
import type { Member } from '@/features/team/types';
import { errorText, queryClient } from '@/shared/api/query';
import { keys } from '@/shared/api/queryKeys';
import { PERMISSION_LABELS, ROLE_LABELS } from '@/shared/i18n/ru';
import type { Permission, UserRole } from '@/shared/types/common';
import { Card, CardTitle, Chips, FieldGroup, FieldLabel, Note, Row, SmallTag, Stack, Text, ToneLabel, uiStyles as s } from '@/shared/ui';

import { PermissionsEditor } from './PermissionsEditor';

export function MembersList({ members, editable, myId }: { members: Member[]; editable: boolean; myId: string }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refresh = () => void queryClient.invalidateQueries({ queryKey: keys.members });

  const approve = useMutation({
    mutationFn: (id: string) => teamApi.approve(id),
    onSuccess: () => {
      refresh();
      void queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
    onError: (e) => setError(errorText(e)),
  });

  return (
    <Card>
      <CardTitle>Сотрудники</CardTitle>
      {error && <Note tone='negative'>{error}</Note>}
      <Stack gap={0}>
        {members
          .filter((m) => m.status !== 'disabled')
          .map((m) => (
            <div key={m.id} style={{ padding: '14px 0', borderTop: '1px solid var(--color-light-bg-tertiary, #e7e8ea)' }}>
              <Row gap={12} justify='space-between'>
                <Row gap={12} style={{ flex: '1 1 280px' }}>
                  <span className={s.avatar}>
                    {m.last_name[0]}
                    {m.first_name[0]}
                  </span>
                  <div>
                    <Row gap={8}>
                      <Text medium>
                        {m.last_name} {m.first_name} {m.middle_name ?? ''}
                      </Text>
                      {m.user_id === myId && <SmallTag tone='info'>вы</SmallTag>}
                      {m.has_alfa_business_access && <SmallTag tone='positive'>из ЛК</SmallTag>}
                    </Row>
                    <Text small secondary tag='div'>
                      {ROLE_LABELS[m.role]}
                      {m.login ? ` · ${m.login}` : ''}
                    </Text>
                    <Text small secondary tag='div'>
                      {m.permissions.map((p) => PERMISSION_LABELS[p]).join(', ') || 'Без прав'}
                    </Text>
                  </div>
                </Row>
                <Row gap={8}>
                  <ToneLabel tone={MEMBER_STATUS[m.status].tone} small>
                    {MEMBER_STATUS[m.status].label}
                  </ToneLabel>
                  {editable && m.status === 'pending_approval' && (
                    <Button view='primary' size={32} onClick={() => approve.mutate(m.id)} loading={approve.isPending && approve.variables === m.id}>
                      Подтвердить
                    </Button>
                  )}
                  {editable && m.user_id !== myId && m.status !== 'pending_approval' && (
                    <Button view='secondary' size={32} onClick={() => setEditing(editing === m.id ? null : m.id)}>
                      Права
                    </Button>
                  )}
                </Row>
              </Row>
              {editing === m.id && <MemberEditor member={m} onDone={() => setEditing(null)} />}
            </div>
          ))}
      </Stack>
    </Card>
  );
}

function MemberEditor({ member, onDone }: { member: Member; onDone: () => void }) {
  const [role, setRole] = useState<UserRole>(member.role);
  const [perms, setPerms] = useState<Permission[]>(member.permissions);
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () => teamApi.patch(member.id, { role, permissions: perms }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.members });
      onDone();
    },
    onError: (e) => setError(errorText(e)),
  });
  return (
    <Stack gap={16} style={{ marginTop: 16, padding: 16, borderRadius: 16, background: 'var(--color-light-bg-secondary, #f2f3f5)' }}>
      <FieldGroup label={<FieldLabel>Роль</FieldLabel>}>
        <Chips
          options={ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] }))}
          value={role}
          onChange={(r) => {
            setRole(r);
            setPerms(DEFAULT_PERMISSIONS[r]);
          }}
        />
      </FieldGroup>
      <PermissionsEditor value={perms} onChange={setPerms} />
      {error && <Text color='negative'>{error}</Text>}
      <Row gap={8}>
        <Button view='primary' size={40} onClick={() => save.mutate()} loading={save.isPending}>
          Сохранить
        </Button>
        <Button view='transparent' size={40} onClick={onDone}>
          Отмена
        </Button>
      </Row>
    </Stack>
  );
}
