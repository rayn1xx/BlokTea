import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';

import { matchingApi } from '@/features/matching/api';
import { StepHeader } from '@/features/matching/components/StepHeader';
import { mergePatch, useSessionAutosave } from '@/features/matching/lib';
import type { MatchingSession } from '@/features/matching/types';
import { errorText, fieldErrors, queryClient } from '@/shared/api/query';
import { keys } from '@/shared/api/queryKeys';
import { PURPOSE_LABELS } from '@/shared/i18n/ru';
import { formatNumberInput, parseNumberInput, rubToMoney } from '@/shared/lib/format';
import type { CollateralType, Disbursement, NeedType, PurposeCode, Urgency } from '@/shared/types/common';
import { Btn, Dialog, Field, ModalFooter, Options, SelectField, Stack, TextField } from '@/shared/ui';

import m from '../matching.module.css';

type Pledge = 'yes' | 'no' | 'unknown';

const REQUIRED = <span className={m.required}>*</span>;

export function StepNeed({ session, onClose }: { session: MatchingSession; onClose: () => void }) {
  const navigate = useNavigate();
  const [need, setNeed] = useState(session.need);
  const [pledge, setPledge] = useState<Pledge | null>(
    session.need.collateral === 'none' ? 'no' : session.need.collateral ? 'yes' : null,
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { schedule, flush } = useSessionAutosave(session);

  const update = <K extends keyof MatchingSession['need']>(key: K, value: MatchingSession['need'][K]) => {
    setNeed((n) => ({ ...n, [key]: value }));
    setErrors((e) => ({ ...e, [key]: '' }));
    schedule({ need: { [key]: value } }, mergePatch);
  };

  const setPledgeValue = (v: Pledge) => {
    setPledge(v);
    const collateral: CollateralType | null = v === 'no' ? 'none' : v === 'yes' ? need.collateral && need.collateral !== 'none' ? need.collateral : 'real_estate' : null;
    update('collateral', collateral);
  };

  const filled = !!(need.purpose && need.amount?.value && need.term_months && need.need_type && need.disbursement && need.urgency);

  const next = useMutation({
    mutationFn: async () => {
      await flush().catch(() => undefined);
      return matchingApi.patch(session.id, { need, step: 2 });
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(keys.matching(session.id), updated);
      navigate(`/match/${session.id}/step/2`);
    },
    onError: (e) => setErrors(Object.keys(fieldErrors(e)).length ? fieldErrors(e) : { form: errorText(e) }),
  });

  return (
    <Dialog
      open
      onClose={onClose}
      size={600}
      title='На что нужны деньги?'
      subtitle={<StepHeader step={1} />}
      footer={
        <ModalFooter note='Можно вернуться позже, ответы сохранятся'>
          <Btn variant='ghost' size='l' onClick={onClose}>
            Отмена
          </Btn>
          <Btn size='l' disabled={!filled} loading={next.isPending} onClick={() => next.mutate()}>
            Далее
          </Btn>
        </ModalFooter>
      }
    >
      <Stack gap={18}>
        <div className={m.lead}>
          Укажите параметры нового кредита. Данные компании повторно вводить не нужно.
          <div className={m.small}>Поля со {REQUIRED} обязательны</div>
        </div>

        <Field label={<>Цель финансирования {REQUIRED}</>} hint='Оборудование, закупка товара, текущие расходы и другое' error={errors.purpose}>
          <SelectField<PurposeCode>
            value={need.purpose ?? ''}
            placeholder='Выберите цель'
            options={(Object.keys(PURPOSE_LABELS) as PurposeCode[]).map((p) => ({ value: p, label: PURPOSE_LABELS[p] }))}
            onChange={(v) => update('purpose', v)}
            ariaLabel='Цель финансирования'
          />
        </Field>

        <div className={m.two}>
          <Field label={<>Сумма {REQUIRED}</>} error={errors.amount}>
            <TextField
              value={formatNumberInput(need.amount ? need.amount.value / 100 : null)}
              onChange={(v) => {
                const rub = parseNumberInput(v);
                update('amount', rub ? rubToMoney(rub) : null);
              }}
              placeholder='Введите сумму'
              suffix='₽'
              inputMode='numeric'
              ariaLabel='Сумма'
            />
          </Field>
          <Field label={<>Срок возврата {REQUIRED}</>} error={errors.term_months}>
            <TextField
              value={need.term_months ? String(need.term_months) : ''}
              onChange={(v) => update('term_months', parseNumberInput(v))}
              placeholder='Количество месяцев'
              suffix='мес.'
              inputMode='numeric'
              ariaLabel='Срок возврата, месяцев'
            />
          </Field>
        </div>

        <Field label={<>Как часто нужны деньги? {REQUIRED}</>} error={errors.need_type}>
          <Options<NeedType>
            radio
            columns={2}
            options={[
              { value: 'one_time', label: 'Разово' },
              { value: 'recurring', label: 'Регулярно' },
            ]}
            value={need.need_type}
            onChange={(v) => update('need_type', v)}
          />
        </Field>

        <Field label={<>Как планируете получать деньги? {REQUIRED}</>} error={errors.disbursement}>
          <Options<Disbursement>
            radio
            columns={2}
            options={[
              { value: 'lump_sum', label: 'Всю сумму сразу' },
              { value: 'tranches', label: 'Частями' },
            ]}
            value={need.disbursement}
            onChange={(v) => update('disbursement', v)}
          />
        </Field>

        <Field label={<>Когда нужны деньги? {REQUIRED}</>} error={errors.urgency}>
          <Options<Urgency>
            options={[
              { value: 'asap', label: 'Сегодня или завтра' },
              { value: 'week', label: 'В течение недели' },
              { value: 'not_urgent', label: 'Не срочно' },
            ]}
            value={need.urgency}
            onChange={(v) => update('urgency', v)}
          />
        </Field>

        <div className={m.divider} />

        <Field label='Готовы рассмотреть залог?' optional hint='Если да, уточним сведения на следующем этапе'>
          <Options<Pledge>
            radio
            options={[
              { value: 'yes', label: 'Да' },
              { value: 'no', label: 'Нет' },
              { value: 'unknown', label: 'Пока не знаю' },
            ]}
            value={pledge}
            onChange={setPledgeValue}
          />
        </Field>
        {errors.form && <div className={m.error}>{errors.form}</div>}
      </Stack>
    </Dialog>
  );
}
