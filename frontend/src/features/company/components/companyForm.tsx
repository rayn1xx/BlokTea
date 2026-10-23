import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ExclamationCircleMIcon } from '@alfalab/icons-glyph/ExclamationCircleMIcon';

import { companyApi } from '@/features/company/api';
import type { CompanyProfile } from '@/features/company/types';
import { useHome } from '@/features/profile/hooks';
import { errorText, queryClient } from '@/shared/api/query';
import { keys } from '@/shared/api/queryKeys';
import { COLLATERAL_LABELS, TAX_REGIME_LABELS } from '@/shared/i18n/ru';
import { formatNumberInput, formatNumericDate, parseNumberInput, rubToMoney } from '@/shared/lib/format';
import type { CollateralType, TaxRegime } from '@/shared/types/common';
import { Btn, Options, Pill, SelectField, TextArea, TextField, TextLink } from '@/shared/ui';

import f from './companyForm.module.css';

type Pledge = 'yes' | 'no' | 'unknown';

const PLEDGE_TYPES: CollateralType[] = ['real_estate', 'vehicle_equipment', 'purchased_asset'];

export function useCompanyForm(profile: CompanyProfile) {
  const home = useHome();
  const debts = profile.client_input.external_debts;
  const collateral = profile.client_input.collateral_available;

  const [taxRegime, setTaxRegime] = useState<TaxRegime | ''>(profile.from_lk.tax_regime.value ?? '');
  const [otherPayments, setOtherPayments] = useState(debts.length ? formatNumberInput(debts.reduce((s, d) => s + d.monthly_payment.value, 0) / 100) : '');
  const [pledge, setPledge] = useState<Pledge | null>(
    collateral.includes('none') ? 'no' : collateral.length ? 'yes' : profile.completeness_percent >= 90 ? 'unknown' : null,
  );
  const [pledgeTypes, setPledgeTypes] = useState<CollateralType[]>(collateral.filter((c) => c !== 'none'));
  const [issueOpen, setIssueOpen] = useState(false);
  const [issue, setIssue] = useState('');
  const [error, setError] = useState<string | null>(null);

  const canConfirm = profile.available_actions.includes('company.confirm_registry');
  const canEdit = profile.available_actions.includes('company.edit_details');
  const isOwner = home.data?.role === 'owner';
  const onboardingOpen = isOwner && home.data?.onboarding.completed === false;

  const missing = [!profile.registry.confirmed, !otherPayments, !pledge].filter(Boolean).length;

  const refresh = (p?: CompanyProfile) => {
    if (p) queryClient.setQueryData(keys.companyProfile, p);
    void queryClient.invalidateQueries({ queryKey: keys.home });
  };

  const confirm = useMutation({
    mutationFn: (ok: boolean) => companyApi.confirmRegistry(ok ? { confirmed: true } : { confirmed: false, issue_comment: issue.trim() }),
    onSuccess: (p) => {
      refresh(p);
      setIssueOpen(false);
    },
    onError: (e) => setError(errorText(e)),
  });

  const save = useMutation({
    mutationFn: async () => {
      const rub = parseNumberInput(otherPayments);
      const p = await companyApi.patchDetails({
        tax_regime: taxRegime || null,
        external_debts: rub ? [{ lender: 'Другие банки', balance: rubToMoney(0), monthly_payment: rubToMoney(rub) }] : [],
        collateral_available: pledge === 'no' ? ['none'] : pledge === 'yes' ? pledgeTypes : [],
      });
      if (onboardingOpen) await companyApi.completeOnboarding(false);
      return p;
    },
    onSuccess: (p) => refresh(p),
    onError: (e) => setError(errorText(e)),
  });

  const later = useMutation({
    mutationFn: () => (onboardingOpen ? companyApi.completeOnboarding(true) : Promise.resolve(null)),
    onSuccess: () => refresh(),
  });

  const sendIssue = () => {
    if (!issue.trim()) {
      setError('Опишите, что не так');
      return;
    }
    setError(null);
    confirm.mutate(false);
  };

  return {
    profile,
    taxRegime,
    setTaxRegime,
    otherPayments,
    setOtherPayments,
    pledge,
    setPledge,
    pledgeTypes,
    setPledgeTypes,
    issueOpen,
    setIssueOpen,
    issue,
    setIssue,
    error,
    canConfirm,
    canEdit,
    missing,
    confirm,
    sendIssue,
    save,
    later,
  };
}

export type CompanyForm = ReturnType<typeof useCompanyForm>;

export function RegistryBadge({ profile }: { profile: CompanyProfile }) {
  return (
    <Pill tone='green' small>
      Из {profile.registry.source === 'EGRUL' ? 'ЕГРЮЛ' : 'ЕГРИП'} · {formatNumericDate(profile.registry.fetched_at)}
    </Pill>
  );
}

export function RequisitesGrid({ profile, compact }: { profile: CompanyProfile; compact?: boolean }) {
  const c = profile.company;
  const items: [string, string][] = [
    ['Название', c.short_name],
    [compact ? 'ИНН' : 'Дата регистрации', compact ? c.inn : formatNumericDate(c.registration_date)],
    ['Руководитель', c.director?.name ?? '—'],
    [compact ? 'Дата регистрации' : 'ИНН', compact ? formatNumericDate(c.registration_date) : c.inn],
    [compact ? 'Юридический адрес' : 'ОГРН', compact ? c.legal_address : c.ogrn],
    ['ОКВЭД', c.okved_main.replace(/^(\S+)\s/, '$1 · ')],
  ];
  if (!compact && c.kpp) items.push(['КПП', c.kpp]);
  return (
    <dl className={compact ? f.gridCompact : f.grid}>
      {items.map(([label, value]) => (
        <div key={label} className={f.item}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
      {!compact && (
        <div className={f.itemWide}>
          <dt>Юридический адрес</dt>
          <dd>{c.legal_address}</dd>
        </div>
      )}
    </dl>
  );
}

export function RegistryActions({ form }: { form: CompanyForm }) {
  const { profile } = form;
  if (profile.registry.confirmed) {
    return (
      <Pill tone='green' small>
        Реквизиты подтверждены
      </Pill>
    );
  }
  if (form.issueOpen) {
    return (
      <div className={f.issue}>
        <TextArea value={form.issue} onChange={form.setIssue} placeholder='Что не так в данных реестра' />
        <div className={f.row}>
          <Btn variant='outlineRed' onClick={form.sendIssue} loading={form.confirm.isPending}>
            Отправить
          </Btn>
          <TextLink tone='muted' onClick={() => form.setIssueOpen(false)}>
            Отмена
          </TextLink>
        </div>
      </div>
    );
  }
  return (
    <div className={f.row}>
      {profile.registry.issue_comment && (
        <Pill tone='yellow' small>
          Вы сообщили об ошибке
        </Pill>
      )}
      <Btn variant='outlineRed' size='l' onClick={() => form.confirm.mutate(true)} loading={form.confirm.isPending} disabled={!form.canConfirm}>
        Всё верно
      </Btn>
      <TextLink tone='red' onClick={() => form.setIssueOpen(true)} disabled={!form.canConfirm}>
        Сообщить об ошибке
      </TextLink>
    </div>
  );
}

function NotFilled() {
  return (
    <Pill tone='yellow' small icon={<ExclamationCircleMIcon style={{ width: 14, height: 14 }} />}>
      Не заполнено
    </Pill>
  );
}

export function ExtraFields({ form, inline }: { form: CompanyForm; inline?: boolean }) {
  const lkTax = form.profile.from_lk.tax_regime;
  const rows = [
    {
      label: 'Налоговый режим',
      control: (
        <SelectField
          value={form.taxRegime}
          placeholder='Выберите режим'
          options={(Object.keys(TAX_REGIME_LABELS) as TaxRegime[]).map((t) => ({ value: t, label: TAX_REGIME_LABELS[t] }))}
          onChange={form.setTaxRegime}
          disabled={!form.canEdit}
          ariaLabel='Налоговый режим'
        />
      ),
      hint: lkTax.source === 'alfa_lk' ? 'Из Альфа-Бизнеса' : null,
      empty: !form.taxRegime,
    },
    {
      label: 'Платежи по обязательствам в других банках',
      control: (
        <TextField
          value={form.otherPayments}
          onChange={(v) => form.setOtherPayments(formatNumberInput(parseNumberInput(v)))}
          placeholder='Укажите сумму в месяц, ₽'
          inputMode='numeric'
          ariaLabel='Платежи по обязательствам в других банках, в месяц'
        />
      ),
      hint: 'Чтобы учесть текущую нагрузку',
      empty: !form.otherPayments,
    },
    {
      label: 'Готовы рассмотреть залог?',
      control: (
        <Options<Pledge>
          options={[
            { value: 'no', label: 'Нет' },
            { value: 'yes', label: 'Да' },
            { value: 'unknown', label: 'Пока не знаю' },
          ]}
          value={form.pledge}
          onChange={form.setPledge}
          disabled={!form.canEdit}
        />
      ),
      hint: 'Чтобы показать доступные варианты финансирования',
      empty: !form.pledge,
    },
  ];

  return (
    <div className={inline ? f.extraInline : f.extra}>
      {rows.map((r) => (
        <div key={r.label} className={inline ? f.extraRowInline : f.extraRow}>
          <div className={f.extraLabel}>{r.label}</div>
          <div>
            {r.control}
            {r.hint && <div className={f.hint}>{r.hint}</div>}
          </div>
          {inline && <div className={f.extraState}>{r.empty ? <NotFilled /> : null}</div>}
        </div>
      ))}
      {form.pledge === 'yes' && (
        <div className={inline ? f.extraRowInline : f.extraRow}>
          <div className={f.extraLabel}>Что можно предложить</div>
          <Options<CollateralType>
            columns={inline ? 3 : 1}
            options={PLEDGE_TYPES.map((p) => ({ value: p, label: COLLATERAL_LABELS[p] }))}
            values={form.pledgeTypes}
            onChange={(v) => form.setPledgeTypes(form.pledgeTypes.includes(v) ? form.pledgeTypes.filter((x) => x !== v) : [...form.pledgeTypes, v])}
          />
        </div>
      )}
    </div>
  );
}
