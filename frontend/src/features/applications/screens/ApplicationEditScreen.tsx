import { useRef, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@alfalab/core-components/button';
import { Input } from '@alfalab/core-components/input';
import { CheckmarkCircleMIcon } from '@alfalab/icons-glyph/CheckmarkCircleMIcon';

import { applicationsApi } from '@/features/applications/api';
import { CompanyStep } from '@/features/applications/components/CompanyStep';
import { FinanceStep } from '@/features/applications/components/FinanceStep';
import { RequirementsBlock } from '@/features/applications/components/RequirementsBlock';
import { StatusLabel } from '@/features/applications/components/StatusLabel';
import { useApplication, useRequirements } from '@/features/applications/hooks';
import type { ApplicationDetail, ApplicationPatch, FormStep, RequirementCode } from '@/features/applications/types';
import { useCurrentHome } from '@/features/profile/components/AppShell/AppShell';
import { MemberPicker } from '@/features/team/components/MemberPicker';
import { isApiError } from '@/shared/api/client';
import { errorText, invalidateApplication, queryClient } from '@/shared/api/query';
import { keys } from '@/shared/api/queryKeys';
import { COLLATERAL_LABELS, ERRORS, PURPOSE_LABELS } from '@/shared/i18n/ru';
import { formatMoney, formatPercent } from '@/shared/lib/format';
import { autosaveText, useAutosave } from '@/shared/lib/useAutosave';
import type { CollateralType, Money } from '@/shared/types/common';
import { Card, CardTitle, Chips, cx, FieldGroup, FieldLabel, FieldTag, InfoRow, InfoRows, MoneyInput, Note, PageHeader, QueryGate, Row, Stack, Text, uiStyles as s } from '@/shared/ui';

import styles from '../edit.module.css';

const STEP_TITLES: Record<FormStep, string> = {
  params: 'Параметры',
  company: 'Компания',
  finance: 'Финансы',
  collateral: 'Залог',
  documents: 'Документы',
  review: 'Проверка',
};

export function ApplicationEditScreen() {
  const { id = '' } = useParams();
  const app = useApplication(id);
  return (
    <QueryGate query={app}>
      {(data) =>
        data.status !== 'draft' || !data.available_actions.includes('application.edit') ? (
          <Navigate to={`/applications/${id}`} replace />
        ) : (
          <EditForm app={data} />
        )
      }
    </QueryGate>
  );
}

function EditForm({ app }: { app: ApplicationDetail }) {
  const navigate = useNavigate();
  const home = useCurrentHome();
  const requirements = useRequirements(app.id);
  const version = useRef(app.version);
  version.current = Math.max(version.current, app.version);

  const needsCollateral = !!app.collateral && app.collateral.type !== 'none';
  const steps: FormStep[] = ['params', 'company', 'finance', ...(needsCollateral ? (['collateral'] as const) : []), 'documents', 'review'];
  const [step, setStep] = useState<FormStep>(steps.includes(app.form.step) ? app.form.step : 'params');

  const [amount, setAmount] = useState<Money | null>(app.requested_amount);
  const [term, setTerm] = useState(app.requested_term_months);
  const [purpose, setPurpose] = useState(app.purpose);
  const [collateral, setCollateral] = useState(app.collateral);
  const [conflict, setConflict] = useState(false);
  const [missing, setMissing] = useState<RequirementCode[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [handoffOpen, setHandoffOpen] = useState(false);
  const [handedOff, setHandedOff] = useState<string | null>(null);

  const applyServer = (updated: ApplicationDetail) => {
    version.current = updated.version;
    queryClient.setQueryData(keys.application(app.id), updated);
  };

  const handleConflict = async () => {
    setConflict(true);
    const fresh = await applicationsApi.get(app.id);
    applyServer(fresh);
    setAmount(fresh.requested_amount);
    setTerm(fresh.requested_term_months);
    setPurpose(fresh.purpose);
    setCollateral(fresh.collateral);
  };

  const { state, schedule, flush } = useAutosave<Omit<ApplicationPatch, 'version'>>(async (patch) => {
    try {
      applyServer(await applicationsApi.patch(app.id, { ...patch, version: version.current }));
    } catch (e) {
      if (isApiError(e, 'VERSION_CONFLICT')) await handleConflict();
      throw e;
    }
  });

  const changeStep = (next: FormStep) => {
    setStep(next);
    schedule({ form: { step: next } });
  };

  const submit = useMutation({
    mutationFn: async () => {
      await flush().catch(() => undefined);
      return applicationsApi.submit(app.id);
    },
    onSuccess: (updated) => {
      invalidateApplication(app.id);
      navigate(`/applications/${updated.id}`, { replace: true });
    },
    onError: (e) => {
      if (isApiError(e, 'REQUIREMENTS_NOT_MET')) {
        setMissing((e.details.missing as RequirementCode[]) ?? []);
        setStep('documents');
        setError('Не всё готово для отправки: выполните отмеченные пункты');
      } else setError(errorText(e));
    },
  });

  const saveDraft = useMutation({
    mutationFn: () => flush(),
    onSuccess: () => {
      invalidateApplication(app.id);
      navigate('/home');
    },
    onError: (e) => setError(errorText(e)),
  });

  const actions = app.available_actions;
  const canSubmit = requirements.data?.can_submit ?? false;
  const idx = steps.indexOf(step);

  return (
    <div>
      <PageHeader
        title={`Заявка ${app.number}`}
        subtitle={
          <Row gap={12}>
            <StatusLabel status={app.status} small />
            <Text small secondary>
              {autosaveText(state)}
            </Text>
          </Row>
        }
      />

      {conflict && (
        <div style={{ marginBottom: 16 }}>
          <Note tone='attention'>{ERRORS.versionConflict}</Note>
        </div>
      )}
      {app.client_warning_accepted && (
        <div style={{ marginBottom: 16 }}>
          <Note tone='attention'>Вы оставили сумму выше рекомендуемой. Банк увидит это и может предложить другие условия</Note>
        </div>
      )}

      <div className={styles.layout}>
        <nav className={styles.steps} aria-label='Шаги заявки'>
          {steps.map((st, i) => (
            <button key={st} type='button' className={cx(styles.stepButton, st === step && styles.stepActive, i < idx && styles.stepDone)} onClick={() => changeStep(st)}>
              <span className={styles.stepNum}>{i < idx ? <CheckmarkCircleMIcon /> : i + 1}</span>
              <span>{STEP_TITLES[st]}</span>
              {st === 'company' && <FieldTag kind='auto' />}
              {st === 'finance' && <FieldTag kind='lk' />}
            </button>
          ))}
        </nav>

        <div className={styles.content}>
          {step === 'params' && (
            <Card>
              <CardTitle>Параметры кредита</CardTitle>
              <Stack gap={20}>
                <InfoRows>
                  <InfoRow label='Продукт'>{app.product.name}</InfoRow>
                  <InfoRow label='Ставка'>{formatPercent(app.rate_percent)}, условная</InfoRow>
                  <InfoRow label='Платёж в месяц'>около {formatMoney(app.monthly_payment_estimate)}</InfoRow>
                </InfoRows>
                <div className={s.grid2}>
                  <FieldGroup label={<FieldLabel tag='required'>Сумма</FieldLabel>}>
                    <MoneyInput
                      label='Сумма кредита'
                      value={amount}
                      onChange={(v) => {
                        setAmount(v);
                        if (v?.value) schedule({ amount: v });
                      }}
                      error={!amount?.value ? 'Укажите сумму' : null}
                    />
                  </FieldGroup>
                  <FieldGroup label={<FieldLabel tag='required'>Срок</FieldLabel>}>
                    <Chips
                      options={[6, 12, 18, 24, 36, 48, 60].map((t) => ({ value: String(t), label: `${t} мес.` }))}
                      value={String(term)}
                      onChange={(v) => {
                        setTerm(Number(v));
                        schedule({ term_months: Number(v) });
                      }}
                    />
                  </FieldGroup>
                </div>
                <FieldGroup label={<FieldLabel tag='required'>Цель</FieldLabel>} hint={PURPOSE_LABELS[app.purpose_code]}>
                  <Input
                    label='На что пойдут деньги'
                    size={56}
                    block
                    value={purpose}
                    onChange={(_, { value }) => {
                      setPurpose(value);
                      schedule({ form: { data: { purpose: value } } });
                    }}
                  />
                </FieldGroup>
              </Stack>
            </Card>
          )}

          {step === 'company' && <CompanyStep />}
          {step === 'finance' && <FinanceStep amount={amount?.value ?? app.requested_amount.value} term={term} />}

          {step === 'collateral' && (
            <Card>
              <CardTitle>Залог</CardTitle>
              <Stack gap={20}>
                <FieldGroup label={<FieldLabel tag='required'>Что в залоге</FieldLabel>}>
                  <Chips
                    options={(['real_estate', 'vehicle_equipment', 'purchased_asset'] as CollateralType[]).map((c) => ({ value: c, label: COLLATERAL_LABELS[c] }))}
                    value={collateral?.type ?? null}
                    onChange={(v) => {
                      const next = { type: v, description: collateral?.description ?? null, estimated_value: collateral?.estimated_value ?? null };
                      setCollateral(next);
                      schedule({ collateral: next });
                    }}
                  />
                </FieldGroup>
                <div className={s.grid2}>
                  <Input
                    label='Описание'
                    size={56}
                    block
                    value={collateral?.description ?? ''}
                    onChange={(_, { value }) => {
                      const next = { ...collateral!, description: value };
                      setCollateral(next);
                      schedule({ collateral: next });
                    }}
                  />
                  <MoneyInput
                    label='Примерная стоимость'
                    value={collateral?.estimated_value}
                    onChange={(v) => {
                      const next = { ...collateral!, estimated_value: v };
                      setCollateral(next);
                      schedule({ collateral: next });
                    }}
                  />
                </div>
              </Stack>
            </Card>
          )}

          {(step === 'documents' || step === 'review') && (
            <RequirementsBlock app={app} missing={missing} onDone={() => setMissing([])} />
          )}

          {step === 'review' && (
            <Card>
              <CardTitle>Проверьте заявку</CardTitle>
              <InfoRows>
                <InfoRow label='Продукт'>{app.product.name}</InfoRow>
                <InfoRow label='Сумма и срок'>
                  {formatMoney(amount)} на {term} мес.
                </InfoRow>
                <InfoRow label='Цель'>{purpose}</InfoRow>
                <InfoRow label='Платёж в месяц'>около {formatMoney(app.monthly_payment_estimate)}</InfoRow>
                {collateral && collateral.type !== 'none' && <InfoRow label='Залог'>{COLLATERAL_LABELS[collateral.type]}</InfoRow>}
              </InfoRows>
            </Card>
          )}

          {error && <Note tone='negative'>{error}</Note>}
          {handedOff && <Note tone='positive'>Заявка передана: {handedOff}. Сотрудник увидит задачу на главной</Note>}

          <div className={styles.footer}>
            <Row gap={12}>
              {idx > 0 && (
                <Button view='secondary' size={56} onClick={() => changeStep(steps[idx - 1])}>
                  Назад
                </Button>
              )}
              {idx < steps.length - 1 && (
                <Button view='secondary' size={56} onClick={() => changeStep(steps[idx + 1])}>
                  Далее
                </Button>
              )}
            </Row>
            <Row gap={12}>
              <Button view='transparent' size={56} onClick={() => saveDraft.mutate()} loading={saveDraft.isPending}>
                Сохранить черновик
              </Button>
              {actions.includes('application.submit') ? (
                <Button view='primary' size={56} onClick={() => submit.mutate()} loading={submit.isPending} disabled={!canSubmit}>
                  Отправить в банк
                </Button>
              ) : actions.includes('application.handoff') ? (
                <Button view='primary' size={56} onClick={() => setHandoffOpen(true)}>
                  Передать на отправку
                </Button>
              ) : (
                <Text small secondary>
                  Отправить заявку может собственник, директор или сотрудник с правом подачи
                </Text>
              )}
            </Row>
          </div>
          {actions.includes('application.submit') && !canSubmit && requirements.data && (
            <Text small secondary>
              Кнопка станет активной, когда все обязательные пункты будут выполнены
            </Text>
          )}
        </div>
      </div>

      <MemberPicker
        open={handoffOpen}
        title='Передать на отправку'
        subtitle={`Заявка ${app.number}`}
        permission='submit_applications'
        excludeUserId={home.id}
        onClose={() => setHandoffOpen(false)}
        onSelect={async (m) => {
          await flush().catch(() => undefined);
          await applicationsApi.handoff(app.id, m.id);
          invalidateApplication(app.id);
          setHandedOff(`${m.last_name} ${m.first_name}`);
        }}
      />
    </div>
  );
}
