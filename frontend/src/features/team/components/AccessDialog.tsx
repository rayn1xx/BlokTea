import { useState } from 'react';
import type { ComponentType, SVGProps } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { ArrowUpMIcon } from '@alfalab/icons-glyph/ArrowUpMIcon';
import { DocumentLinesMIcon } from '@alfalab/icons-glyph/DocumentLinesMIcon';
import { GearMIcon } from '@alfalab/icons-glyph/GearMIcon';
import { LockClosedMIcon } from '@alfalab/icons-glyph/LockClosedMIcon';
import { PaperAirplaneMIcon } from '@alfalab/icons-glyph/PaperAirplaneMIcon';
import { PencilMIcon } from '@alfalab/icons-glyph/PencilMIcon';

import { teamApi } from '@/features/team/api';
import type { Member } from '@/features/team/types';
import { errorText, queryClient } from '@/shared/api/query';
import { keys } from '@/shared/api/queryKeys';
import { ROLE_LABELS } from '@/shared/i18n/ru';
import type { Permission } from '@/shared/types/common';
import { Avatar, Btn, Dialog, ModalFooter, Options, Stack, TextLink, Toggle } from '@/shared/ui';

import t from './team.module.css';

export type Scope = 'assigned' | 'selected' | 'all';

export const SCOPE_OPTIONS: { value: Scope; label: string; description: string }[] = [
  { value: 'assigned', label: 'Только назначенные', description: 'Доступ к заявкам, где сотрудник назначен исполнителем' },
  { value: 'selected', label: 'К выбранным заявкам', description: 'Доступ к определённым заявкам, которые вы укажете' },
  { value: 'all', label: 'Ко всем заявкам компании', description: 'Полный доступ ко всем заявкам компании' },
];

type ActionRow = { key: string; icon: ComponentType<SVGProps<SVGSVGElement>>; title: string; text: string; permission: Permission | null };

const ACTIONS: ActionRow[] = [
  { key: 'view', icon: DocumentLinesMIcon, title: 'Просматривать назначенные заявки', text: 'Статусы и документы в пределах доступа', permission: null },
  { key: 'upload', icon: ArrowUpMIcon, title: 'Загружать документы и отвечать банку', text: 'Добавление документов, ответы на запросы банка', permission: 'upload_documents' },
  { key: 'drafts', icon: PencilMIcon, title: 'Готовить и редактировать черновики', text: 'Создание и редактирование черновиков заявок', permission: 'submit_applications' },
  { key: 'send', icon: PaperAirplaneMIcon, title: 'Отправлять заявки в банк', text: 'Отправка готовых заявок в банк', permission: 'submit_applications' },
];

export function ActionToggles({ value, onChange }: { value: Permission[]; onChange: (v: Permission[]) => void }) {
  const toggle = (p: Permission, on: boolean) => onChange(on ? [...new Set([...value, p])] : value.filter((x) => x !== p));
  return (
    <div className={t.actions}>
      {ACTIONS.map((a) => (
        <div key={a.key} className={t.actionRow}>
          <a.icon className={t.actionIcon} />
          <div style={{ flex: 1 }}>
            <div className={t.actionTitle}>{a.title}</div>
            <div className={t.muted}>{a.text}</div>
          </div>
          <Toggle label={a.title} checked={a.permission ? value.includes(a.permission) : true} disabled={!a.permission} onChange={(on) => a.permission && toggle(a.permission, on)} />
        </div>
      ))}
    </div>
  );
}

export function ExtraRights({ value, onChange }: { value: Permission[]; onChange: (v: Permission[]) => void }) {
  const [open, setOpen] = useState(false);
  const toggle = (p: Permission, on: boolean) => onChange(on ? [...new Set([...value, p])] : value.filter((x) => x !== p));
  return (
    <div className={t.extra}>
      <button type='button' className={t.extraHead} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <GearMIcon className={t.actionIcon} />
        <span style={{ flex: 1 }}>
          <span className={t.actionTitle}>Дополнительные настройки</span>
          <span className={t.muted}>Решения по предложениям банка и управление сотрудниками</span>
        </span>
        <span className={t.muted}>{open ? 'Свернуть' : 'Развернуть'}</span>
      </button>
      {open && (
        <div className={t.actions} style={{ border: 0, marginTop: 4 }}>
          {(
            [
              ['accept_offers', 'Принимать предложения банка'],
              ['manage_team', 'Управлять сотрудниками'],
            ] as [Permission, string][]
          ).map(([p, title]) => (
            <div key={p} className={t.actionRow}>
              <div style={{ flex: 1 }} className={t.actionTitle}>
                {title}
              </div>
              <Toggle label={title} checked={value.includes(p)} onChange={(on) => toggle(p, on)} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function AccessDialog({ member, assigned, onClose }: { member: Member; assigned?: string; onClose: () => void }) {
  const navigate = useNavigate();
  const [scope, setScope] = useState<Scope>('assigned');
  const [perms, setPerms] = useState<Permission[]>(member.permissions);
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () => teamApi.patch(member.id, { permissions: perms }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.members });
      onClose();
    },
    onError: (e) => setError(errorText(e)),
  });
  const name = `${member.first_name} ${member.last_name}`;
  return (
    <Dialog
      open
      onClose={onClose}
      title='Настроить доступ'
      footer={
        <ModalFooter note='Изменения применятся после сохранения.'>
          <Btn variant='outline' size='l' onClick={onClose}>
            Отмена
          </Btn>
          <Btn size='l' loading={save.isPending} onClick={() => save.mutate()}>
            Сохранить доступ
          </Btn>
        </ModalFooter>
      }
    >
      <Stack gap={18}>
        <div className={t.person}>
          <Avatar name={name} large />
          <div>
            <b>{name}</b>
            <div className={t.muted}>{ROLE_LABELS[member.role]}</div>
          </div>
        </div>
        <div>
          <div className={t.groupTitle}>К каким заявкам есть доступ</div>
          <Options radio columns={1} options={SCOPE_OPTIONS} value={scope} onChange={setScope} />
          {scope === 'assigned' && assigned && <div className={t.assigned}>Сейчас назначена {assigned}</div>}
        </div>
        <div>
          <div className={t.groupTitle}>Разрешённые действия</div>
          <ActionToggles value={perms} onChange={setPerms} />
        </div>
        <div className={t.signRow}>
          <LockClosedMIcon className={t.actionIcon} />
          <div style={{ flex: 1 }}>
            <div className={t.actionTitle}>Подписание документов</div>
            <div className={perms.includes('sign') ? t.granted : t.denied}>{perms.includes('sign') ? 'Предоставлено' : 'Не предоставлено'}</div>
            <div className={t.muted}>Требуется подтверждение полномочий</div>
          </div>
          <TextLink arrow onClick={() => navigate('/team/signing')}>
            Как подключить
          </TextLink>
        </div>
        <ExtraRights value={perms} onChange={setPerms} />
        {error && <div style={{ color: 'var(--a-red)' }}>{error}</div>}
      </Stack>
    </Dialog>
  );
}
