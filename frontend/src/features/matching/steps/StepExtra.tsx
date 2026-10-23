import { useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { ArrowUpMIcon } from '@alfalab/icons-glyph/ArrowUpMIcon';
import { BankMIcon } from '@alfalab/icons-glyph/BankMIcon';
import { BanknoteStackMIcon } from '@alfalab/icons-glyph/BanknoteStackMIcon';
import { ChartColumnThreeAscMIcon } from '@alfalab/icons-glyph/ChartColumnThreeAscMIcon';
import { ChartLineAscMIcon } from '@alfalab/icons-glyph/ChartLineAscMIcon';
import { CheckmarkCircleMIcon } from '@alfalab/icons-glyph/CheckmarkCircleMIcon';
import { ChevronDownMIcon } from '@alfalab/icons-glyph/ChevronDownMIcon';
import { DocumentLinesMIcon } from '@alfalab/icons-glyph/DocumentLinesMIcon';
import { HouseMIcon } from '@alfalab/icons-glyph/HouseMIcon';
import { PlusMIcon } from '@alfalab/icons-glyph/PlusMIcon';

import { useFinance } from '@/features/company/hooks';
import { UploadDialog } from '@/features/documents/components/UploadDialog';
import { matchingApi } from '@/features/matching/api';
import { StepHeader } from '@/features/matching/components/StepHeader';
import { mergePatch, useSessionAutosave } from '@/features/matching/lib';
import type { MatchingExtra, MatchingSession } from '@/features/matching/types';
import { errorText, queryClient } from '@/shared/api/query';
import { keys } from '@/shared/api/queryKeys';
import { COLLATERAL_LABELS } from '@/shared/i18n/ru';
import { formatNumberInput, monthName, parseNumberInput, rubToMoney } from '@/shared/lib/format';
import type { CollateralType, Money, Preference } from '@/shared/types/common';
import { Btn, DateField, Dialog, ModalFooter, Options, Pill, SelectField, Stack, TextField, TextLink } from '@/shared/ui';

import m from '../matching.module.css';

const inMonth = (x: string) => (/[ьй]$/.test(x) ? x.slice(0, -1) : x) + 'е';

const moneyText = (v: Money | null | undefined) => formatNumberInput(v ? v.value / 100 : null);
const toMoney = (v: string) => {
  const rub = parseNumberInput(v);
  return rub ? rubToMoney(rub) : null;
};

function Section({ icon: Icon, title, subtitle, tag, children }: { icon: typeof BankMIcon; title: string; subtitle?: string; tag?: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <section className={m.section}>
      <button type='button' className={m.sectionHead} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <Icon className={m.sectionIcon} />
        <span style={{ flex: 1 }}>
          <span className={m.sectionTitle}>
            {title} {tag}
          </span>
          {subtitle && <span className={m.small} style={{ display: 'block' }}>{subtitle}</span>}
        </span>
        <ChevronDownMIcon className={m.sectionIcon} style={{ transform: open ? 'rotate(180deg)' : undefined }} />
      </button>
      {open && <div className={m.sectionBody}>{children}</div>}
    </section>
  );
}

export function StepExtra({ session, onClose }: { session: MatchingSession; onClose: () => void }) {
  const navigate = useNavigate();
  const finance = useFinance();
  const [extra, setExtra] = useState(session.extra);
  const [bankOpen, setBankOpen] = useState(!!session.extra.other_bank_turnover_monthly);
  const [upload, setUpload] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { schedule, flush } = useSessionAutosave(session);
  const withCollateral = !!session.need.collateral && session.need.collateral !== 'none';

  const update = <K extends keyof MatchingExtra>(key: K, value: MatchingExtra[K]) => {
    setExtra((x) => ({ ...x, [key]: value }));
    schedule({ extra: { [key]: value } }, mergePatch);
  };

  const go = useMutation({
    mutationFn: async (skipped: boolean) => {
      await flush().catch(() => undefined);
      return matchingApi.patch(session.id, { extra: skipped ? { skipped: true } : { ...extra, skipped: false }, step: 4 });
    },
    onSuccess: (s) => {
      queryClient.setQueryData(keys.matching(session.id), s);
      navigate(`/match/${session.id}/step/4`);
    },
    onError: (e) => setError(errorText(e)),
  });

  const payment = extra.expected_payments[0] ?? { counterparty: 'Покупатель', amount: { value: 0, currency: 'RUB' as const }, date: '', source: 'client' as const };
  const setPayment = (patch: Partial<typeof payment>, index = 0) => {
    const list = [...extra.expected_payments];
    list[index] = { ...(list[index] ?? payment), ...patch };
    update('expected_payments', list);
  };
  const season = finance.data?.seasonality;

  return (
    <Dialog
      open
      onClose={onClose}
      size={600}
      title='Уточним подбор под ваш бизнес'
      subtitle={<StepHeader step={3} />}
      footer={
        <ModalFooter note='Ответы сохраняются автоматически'>
          <Btn variant='ghost' size='l' onClick={() => navigate(`/match/${session.id}/step/2`)}>
            Назад
          </Btn>
          <Btn variant='outline' size='l' onClick={() => go.mutate(true)} loading={go.isPending && go.variables === true}>
            Пропустить шаг
          </Btn>
          <Btn size='l' onClick={() => go.mutate(false)} loading={go.isPending && go.variables === false}>
            Показать рекомендации
          </Btn>
        </ModalFooter>
      }
    >
      <Stack gap={16}>
        <div className={m.lead}>
          Дополнительные данные помогут точнее оценить нагрузку и подобрать условия. Этот шаг можно пропустить.
          <div className={m.small}>Предварительный подбор не гарантирует одобрение.</div>
        </div>

        <div className={m.known}>
          <div className={m.knownHead}>
            <span className={m.sectionTitle}>
              <CheckmarkCircleMIcon style={{ width: 20, height: 20, color: 'var(--a-green)' }} /> Данные уже учтены
            </span>
            <Pill small tone='white'>
              Из Альфа-Бизнеса
            </Pill>
          </div>
          <div className={m.knownGrid}>
            <div className={m.knownTile}>
              <ChartColumnThreeAscMIcon className={m.sectionIcon} />
              <div>
                <div className={m.small}>Выручка по месяцам</div>
                <b>Данные за {finance.data?.months.length ?? 12} месяцев</b>
                <div className={m.small}>По классифицированным операциям</div>
              </div>
            </div>
            <div className={m.knownTile}>
              <ChartLineAscMIcon className={m.sectionIcon} />
              <div>
                <div className={m.small}>Сезонность</div>
                <b>{season ? `Снижение в ${season.low_months.map((x) => inMonth(monthName(x))).join('-')}` : 'Не выявлена'}</b>
                <div>
                  <TextLink tone='blue' onClick={() => navigate(`/match/${session.id}/step/2`)}>
                    Уточнить
                  </TextLink>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className={m.sectionTitle}>Сведения, которых пока не хватает</div>

        <Section icon={DocumentLinesMIcon} title='Ожидаемые оплаты по договорам' subtitle='Если ожидаете поступления от покупателей'>
          {(extra.expected_payments.length ? extra.expected_payments : [payment]).map((p, i) => (
            <div key={i} className={m.paymentRow}>
              <TextField value={moneyText(p.amount)} onChange={(v) => setPayment({ amount: toMoney(v) ?? { value: 0, currency: 'RUB' } }, i)} placeholder='Сумма, ₽' inputMode='numeric' />
              <DateField label='Ожидаемая дата' value={p.date} onChange={(d) => setPayment({ date: d }, i)} size={48} />
            </div>
          ))}
          <TextLink tone='blue' onClick={() => update('expected_payments', [...extra.expected_payments, { ...payment, amount: { value: 0, currency: 'RUB' }, date: '' }])}>
            <PlusMIcon style={{ width: 18, height: 18 }} /> Добавить оплату
          </TextLink>
          <div className={m.small}>Уже полученные из документооборота сведения повторно не запрашиваем.</div>
        </Section>

        <Section icon={BankMIcon} title='Счета в других банках' subtitle='Добавьте только обороты, которые ещё не учтены на шаге 2'>
          {bankOpen ? (
            <TextField
              value={moneyText(extra.other_bank_turnover_monthly)}
              onChange={(v) => update('other_bank_turnover_monthly', toMoney(v))}
              placeholder='Обороты в месяц, ₽'
              inputMode='numeric'
            />
          ) : (
            <div className={m.two}>
              <Btn variant='outline' size='l' block leftAddons={<PlusMIcon style={{ width: 18, height: 18 }} />} onClick={() => setBankOpen(true)}>
                Добавить сведения
              </Btn>
              <Btn variant='outline' size='l' block leftAddons={<ArrowUpMIcon style={{ width: 18, height: 18 }} />} onClick={() => setUpload(true)}>
                Загрузить выписку
              </Btn>
            </div>
          )}
        </Section>

        <div className={m.two}>
          <Section icon={BanknoteStackMIcon} title='Собственные средства на проект'>
            <TextField value={moneyText(extra.own_funds)} onChange={(v) => update('own_funds', toMoney(v))} placeholder='Сумма, ₽' inputMode='numeric' />
            <div className={m.small}>Поможет уточнить размер кредита</div>
          </Section>
          <Section icon={HouseMIcon} title='Возможный залог' tag={withCollateral ? <Pill small>Вы отметили на шаге 1</Pill> : undefined}>
            <SelectField<CollateralType>
              value={extra.collateral_details?.type ?? (withCollateral ? session.need.collateral : '') ?? ''}
              placeholder='Выберите вид имущества'
              options={(['real_estate', 'vehicle_equipment', 'purchased_asset'] as CollateralType[]).map((c) => ({ value: c, label: COLLATERAL_LABELS[c] }))}
              onChange={(t) => update('collateral_details', { type: t, description: extra.collateral_details?.description ?? COLLATERAL_LABELS[t], estimated_value: extra.collateral_details?.estimated_value ?? { value: 0, currency: 'RUB' } })}
              ariaLabel='Вид имущества'
            />
            <TextField
              value={moneyText(extra.collateral_details?.estimated_value)}
              onChange={(v) =>
                update('collateral_details', {
                  type: extra.collateral_details?.type ?? (withCollateral ? session.need.collateral! : 'real_estate'),
                  description: extra.collateral_details?.description ?? '',
                  estimated_value: toMoney(v) ?? { value: 0, currency: 'RUB' },
                })
              }
              placeholder='Примерная стоимость, ₽'
              inputMode='numeric'
            />
          </Section>
        </div>

        <div>
          <div className={m.sectionTitle} style={{ marginBottom: 10 }}>
            Что для вас важнее?
          </div>
          <Options<Preference>
            radio
            options={[
              { value: 'lower_payment', label: 'Меньше платёж' },
              { value: 'lower_overpayment', label: 'Ниже переплата' },
              { value: 'flexibility', label: 'Гибкость использования' },
            ]}
            value={extra.preference}
            onChange={(v) => update('preference', v)}
          />
        </div>
        {error && <div className={m.error}>{error}</div>}
      </Stack>
      <UploadDialog open={upload} onClose={() => setUpload(false)} title='Загрузить выписку' documentType='other_bank_statements' />
    </Dialog>
  );
}
