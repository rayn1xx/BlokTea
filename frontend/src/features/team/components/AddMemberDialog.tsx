import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { LockClosedMIcon } from '@alfalab/icons-glyph/LockClosedMIcon';

import { ROLE_PERMISSIONS } from '@/app/access';
import { teamApi } from '@/features/team/api';
import type { InviteResponse } from '@/features/team/types';
import { errorText, fieldErrors, queryClient } from '@/shared/api/query';
import { keys } from '@/shared/api/queryKeys';
import { ROLE_LABELS } from '@/shared/i18n/ru';
import { formatShortDateTime } from '@/shared/lib/format';
import type { Permission, UserRole } from '@/shared/types/common';
import { Btn, CheckField, Dialog, Field, InfoLine, ModalFooter, Options, SelectField, Stack, TextField } from '@/shared/ui';

import { ExtraRights, SCOPE_OPTIONS } from './AccessDialog';
import type { Scope } from './AccessDialog';
import t from './team.module.css';

export function AddMemberDialog({ companyName, onClose }: { companyName: string; onClose: () => void }) {
  const [fio, setFio] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UserRole>('cfo_or_accountant');
  const [scope, setScope] = useState<Scope>('assigned');
  const [perms, setPerms] = useState<Permission[]>(ROLE_PERMISSIONS.cfo_or_accountant.filter((p) => p !== 'sign'));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [result, setResult] = useState<InviteResponse | null>(null);
  const [copied, setCopied] = useState(false);

  const [last = '', first = '', ...rest] = fio.trim().split(/\s+/);
  const valid = !!(last && first && email.includes('@'));

  const invite = useMutation({
    mutationFn: () => teamApi.invite({ last_name: last, first_name: first, middle_name: rest.join(' ') || undefined, role, login_email: email.trim(), permissions: perms }),
    onSuccess: (r) => {
      setResult(r);
      void queryClient.invalidateQueries({ queryKey: keys.members });
    },
    onError: (e) => setErrors(Object.keys(fieldErrors(e)).length ? fieldErrors(e) : { form: errorText(e) }),
  });

  const toggle = (p: Permission, on: boolean) => setPerms(on ? [...new Set([...perms, p])] : perms.filter((x) => x !== p));

  if (result) {
    return (
      <Dialog
        open
        onClose={onClose}
        title='Сотрудник добавлен'
        subtitle={`${result.member.last_name} ${result.member.first_name} · ${ROLE_LABELS[result.member.role]}`}
        footer={
          <ModalFooter note={`Код действует до ${formatShortDateTime(result.expires_at)}`}>
            <Btn
              variant='outline'
              size='l'
              onClick={() => {
                void navigator.clipboard?.writeText(result.invite_code);
                setCopied(true);
              }}
            >
              {copied ? 'Код скопирован' : 'Скопировать код'}
            </Btn>
            <Btn size='l' onClick={onClose}>
              Готово
            </Btn>
          </ModalFooter>
        }
      >
        <Stack gap={14}>
          <div>Передайте код сотруднику. Он введёт его на странице «Присоединиться по приглашению» и придумает пароль.</div>
          <div className={t.code}>{result.invite_code}</div>
          <InfoLine>После этого вы подтвердите доступ в разделе «Команда».</InfoLine>
        </Stack>
      </Dialog>
    );
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title='Добавить сотрудника'
      subtitle={companyName}
      footer={
        <ModalFooter>
          <Btn variant='outline' size='l' onClick={onClose}>
            Отмена
          </Btn>
          <Btn size='l' disabled={!valid} loading={invite.isPending} onClick={() => invite.mutate()}>
            Добавить сотрудника
          </Btn>
        </ModalFooter>
      }
    >
      <Stack gap={16}>
        <div className={t.muted}>Укажите данные и доступ. Сотрудник подтвердит подключение в кабинете.</div>
        <Field label='ФИО *' error={errors.last_name || errors.first_name}>
          <TextField value={fio} onChange={setFio} placeholder='Фамилия Имя Отчество' />
        </Field>
        <Field label='Email или логин сотрудника *' error={errors.login_email}>
          <TextField value={email} onChange={setEmail} placeholder='Для связи с учётной записью' type='email' inputMode='email' />
        </Field>
        <Field label='Должность' hint='Должность не определяет полномочия'>
          <SelectField
            value={role}
            options={(Object.keys(ROLE_LABELS) as UserRole[]).map((r) => ({ value: r, label: ROLE_LABELS[r] }))}
            onChange={(r) => {
              setRole(r);
              setPerms(ROLE_PERMISSIONS[r].filter((p) => p !== 'sign'));
            }}
            ariaLabel='Должность'
          />
        </Field>
        <Field label='Доступ к заявкам'>
          <Options radio columns={1} options={SCOPE_OPTIONS.map(({ value, label }) => ({ value, label }))} value={scope} onChange={setScope} />
        </Field>
        <Field label='Что сможет делать'>
          <Stack gap={10}>
            <CheckField checked disabled onChange={() => undefined} label='Просматривать доступные заявки' />
            <CheckField checked={perms.includes('upload_documents')} onChange={(v) => toggle('upload_documents', v)} label='Загружать документы и отвечать банку' />
            <CheckField checked={perms.includes('submit_applications')} onChange={(v) => toggle('submit_applications', v)} label='Готовить черновики и отправлять заявки' />
          </Stack>
        </Field>
        <ExtraRights value={perms} onChange={setPerms} />
        <div className={t.signNote}>
          <LockClosedMIcon className={t.actionIcon} /> Право подписи подключается отдельно
        </div>
        <InfoLine>После добавления потребуется подтверждение сотрудника.</InfoLine>
        {errors.form && <div style={{ color: 'var(--a-red)' }}>{errors.form}</div>}
      </Stack>
    </Dialog>
  );
}
