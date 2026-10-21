import { useNavigate } from 'react-router-dom';
import { Button } from '@alfalab/core-components/button';

import { useCompanyProfile } from '@/features/company/hooks';
import { TAX_REGIME_LABELS } from '@/shared/i18n/ru';
import { businessAge } from '@/shared/lib/business';
import { Card, CardTitle, FieldTag, InfoRow, InfoRows, QueryGate, SourcedValue } from '@/shared/ui';

export function CompanyStep() {
  const profile = useCompanyProfile();
  const navigate = useNavigate();
  return (
    <QueryGate query={profile}>
      {({ company, from_lk }) => (
        <Card>
          <CardTitle
            right={
              <Button view='transparent' size={32} onClick={() => navigate('/onboarding/company')}>
                Изменить
              </Button>
            }
          >
            Данные компании
          </CardTitle>
          <InfoRows>
            <InfoRow label='Компания'>
              {company.short_name} <FieldTag kind='auto' />
            </InfoRow>
            <InfoRow label='ИНН'>
              {company.inn} <FieldTag kind='auto' />
            </InfoRow>
            <InfoRow label='Возраст бизнеса'>
              {businessAge(company.registration_date)} <FieldTag kind='auto' />
            </InfoRow>
            <InfoRow label='ОКВЭД'>
              {company.okved_main} <FieldTag kind='auto' />
            </InfoRow>
            <InfoRow label='Сотрудников'>
              <SourcedValue value={from_lk.employees_count} render={(v) => (v === null ? 'нет данных' : `${v}`)} />
            </InfoRow>
            <InfoRow label='Налоговый режим'>
              <SourcedValue value={from_lk.tax_regime} render={(v) => (v ? TAX_REGIME_LABELS[v] : 'нет данных')} />
            </InfoRow>
          </InfoRows>
        </Card>
      )}
    </QueryGate>
  );
}
