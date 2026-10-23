import { useState } from 'react';

import { ExtraFields, RegistryActions, RegistryBadge, RequisitesGrid, useCompanyForm } from '@/features/company/components/companyForm';
import { progressText } from '@/features/company/components/CompanyProfileModal';
import { useCompanyProfile } from '@/features/company/hooks';
import type { CompanyProfile } from '@/features/company/types';
import t from '@/features/team/components/team.module.css';
import { TAX_REGIME_LABELS } from '@/shared/i18n/ru';
import { formatMoney } from '@/shared/lib/format';
import { Accordion, Bar, Box, Btn, Panel, QueryGate, Stack } from '@/shared/ui';

export function CompanyTab() {
  const profile = useCompanyProfile();
  return <QueryGate query={profile}>{(p) => <CompanyForm profile={p} />}</QueryGate>;
}

function CompanyForm({ profile }: { profile: CompanyProfile }) {
  const form = useCompanyForm(profile);
  const [saved, setSaved] = useState(false);
  const percent = Math.min(100, profile.completeness_percent);
  const lk = profile.from_lk;

  return (
    <div>
      <Stack gap={16}>
        <Panel>
          <div className={t.progress}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 10 }}>Профиль заполнен на {percent}%</div>
              <Bar value={percent} />
            </div>
            <div className={t.muted} style={{ fontSize: 15 }}>
              {progressText(form.missing)}
            </div>
          </div>
        </Panel>
        <div className={t.companyLayout}>
          <Stack gap={14}>
            <Box title='Реквизиты компании' right={<RegistryBadge profile={profile} />}>
              <RequisitesGrid profile={profile} />
              <div style={{ marginTop: 18 }}>
                <RegistryActions form={form} />
              </div>
            </Box>
            <Accordion title='Контакты и банковские реквизиты' subtitle='Из Альфа-Бизнеса'>
              <dl style={{ margin: 0, display: 'grid', gap: 8 }}>
                <div>Сотрудников: {lk.employees_count.value ?? 'нет данных'}</div>
                <div>Поступления в месяц: {formatMoney(lk.monthly_inflow_avg.value)}</div>
                <div>Налоговый режим: {lk.tax_regime.value ? TAX_REGIME_LABELS[lk.tax_regime.value] : 'нет данных'}</div>
                <div>Кредиты в Альфа-Банке: {lk.alfa_loans.value.count ? `${lk.alfa_loans.value.count}, платёж ${formatMoney(lk.alfa_loans.value.monthly_payment)} в месяц` : 'нет'}</div>
              </dl>
            </Accordion>
          </Stack>
          <Box
            title={
              <div>
                <h2 style={{ margin: 0, fontSize: 20 }}>Дополнительные сведения</h2>
                <div className={t.muted} style={{ marginTop: 2 }}>
                  Запрашиваем только то, чего нет в доступных источниках
                </div>
              </div>
            }
          >
            <ExtraFields form={form} />
            <div className={t.muted} style={{ marginTop: 14 }}>
              Эти сведения помогут точнее подобрать финансирование
            </div>
          </Box>
        </div>
      </Stack>
      {form.error && <div style={{ color: 'var(--a-red)', marginTop: 12 }}>{form.error}</div>}
      <div className={t.footer}>
        <span className={t.muted}>{saved ? 'Изменения сохранены.' : 'Можно дополнить позже. Для конкретной заявки могут потребоваться уточнения.'}</span>
        <Btn
          size='l'
          disabled={!form.canEdit}
          loading={form.save.isPending}
          onClick={async () => {
            await form.save.mutateAsync();
            setSaved(true);
          }}
        >
          Сохранить изменения
        </Btn>
      </div>
    </div>
  );
}
