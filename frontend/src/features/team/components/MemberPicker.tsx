import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@alfalab/core-components/button';
import { Input } from '@alfalab/core-components/input';

import { can } from '@/app/access';
import { useHome } from '@/features/profile/hooks';
import { useMembers } from '@/features/team/hooks';
import type { Member } from '@/features/team/types';
import { errorText, fieldErrors } from '@/shared/api/query';
import { ROLE_LABELS } from '@/shared/i18n/ru';
import type { Permission } from '@/shared/types/common';
import { Dialog, EmptyState, ErrorState, FieldTag, LoadingState, Stack, Text, uiStyles as s } from '@/shared/ui';

export function MemberPicker({
  open,
  title = 'Передать задачу',
  subtitle,
  permission,
  excludeUserId,
  onClose,
  onSelect,
}: {
  open: boolean;
  title?: string;
  subtitle?: string;

  permission: Permission;
  excludeUserId?: string;
  onClose: () => void;
  onSelect: (member: Member) => Promise<unknown>;
}) {
  const navigate = useNavigate();
  const home = useHome();
  const members = useMembers();
  const [query, setQuery] = useState('');
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const list = (members.data ?? [])
    .filter((m) => m.status === 'active' && m.permissions.includes(permission) && m.user_id !== excludeUserId)
    .filter((m) => {
      const q = query.trim().toLowerCase();
      if (!q) return true;
      return `${m.last_name} ${m.first_name} ${m.middle_name ?? ''} ${ROLE_LABELS[m.role]}`.toLowerCase().includes(q);
    });

  const select = async (m: Member) => {
    setPending(m.id);
    setError(null);
    try {
      await onSelect(m);
      onClose();
    } catch (e) {
      setError(fieldErrors(e).member_id ?? errorText(e));
    } finally {
      setPending(null);
    }
  };

  const canInvite = can(home.data, 'manage_team');

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      subtitle={subtitle}
      footer={
        canInvite ? (
          <Button view='secondary' size={48} onClick={() => navigate('/team/invite')}>
            Добавить нового сотрудника
          </Button>
        ) : undefined
      }
    >
      <Stack gap={12}>
        <Input
          label='Поиск по имени или должности'
          size={48}
          block
          value={query}
          onChange={(_, { value }) => setQuery(value)}
          rightAddons={<FieldTag kind='situational' />}
        />
        {error && <Text color='negative'>{error}</Text>}
        {members.isLoading ? (
          <LoadingState cards={1} />
        ) : members.isError ? (
          <ErrorState error={members.error} onRetry={() => members.refetch()} />
        ) : list.length === 0 ? (
          <EmptyState title='Некому передать' text='Ни у кого из сотрудников нет нужного права. Права выдаёт собственник в разделе «Команда»' />
        ) : (
          <div>
            {list.map((m) => (
              <div key={m.id} className={s.personRow}>
                <span className={s.avatar}>
                  {m.last_name[0]}
                  {m.first_name[0]}
                </span>
                <div className={s.grow}>
                  <Text medium tag='div'>
                    {m.last_name} {m.first_name} {m.middle_name ?? ''}
                  </Text>
                  <Text small secondary tag='div'>
                    {ROLE_LABELS[m.role]}
                  </Text>
                </div>
                <Button view='secondary' size={32} loading={pending === m.id} onClick={() => select(m)}>
                  Выбрать
                </Button>
              </div>
            ))}
          </div>
        )}
      </Stack>
    </Dialog>
  );
}
