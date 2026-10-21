import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@alfalab/core-components/button';
import { Input } from '@alfalab/core-components/input';
import { Textarea } from '@alfalab/core-components/textarea';

import { companyApi } from '@/features/company/api';
import { useCompanyProfile } from '@/features/company/hooks';
import type { CompanyProfile, ExternalDebt } from '@/features/company/types';
import { PageContainer } from '@/features/profile/components/AppShell/AppShell';
import { errorText, fieldErrors, queryClient } from '@/shared/api/query';
import { keys } from '@/shared/api/queryKeys';
import { COLLATERAL_LABELS, TAX_REGIME_LABELS } from '@/shared/i18n/ru';
import { businessAge } from '@/shared/lib/business';
import { formatDate, formatMoney } from '@/shared/lib/format';
import type { CollateralType, Money } from '@/shared/types/common';
import { Card, CardTitle, Chips, FieldGroup, FieldLabel, FieldTag, InfoRow, InfoRows, MoneyInput, Note, NumberInput, PageHeader, QueryGate, Row, SourcedValue, Stack, Text, uiStyles as s } from '@/shared/ui';

export function OnboardingScreen() {
  const profile = useCompanyProfile();
  return (
    <PageContainer>
      <PageHeader
        title='Данные компании'
        subtitle='Мы уже собрали сведения о компании. Проверьте их, и банку не придётся спрашивать это в заявке'
      />
      <QueryGate query={profile}>{(data) => <OnboardingForm profile={data} />}</QueryGate>
    </PageContainer>
  );
}

function OnboardingForm({ profile }: { profile: CompanyProfile }) {
  const navigate = useNavigate();
  const { company, registry, from_lk } = profile;
  const isOOO = company.legal_form === 'OOO';
  const canConfirm = profile.available_actions.includes('company.confirm_registry');
  const canEdit = profile.available_actions.includes('company.edit_details');

  const [issueOpen, setIssueOpen] = useState(false);
  const [issue, setIssue] = useState(registry.issue_comment ?? '');
  const [issueError, setIssueError] = useState<string | null>(null);

  const [editing, setEditing] = useState<null | 'employees' | 'inflow'>(null);
  const [employees, setEmployees] = useState<number | null>(from_lk.employees_count.value);
  const [inflow, setInflow] = useState<Money | null>(from_lk.monthly_inflow_avg.value);

  const [hasDebts, setHasDebts] = useState<'yes' | 'no' | null>(profile.client_input.external_debts.length ? 'yes' : null);
  const [debts, setDebts] = useState<ExternalDebt[]>(profile.client_input.external_debts);
  const [collateral, setCollateral] = useState<CollateralType[]>(profile.client_input.collateral_available);
  const [error, setError] = useState<string | null>(null);

  const refresh = (p: CompanyProfile) => queryClient.setQueryData(keys.companyProfile, p);

  const confirm = useMutation({
    mutationFn: (confirmed: boolean) =>
      companyApi.confirmRegistry(confirmed ? { confirmed } : { confirmed, issue_comment: issue.trim() }),
    onSuccess: (p) => {
      refresh(p);
      setIssueOpen(false);
    },
    onError: (e) => setIssueError(fieldErrors(e).issue_comment ?? errorText(e)),
  });

  const save = useMutation({
    mutationFn: async () => {
      await companyApi.patchDetails({
        external_debts: hasDebts === 'yes' ? debts.filter((d) => d.lender.trim()) : [],
        collateral_available: collateral,
        employees_count: employees,
        ...(inflow ? { monthly_inflow_avg: inflow } : {}),
      });
      await companyApi.completeOnboarding(false);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: keys.home });
      navigate('/home', { replace: true });
    },
    onError: (e) => setError(errorText(e)),
  });

  const skip = useMutation({
    mutationFn: () => companyApi.completeOnboarding(true),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: keys.home });
      navigate('/home', { replace: true });
    },
    onError: (e) => setError(errorText(e)),
  });

  const sendIssue = () => {
    if (!issue.trim()) {
      setIssueError('Опишите, что не так');
      return;
    }
    confirm.mutate(false);
  };

  return (
    <Stack gap={24}>
      <div className={s.grid2}>
        <Card>
          <CardTitle right={<FieldTag kind='auto' />}>Данные из реестра</CardTitle>
          <InfoRows>
            <InfoRow label='Название'>{company.short_name}</InfoRow>
            <InfoRow label={isOOO ? 'ИНН / ОГРН' : 'ИНН / ОГРНИП'}>
              {company.inn} / {company.ogrn}
            </InfoRow>
            {isOOO && <InfoRow label='КПП'>{company.kpp}</InfoRow>}
            <InfoRow label='Дата регистрации'>
              {formatDate(company.registration_date)}, {businessAge(company.registration_date)}
            </InfoRow>
            <InfoRow label='Адрес'>{company.legal_address}</InfoRow>
            <InfoRow label='Основной ОКВЭД'>{company.okved_main}</InfoRow>
            {company.director && <InfoRow label={isOOO ? 'Директор' : 'Предприниматель'}>{company.director.name}</InfoRow>}
            <InfoRow label='Категория МСП'>
              {company.msp_category === 'micro' ? 'Микропредприятие' : company.msp_category === 'small' ? 'Малое предприятие' : 'Среднее предприятие'}
            </InfoRow>
          </InfoRows>
          <Text small secondary tag='p' className={undefined}>
            <br />
            Источник: {registry.source === 'EGRUL' ? 'ЕГРЮЛ' : 'ЕГРИП'}, обновлено {formatDate(registry.fetched_at)}
          </Text>

          <div style={{ marginTop: 16 }}>
            {registry.confirmed ? (
              <Note tone='positive' title='Подтверждено' />
            ) : registry.issue_comment && !issueOpen ? (
              <Note tone='attention' title='Вы сообщили об ошибке'>
                {registry.issue_comment}. Банк проверит данные, а пока заявки можно подавать
              </Note>
            ) : issueOpen ? (
              <Stack gap={12}>
                <Textarea
                  label='Что не так в данных'
                  block
                  minRows={3}
                  value={issue}
                  onChange={(e) => {
                    setIssue(e.target.value);
                    setIssueError(null);
                  }}
                  error={issueError ?? undefined}
                  rightAddons={<FieldTag kind='required' />}
                />
                <Row>
                  <Button view='primary' size={40} onClick={sendIssue} loading={confirm.isPending}>
                    Отправить
                  </Button>
                  <Button view='transparent' size={40} onClick={() => setIssueOpen(false)}>
                    Отмена
                  </Button>
                </Row>
              </Stack>
            ) : (
              <Row>
                <Button view='secondary' size={40} onClick={() => confirm.mutate(true)} loading={confirm.isPending} disabled={!canConfirm}>
                  Всё верно
                </Button>
                <Button view='transparent' size={40} onClick={() => setIssueOpen(true)} disabled={!canConfirm}>
                  Сообщить об ошибке
                </Button>
              </Row>
            )}
          </div>
        </Card>

        <Card>
          <CardTitle right={<FieldTag kind='lk' />}>Что уже есть в Альфа-Бизнесе</CardTitle>
          <InfoRows>
            <InfoRow label='Численность'>
              {editing === 'employees' ? (
                <div style={{ width: '100%' }}>
                  <NumberInput label='Сотрудников' value={employees} onChange={setEmployees} size={48} />
                </div>
              ) : (
                <SourcedValue
                  value={{ ...from_lk.employees_count, value: employees }}
                  render={(v) => (v === null ? 'нет данных' : `${v} чел.`)}
                  onEdit={canEdit ? () => setEditing('employees') : undefined}
                />
              )}
            </InfoRow>
            <InfoRow label='Поступления в месяц'>
              {editing === 'inflow' ? (
                <div style={{ width: '100%' }}>
                  <MoneyInput label='В среднем за 12 месяцев' value={inflow} onChange={setInflow} size={48} />
                </div>
              ) : (
                <SourcedValue
                  value={{ ...from_lk.monthly_inflow_avg, value: inflow ?? from_lk.monthly_inflow_avg.value }}
                  render={(v) => formatMoney(v)}
                  onEdit={canEdit ? () => setEditing('inflow') : undefined}
                />
              )}
            </InfoRow>
            <InfoRow label='Налоговый режим'>
              <SourcedValue value={from_lk.tax_regime} render={(v) => (v ? TAX_REGIME_LABELS[v] : 'нет данных')} />
            </InfoRow>
            <InfoRow label='Кредиты в Альфе'>
              <SourcedValue
                value={from_lk.alfa_loans}
                render={(v) => (v.count ? `${v.count}, платёж ${formatMoney(v.monthly_payment)} в месяц` : 'нет')}
              />
            </InfoRow>
          </InfoRows>

          <div style={{ marginTop: 24 }}>
            <Stack gap={20}>
              <FieldGroup label={<FieldLabel tag='situational'>Есть кредиты в других банках?</FieldLabel>}>
                <Chips
                  options={[
                    { value: 'no', label: 'Нет' },
                    { value: 'yes', label: 'Да' },
                  ]}
                  value={hasDebts}
                  onChange={(v) => {
                    setHasDebts(v);
                    if (v === 'yes' && !debts.length) setDebts([{ lender: '', balance: { value: 0, currency: 'RUB' }, monthly_payment: { value: 0, currency: 'RUB' } }]);
                  }}
                  disabled={!canEdit}
                />
              </FieldGroup>
              {hasDebts === 'yes' &&
                debts.map((d, i) => (
                  <Stack key={i} gap={10}>
                    <NumberInputText
                      label='Банк'
                      value={d.lender}
                      onChange={(v) => setDebts(debts.map((x, j) => (j === i ? { ...x, lender: v } : x)))}
                    />
                    <div className={s.grid2}>
                      <MoneyInput
                        label='Остаток долга'
                        size={48}
                        value={d.balance}
                        onChange={(v) => setDebts(debts.map((x, j) => (j === i ? { ...x, balance: v ?? { value: 0, currency: 'RUB' } } : x)))}
                      />
                      <MoneyInput
                        label='Платёж в месяц'
                        size={48}
                        value={d.monthly_payment}
                        onChange={(v) => setDebts(debts.map((x, j) => (j === i ? { ...x, monthly_payment: v ?? { value: 0, currency: 'RUB' } } : x)))}
                      />
                    </div>
                  </Stack>
                ))}
              {hasDebts === 'yes' && (
                <div>
                  <Button
                    view='transparent'
                    size={32}
                    onClick={() => setDebts([...debts, { lender: '', balance: { value: 0, currency: 'RUB' }, monthly_payment: { value: 0, currency: 'RUB' } }])}
                  >
                    Добавить ещё кредит
                  </Button>
                </div>
              )}
              <FieldGroup label={<FieldLabel tag='situational'>Что можно предложить в залог</FieldLabel>} hint='Залог помогает получить большую сумму, но он не обязателен'>
                <Chips
                  multiple
                  options={(['real_estate', 'vehicle_equipment', 'purchased_asset'] as CollateralType[]).map((c) => ({ value: c, label: COLLATERAL_LABELS[c] }))}
                  value={collateral}
                  onChange={(v) => setCollateral(collateral.includes(v) ? collateral.filter((x) => x !== v) : [...collateral, v])}
                  disabled={!canEdit}
                />
              </FieldGroup>
            </Stack>
          </div>
        </Card>
      </div>

      {error && <Note tone='negative'>{error}</Note>}

      <Row>
        <Button view='primary' size={56} onClick={() => save.mutate()} loading={save.isPending}>
          Сохранить и перейти в кабинет
        </Button>
        <Button view='secondary' size={56} onClick={() => skip.mutate()} loading={skip.isPending}>
          Заполнить позже
        </Button>
      </Row>
    </Stack>
  );
}

function NumberInputText({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return <Input label={label} size={48} block value={value} onChange={(_, { value: v }) => onChange(v)} />;
}
