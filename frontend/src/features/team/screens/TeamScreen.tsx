import { useNavigate } from 'react-router-dom';
import { Button } from '@alfalab/core-components/button';

import { can } from '@/app/access';
import { useCurrentHome } from '@/features/profile/components/AppShell/AppShell';
import { MembersList } from '@/features/team/components/MembersList';
import { SigningRulesCard } from '@/features/team/components/SigningRulesCard';
import { useMembers, useSigningRules } from '@/features/team/hooks';
import { PageHeader, QueryGate, Stack } from '@/shared/ui';

export function TeamScreen() {
  const navigate = useNavigate();
  const home = useCurrentHome();
  const members = useMembers();
  const rules = useSigningRules();
  const isOwner = can(home, 'manage_team');

  return (
    <div>
      <PageHeader
        title='Команда'
        subtitle={isOwner ? 'Сотрудники, их права и правила подписи' : 'Только просмотр: права меняет собственник'}
        right={
          isOwner ? (
            <Button view='primary' size={48} onClick={() => navigate('/team/invite')}>
              Пригласить
            </Button>
          ) : undefined
        }
      />
      <Stack gap={16}>
        <QueryGate query={members}>{(list) => <MembersList members={list} editable={isOwner} myId={home.id} />}</QueryGate>
        <QueryGate query={rules}>{(r) => <SigningRulesCard rules={r} members={members.data ?? []} editable={isOwner} />}</QueryGate>
      </Stack>
    </div>
  );
}
