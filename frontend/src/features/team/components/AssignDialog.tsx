import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDownMIcon } from '@alfalab/icons-glyph/ChevronDownMIcon';
import { DocumentMIcon } from '@alfalab/icons-glyph/DocumentMIcon';
import { UserPlusMIcon } from '@alfalab/icons-glyph/UserPlusMIcon';

import { can } from '@/app/access';
import { useHome } from '@/features/profile/hooks';
import { useMembers } from '@/features/team/hooks';
import type { Member } from '@/features/team/types';
import { errorText, fieldErrors } from '@/shared/api/query';
import { ROLE_LABELS } from '@/shared/i18n/ru';
import type { Permission } from '@/shared/types/common';
import { Avatar, Btn, Dialog, IconCircle, InfoLine, SearchField, SkeletonLines, Stack, TextArea, TextLink } from '@/shared/ui';

import a from './assign.module.css';

const CAN_TEXT: Record<Permission, string> = {
  upload_documents: 'Может загружать документы',
  submit_applications: 'Может отправлять заявки',
  sign: 'Может подписывать',
  accept_offers: 'Может принимать предложения',
  manage_team: 'Может управлять командой',
};

export function AssignDialog({
  title = 'Назначить сотрудника',
  taskTitle,
  taskSubtitle,
  permission,
  excludeUserId,
  onClose,
  onAssign,
}: {
  title?: string;
  taskTitle: string;
  taskSubtitle?: string;
  permission: Permission;
  excludeUserId?: string;
  onClose: () => void;
  onAssign: (member: Member, comment: string) => Promise<unknown>;
}) {
  const navigate = useNavigate();
  const home = useHome();
  const members = useMembers();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [comment, setComment] = useState('');
  const [commentOpen, setCommentOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const q = query.trim().toLowerCase();
  const list = (members.data ?? [])
    .filter((m) => m.status === 'active' && m.user_id !== excludeUserId)
    .filter((m) => !q || `${m.last_name} ${m.first_name} ${ROLE_LABELS[m.role]}`.toLowerCase().includes(q));
  const chosen = list.find((m) => m.id === selected);

  const submit = async () => {
    if (!chosen) return;
    setPending(true);
    setError(null);
    try {
      await onAssign(chosen, comment);
      onClose();
    } catch (e) {
      setError(fieldErrors(e).member_id ?? errorText(e));
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={title}
      footer={
        <div style={{ width: '100%' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 12 }}>
            <Btn variant='outline' size='l' block onClick={onClose}>
              Отмена
            </Btn>
            <Btn size='l' block disabled={!chosen} loading={pending} onClick={submit}>
              {chosen ? `Назначить: ${chosen.first_name}` : 'Назначить'}
            </Btn>
          </div>
          <div className={a.note}>Задача появится у сотрудника в кабинете</div>
        </div>
      }
    >
      <Stack gap={14}>
        <div className={a.task}>
          <IconCircle icon={DocumentMIcon} style={{ background: '#fff' }} />
          <div>
            <b>{taskTitle}</b>
            {taskSubtitle && <div className={a.muted}>{taskSubtitle}</div>}
          </div>
        </div>
        <SearchField value={query} onChange={setQuery} placeholder='Поиск по имени или должности' />
        <div className={a.label}>Сотрудники компании</div>
        {members.isLoading ? (
          <SkeletonLines lines={3} />
        ) : (
          <div className={a.list} role='radiogroup'>
            {list.map((m) => {
              const allowed = m.permissions.includes(permission);
              return (
                <button
                  key={m.id}
                  type='button'
                  role='radio'
                  aria-checked={selected === m.id}
                  disabled={!allowed}
                  className={`${a.item} ${selected === m.id ? a.itemActive : ''}`}
                  onClick={() => setSelected(m.id)}
                >
                  <Avatar name={`${m.first_name} ${m.last_name}`} />
                  <span className={a.itemText}>
                    <b>
                      {m.first_name} {m.last_name}
                    </b>
                    <span className={a.muted}>{ROLE_LABELS[m.role]}</span>
                    <span className={a.muted}>{allowed ? CAN_TEXT[permission] : 'Нет доступа к этой задаче'}</span>
                  </span>
                  <span className={a.radio} />
                </button>
              );
            })}
          </div>
        )}
        {can(home.data, 'manage_team') && (
          <>
            <Btn variant='outline' size='l' block leftAddons={<UserPlusMIcon style={{ width: 18, height: 18 }} />} onClick={() => navigate('/team?invite=1')}>
              Добавить сотрудника
            </Btn>
            <div className={a.center}>Если сотрудника ещё нет в списке</div>
          </>
        )}
        <div className={a.footerRow}>
          <InfoLine>Назначение задачи не меняет права сотрудника.</InfoLine>
          <TextLink tone='blue' arrow onClick={() => navigate('/team')}>
            Управление сотрудниками
          </TextLink>
        </div>
        <button type='button' className={a.commentToggle} onClick={() => setCommentOpen((v) => !v)}>
          <ChevronDownMIcon style={{ width: 18, height: 18, transform: commentOpen ? 'rotate(180deg)' : undefined }} /> Добавить комментарий
        </button>
        {commentOpen && <TextArea value={comment} onChange={setComment} placeholder='Комментарий для сотрудника' />}
        {error && <div style={{ color: 'var(--a-red)' }}>{error}</div>}
      </Stack>
    </Dialog>
  );
}
