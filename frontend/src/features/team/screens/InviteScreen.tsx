import { type FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@alfalab/core-components/button';
import { Input } from '@alfalab/core-components/input';

import { ROLE_PERMISSIONS as DEFAULT_PERMISSIONS } from '@/app/access';
import { useCurrentHome } from '@/features/profile/components/AppShell/AppShell';
import { teamApi } from '@/features/team/api';
import { PermissionsEditor } from '@/features/team/components/PermissionsEditor';
import { ROLES } from '@/features/team/constants';
import type { InviteResponse } from '@/features/team/types';
import { errorText, fieldErrors, queryClient } from '@/shared/api/query';
import { keys } from '@/shared/api/queryKeys';
import { ROLE_LABELS } from '@/shared/i18n/ru';
import { formatDateTime } from '@/shared/lib/format';
import type { Permission, UserRole } from '@/shared/types/common';
import { Card, Chips, FieldGroup, FieldLabel, FieldTag, Note, PageHeader, Row, Stack, Text, uiStyles as s } from '@/shared/ui';

export function InviteScreen() {
  const navigate = useNavigate();
  const home = useCurrentHome();
  const [last, setLast] = useState('');
  const [first, setFirst] = useState('');
  const [middle, setMiddle] = useState('');
  const [role, setRole] = useState<UserRole | null>(null);
  const [email, setEmail] = useState('');
  const [perms, setPerms] = useState<Permission[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [result, setResult] = useState<InviteResponse | null>(null);
  const [copied, setCopied] = useState(false);

  const invite = useMutation({
    mutationFn: () =>
      teamApi.invite({
        last_name: last.trim(),
        first_name: first.trim(),
        middle_name: middle.trim() || undefined,
        role: role!,
        login_email: email.trim(),
        permissions: perms,
      }),
    onSuccess: (r) => {
      setResult(r);
      void queryClient.invalidateQueries({ queryKey: keys.members });
    },
    onError: (e) => setErrors(Object.keys(fieldErrors(e)).length ? fieldErrors(e) : { form: errorText(e) }),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!last.trim()) next.last_name = 'Укажите фамилию';
    if (!first.trim()) next.first_name = 'Укажите имя';
    if (!role) next.role = 'Выберите роль';
    if (!email.includes('@')) next.login_email = 'Укажите почту для входа';
    setErrors(next);
    if (!Object.keys(next).length) invite.mutate();
  };

  if (result) {
    return (
      <div>
        <PageHeader title='Приглашение создано' />
        <Card>
          <Stack gap={16}>
            <Text>
              Передайте код сотруднику: {result.member.last_name} {result.member.first_name}, {ROLE_LABELS[result.member.role].toLowerCase()}. Он введёт его на странице «Присоединиться по приглашению»
            </Text>
            <div className={s.demoCode} style={{ fontSize: 28, padding: '16px 20px', alignSelf: 'flex-start' }}>
              <b>{result.invite_code}</b>
            </div>
            <Text small secondary>
              Действует до {formatDateTime(result.expires_at)}
            </Text>
            <Row gap={12}>
              <Button
                view='primary'
                size={48}
                onClick={() => {
                  void navigator.clipboard?.writeText(result.invite_code);
                  setCopied(true);
                }}
              >
                {copied ? 'Код скопирован' : 'Скопировать код'}
              </Button>
              <Button view='secondary' size={48} onClick={() => navigate('/team')}>
                К команде
              </Button>
            </Row>
          </Stack>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title='Пригласить сотрудника' subtitle='Паспорт и пароль не нужны: сотрудник сам придумает пароль по коду приглашения' />
      <Card>
        <form onSubmit={submit} noValidate>
          <Stack gap={20}>
            <div className={s.grid3}>
              <Input label='Фамилия' size={56} block value={last} onChange={(_, { value }) => setLast(value)} error={errors.last_name} rightAddons={<FieldTag kind='required' />} />
              <Input label='Имя' size={56} block value={first} onChange={(_, { value }) => setFirst(value)} error={errors.first_name} rightAddons={<FieldTag kind='required' />} />
              <Input label='Отчество' size={56} block value={middle} onChange={(_, { value }) => setMiddle(value)} />
            </div>
            <FieldGroup label={<FieldLabel tag='required'>Роль</FieldLabel>} error={errors.role}>
              <Chips
                options={ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] }))}
                value={role}
                onChange={(r) => {
                  setRole(r);
                  setPerms(DEFAULT_PERMISSIONS[r]);
                }}
              />
            </FieldGroup>
            <Input
              label='Почта для входа'
              type='email'
              size={56}
              block
              value={email}
              onChange={(_, { value }) => setEmail(value)}
              error={errors.login_email}
              rightAddons={<FieldTag kind='required' />}
            />
            {role && <PermissionsEditor value={perms} onChange={setPerms} />}
            {errors.form && <Note tone='negative'>{errors.form}</Note>}
            <Row gap={12}>
              <Button type='submit' view='primary' size={56} loading={invite.isPending}>
                Отправить приглашение
              </Button>
              <Button view='secondary' size={56} onClick={() => navigate('/team')}>
                Отмена
              </Button>
            </Row>
          </Stack>
        </form>
      </Card>
    </div>
  );
}
