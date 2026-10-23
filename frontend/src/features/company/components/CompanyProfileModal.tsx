import { useCompanyProfile } from '@/features/company/hooks';
import type { CompanyProfile } from '@/features/company/types';
import { plural } from '@/shared/lib/format';
import { Bar, Box, Btn, Dialog, ModalFooter, Panel, QueryGate, Stack } from '@/shared/ui';

import { ExtraFields, RegistryActions, RegistryBadge, RequisitesGrid, useCompanyForm } from './companyForm';

export function CompanyProfileModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const profile = useCompanyProfile();
  if (!open) return null;
  return (
    <QueryGate query={profile} loading={null}>
      {(data) => <ProfileDialog profile={data} onClose={onClose} />}
    </QueryGate>
  );
}

export function progressText(missing: number) {
  return missing ? `Подтвердите реквизиты и дополните ${missing} ${plural(missing, 'сведение', 'сведения', 'сведений')}` : 'Все сведения заполнены';
}

function ProfileDialog({ profile, onClose }: { profile: CompanyProfile; onClose: () => void }) {
  const form = useCompanyForm(profile);
  const percent = Math.min(100, profile.completeness_percent);

  return (
    <Dialog
      open
      onClose={onClose}
      size={800}
      title='Профиль компании'
      subtitle='Данные для подбора финансирования'
      footer={
        <ModalFooter note='Можно дополнить позже. Для заявки могут потребоваться уточнения.'>
          <Btn
            size='l'
            loading={form.save.isPending}
            disabled={!form.canEdit}
            onClick={async () => {
              await form.save.mutateAsync();
              onClose();
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
              onClose();
            }}
          >
            Заполнить позже
          </Btn>
        </ModalFooter>
      }
    >
      <Stack gap={16}>
        <Panel>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 10 }}>Профиль заполнен на {percent}%</div>
          <Bar value={percent} />
          <div style={{ marginTop: 10, fontSize: 14, color: 'var(--a-text-2)' }}>{progressText(form.missing)}</div>
        </Panel>
        <Box
          title={
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <h2 style={{ margin: 0, fontSize: 18 }}>Реквизиты компании</h2>
              <RegistryBadge profile={profile} />
            </div>
          }
        >
          <RequisitesGrid profile={profile} compact />
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--a-border)' }}>
            <RegistryActions form={form} />
          </div>
        </Box>
        <Box
          title={
            <div>
              <h2 style={{ margin: 0, fontSize: 18 }}>Дополните сведения</h2>
              <div style={{ fontSize: 14, color: 'var(--a-text-2)', marginTop: 2 }}>Спрашиваем только то, чего нет в доступных источниках</div>
            </div>
          }
        >
          <ExtraFields form={form} inline />
        </Box>
        {form.error && <div style={{ color: 'var(--a-red)' }}>{form.error}</div>}
      </Stack>
    </Dialog>
  );
}
