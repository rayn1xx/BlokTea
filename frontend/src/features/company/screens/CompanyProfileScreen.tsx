import { useNavigate } from 'react-router-dom';

import { useCompanyProfile } from '@/features/company/hooks';
import type { CompanyProfile } from '@/features/company/types';
import { plural } from '@/shared/lib/format';
import { Bar, Btn, Card, PageHead, Panel, QueryGate, Row, Stack, Text } from '@/shared/ui';

import { ExtraFields, RegistryActions, RegistryBadge, RequisitesGrid, useCompanyForm } from '../components/companyForm';

export function progressText(missing: number) {
  return missing ? `Подтвердите реквизиты и дополните ${missing} ${plural(missing, 'сведение', 'сведения', 'сведений')}` : 'Все сведения заполнены';
}

export function CompanyProfileScreen() {
  const profile = useCompanyProfile();
  return <QueryGate query={profile}>{(data) => <ProfileView profile={data} />}</QueryGate>;
}

function ProfileView({ profile }: { profile: CompanyProfile }) {
  const navigate = useNavigate();
  const form = useCompanyForm(profile);
  const percent = Math.min(100, profile.completeness_percent);
  const leave = () => navigate('/home');

  return (
    <div>
      <PageHead back={{ label: 'Назад', to: '/home' }} title='Профиль компании' subtitle='Данные для подбора финансирования' />
      <Stack gap={16}>
        <Panel>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 10 }}>Профиль заполнен на {percent}%</div>
          <Bar value={percent} />
          <div style={{ marginTop: 10, fontSize: 14, color: 'var(--a-text-2)' }}>{progressText(form.missing)}</div>
        </Panel>
        <Card
          title={
            <Row gap={12}>
              <h2 style={{ margin: 0, fontSize: 18 }}>Реквизиты компании</h2>
              <RegistryBadge profile={profile} />
            </Row>
          }
        >
          <RequisitesGrid profile={profile} compact />
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--a-border)' }}>
            <RegistryActions form={form} />
          </div>
        </Card>
        <Card
          title={
            <div>
              <h2 style={{ margin: 0, fontSize: 18 }}>Дополните сведения</h2>
              <div style={{ fontSize: 14, color: 'var(--a-text-2)', marginTop: 2 }}>Спрашиваем только то, чего нет в доступных источниках</div>
            </div>
          }
        >
          <ExtraFields form={form} inline />
        </Card>
        {form.error && <Text color='negative' tag='div'>{form.error}</Text>}
        <Row gap={12}>
          <Btn
            size='l'
            loading={form.save.isPending}
            disabled={!form.canEdit}
            onClick={async () => {
              await form.save.mutateAsync();
              leave();
            }}
          >
            Сохранить
          </Btn>
          <Btn
            variant='outline'
            size='l'
            loading={form.later.isPending}
            onClick={async () => {
              await form.later.mutateAsync();
              leave();
            }}
          >
            Заполнить позже
          </Btn>
          <span style={{ fontSize: 14, color: 'var(--a-text-2)' }}>Можно дополнить позже. Для заявки могут потребоваться уточнения.</span>
        </Row>
      </Stack>
    </div>
  );
}
