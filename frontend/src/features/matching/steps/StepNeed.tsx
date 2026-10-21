import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@alfalab/core-components/button';

import { matchingApi } from '@/features/matching/api';
import { Footer } from '@/features/matching/components/StepFooter';
import { mergePatch, TERM_OPTIONS, useSessionAutosave } from '@/features/matching/lib';
import type { MatchingSession } from '@/features/matching/types';
import { errorText, fieldErrors, queryClient } from '@/shared/api/query';
import { keys } from '@/shared/api/queryKeys';
import { COLLATERAL_LABELS, DISBURSEMENT_LABELS, NEED_TYPE_LABELS, PURPOSE_LABELS, URGENCY_LABELS } from '@/shared/i18n/ru';
import { autosaveText } from '@/shared/lib/useAutosave';
import type { CollateralType, Disbursement, NeedType, PurposeCode, Urgency } from '@/shared/types/common';
import { Card, Chips, FieldGroup, FieldLabel, MoneyInput, Note, Stack, uiStyles as s } from '@/shared/ui';

export function StepNeed({ session }: { session: MatchingSession }) {
  const navigate = useNavigate();
  const [need, setNeed] = useState(session.need);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { state, schedule, flush } = useSessionAutosave(session);

  const update = <K extends keyof MatchingSession['need']>(key: K, value: MatchingSession['need'][K]) => {
    setNeed((n) => ({ ...n, [key]: value }));
    setErrors((e) => ({ ...e, [key]: '' }));
    schedule({ need: { [key]: value } }, mergePatch);
  };

  const next = useMutation({
    mutationFn: async () => {
      const local: Record<string, string> = {};
      if (!need.purpose) local.purpose = 'Выберите цель';
      if (!need.amount?.value) local.amount = 'Укажите сумму';
      if (!need.term_months) local.term_months = 'Укажите срок';
      if (!need.need_type) local.need_type = 'Выберите вариант';
      if (!need.disbursement) local.disbursement = 'Выберите вариант';
      if (!need.urgency) local.urgency = 'Выберите вариант';
      if (Object.keys(local).length) {
        setErrors(local);
        throw new Error('validation');
      }
      await flush().catch(() => undefined);
      return matchingApi.patch(session.id, { need, step: 2 });
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(keys.matching(session.id), updated);
      navigate(`/match/${session.id}/step/2`);
    },
    onError: (e) => {
      if (e instanceof Error && e.message === 'validation') return;
      setErrors(Object.keys(fieldErrors(e)).length ? fieldErrors(e) : { form: errorText(e) });
    },
  });

  return (
    <Stack gap={16}>
      <Note tone='info'>Мы уже учли данные компании: ИНН, ОКВЭД, возраст бизнеса, обороты</Note>
      <Card>
        <Stack gap={28}>
          <FieldGroup label={<FieldLabel tag='required'>На что нужны деньги</FieldLabel>} error={errors.purpose}>
            <Chips
              options={(Object.keys(PURPOSE_LABELS) as PurposeCode[]).map((p) => ({ value: p, label: PURPOSE_LABELS[p] }))}
              value={need.purpose}
              onChange={(v) => update('purpose', v)}
            />
          </FieldGroup>

          <div className={s.grid2}>
            <FieldGroup label={<FieldLabel tag='required'>Сколько нужно</FieldLabel>} error={errors.amount}>
              <MoneyInput label='Сумма' value={need.amount} onChange={(v) => update('amount', v)} />
            </FieldGroup>
            <FieldGroup label={<FieldLabel tag='required'>На какой срок</FieldLabel>} error={errors.term_months}>
              <Chips
                options={TERM_OPTIONS.map((t) => ({ value: String(t), label: `${t} мес.` }))}
                value={need.term_months ? String(need.term_months) : null}
                onChange={(v) => update('term_months', Number(v))}
              />
            </FieldGroup>
          </div>

          <FieldGroup
            label={<FieldLabel tag='required'>Потребность разовая или регулярная</FieldLabel>}
            error={errors.need_type}
            hint={need.need_type === 'recurring' ? 'Подойдёт овердрафт или кредитная линия' : undefined}
          >
            <Chips
              options={(Object.keys(NEED_TYPE_LABELS) as NeedType[]).map((v) => ({ value: v, label: NEED_TYPE_LABELS[v] }))}
              value={need.need_type}
              onChange={(v) => update('need_type', v)}
            />
          </FieldGroup>

          <FieldGroup
            label={<FieldLabel tag='required'>Как получить деньги</FieldLabel>}
            error={errors.disbursement}
            hint={need.disbursement === 'tranches' ? 'Подойдёт кредитная линия' : undefined}
          >
            <Chips
              options={(Object.keys(DISBURSEMENT_LABELS) as Disbursement[]).map((v) => ({ value: v, label: DISBURSEMENT_LABELS[v] }))}
              value={need.disbursement}
              onChange={(v) => update('disbursement', v)}
            />
          </FieldGroup>

          <FieldGroup label={<FieldLabel tag='required'>Насколько срочно</FieldLabel>} error={errors.urgency}>
            <Chips
              options={(Object.keys(URGENCY_LABELS) as Urgency[]).map((v) => ({ value: v, label: URGENCY_LABELS[v] }))}
              value={need.urgency}
              onChange={(v) => update('urgency', v)}
            />
          </FieldGroup>

          <FieldGroup label={<FieldLabel tag='situational'>Готовы предложить залог</FieldLabel>} hint='Залог не обязателен, но помогает получить большую сумму'>
            <Chips
              options={(Object.keys(COLLATERAL_LABELS) as CollateralType[]).map((v) => ({ value: v, label: COLLATERAL_LABELS[v] }))}
              value={need.collateral}
              onChange={(v) => update('collateral', v)}
            />
          </FieldGroup>

          {errors.form && <Note tone='negative'>{errors.form}</Note>}
        </Stack>
      </Card>
      <Footer
        left={
          <Button view='secondary' size={56} onClick={() => navigate('/home')}>
            Назад
          </Button>
        }
        saved={autosaveText(state)}
        right={
          <Button view='primary' size={56} onClick={() => next.mutate()} loading={next.isPending}>
            Далее
          </Button>
        }
      />
    </Stack>
  );
}
