import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { PaperclipMIcon } from '@alfalab/icons-glyph/PaperclipMIcon';
import { PlusMIcon } from '@alfalab/icons-glyph/PlusMIcon';

import { companyApi } from '@/features/company/api';
import { useFinance } from '@/features/company/hooks';
import type { FinanceSummary } from '@/features/company/types';
import { UploadDialog } from '@/features/documents/components/UploadDialog';
import { matchingApi } from '@/features/matching/api';
import { StepHeader } from '@/features/matching/components/StepHeader';
import type { MatchingSession } from '@/features/matching/types';
import { useCurrentHome } from '@/features/profile/components/AppShell/AppShell';
import { errorText, fieldErrors, queryClient } from '@/shared/api/query';
import { keys } from '@/shared/api/queryKeys';
import { formatMoney, formatMonth, formatNumberInput, formatNumericDate, parseNumberInput, plural, rubToMoney } from '@/shared/lib/format';
import { Btn, CheckField, Dialog, ModalFooter, Panel, Pill, SkeletonLines, Stack, TextField, TextLink } from '@/shared/ui';

import m from '../matching.module.css';

export function StepFinance({ session, onClose }: { session: MatchingSession; onClose: () => void }) {
  const finance = useFinance();
  if (finance.data) return <FinanceBody session={session} finance={finance.data} onClose={onClose} />;
  return (
    <Dialog open onClose={onClose} size={600} title='Проверьте данные о финансах' subtitle={<StepHeader step={2} />}>
      <SkeletonLines lines={6} />
    </Dialog>
  );
}

function FinanceBody({ session, finance, onClose }: { session: MatchingSession; finance: FinanceSummary; onClose: () => void }) {
  const navigate = useNavigate();
  const home = useCurrentHome();
  const canEdit = ['owner', 'director', 'cfo_or_accountant'].includes(home.role ?? '');
  const [confirmed, setConfirmed] = useState(session.finance_confirmed);
  const [editing, setEditing] = useState<null | 'inflow' | 'outflow'>(null);
  const [draft, setDraft] = useState('');
  const [debtOpen, setDebtOpen] = useState(false);
  const [debt, setDebt] = useState({ lender: '', balance: '', payment: '' });
  const [uploadOpen, setUploadOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setFinance = (f: FinanceSummary) => queryClient.setQueryData(keys.finance, f);

  const patch = useMutation({
    mutationFn: companyApi.patchFinanceSummary,
    onSuccess: (f) => {
      setFinance(f);
      setEditing(null);
      setDebtOpen(false);
      setDebt({ lender: '', balance: '', payment: '' });
    },
    onError: (e) => setError(errorText(e)),
  });

  const confirm = useMutation({
    mutationFn: async (value: boolean) => {
      if (value) setFinance(await companyApi.patchFinanceSummary({ confirm: true }));
      return matchingApi.patch(session.id, { finance_confirmed: value });
    },
    onSuccess: (s) => queryClient.setQueryData(keys.matching(session.id), s),
    onError: (e) => {
      setConfirmed(false);
      setError(errorText(e));
    },
  });

  const next = useMutation({
    mutationFn: () => matchingApi.patch(session.id, { step: 3 }),
    onSuccess: (s) => {
      queryClient.setQueryData(keys.matching(session.id), s);
      navigate(`/match/${session.id}/step/3`);
    },
    onError: (e) => setError(fieldErrors(e).finance_confirmed ?? errorText(e)),
  });

  const alfa = finance.debts.items.filter((d) => d.source === 'alfa_lk');
  const otherDebts = finance.debts.items.filter((d) => d.source !== 'alfa_lk');
  const sum = (list: typeof alfa, k: 'balance' | 'monthly_payment') => ({ value: list.reduce((s, d) => s + d[k].value, 0), currency: 'RUB' as const });
  const bkiDate = finance.debts.items.find((d) => d.source === 'bki') ? formatNumericDate(finance.period.to) : null;

  const flowRow = (label: string, key: 'inflow' | 'outflow', value: FinanceSummary['monthly_inflow_avg']) =>
    editing === key ? (
      <div className={m.flowRow}>
        <span>{label}</span>
        <div className={m.inlineEdit}>
          <TextField value={draft} onChange={(v) => setDraft(formatNumberInput(parseNumberInput(v)))} suffix='₽' inputMode='numeric' ariaLabel={label} />
          <Btn
            size='m'
            loading={patch.isPending}
            onClick={() => {
              const rub = parseNumberInput(draft);
              if (!rub) return;
              patch.mutate(key === 'inflow' ? { monthly_inflow_avg: rubToMoney(rub) } : { monthly_operating_outflow_avg: rubToMoney(rub) });
            }}
          >
            Сохранить
          </Btn>
          <TextLink tone='muted' onClick={() => setEditing(null)}>
            Отмена
          </TextLink>
        </div>
      </div>
    ) : (
      <div className={m.flowRow}>
        <span>{label}</span>
        <b>{formatMoney(value.value)}</b>
        <TextLink
          tone='muted'
          disabled={!canEdit || !value.editable}
          onClick={() => {
            setDraft(formatNumberInput(value.value.value / 100));
            setEditing(key);
          }}
        >
          Уточнить
        </TextLink>
      </div>
    );

  return (
    <Dialog
      open
      onClose={onClose}
      size={600}
      title='Проверьте данные о финансах'
      subtitle={<StepHeader step={2} />}
      footer={
        <ModalFooter note='Ответы сохраняются автоматически'>
          <Btn variant='outline' size='l' onClick={() => navigate(`/match/${session.id}/step/1`)}>
            Назад
          </Btn>
          <Btn size='l' disabled={!confirmed || confirm.isPending} loading={next.isPending} onClick={() => next.mutate()}>
            Далее
          </Btn>
        </ModalFooter>
      }
    >
    <Stack gap={16}>
      <div className={m.lead}>Мы подставили доступные сведения. Проверьте их и дополните, если что-то изменилось.</div>

      <section className={m.block}>
        <div className={m.blockHead}>
          <div className={m.blockTitle}>
            Поступления и расходы
            <Pill tone='green' small>
              Из Альфа-Бизнеса
            </Pill>
          </div>
          <span className={m.small}>
            Среднее за {formatMonth(finance.period.from.slice(0, 7)).split(' ')[0]}-{formatMonth(finance.period.to.slice(0, 7))}
          </span>
        </div>
        {flowRow('Поступления в месяц', 'inflow', finance.monthly_inflow_avg)}
        {flowRow('Операционные расходы в месяц', 'outflow', finance.monthly_operating_outflow_avg)}
        <Panel style={{ marginTop: 8, padding: '14px 16px' }}>
          <div className={m.small} style={{ fontWeight: 500, color: 'var(--a-text)' }}>
            Свободный денежный поток
          </div>
          <div className={m.flow}>{formatMoney(finance.free_cash_flow.value)} / мес.</div>
          <div className={m.small}>Поступления минус операционные расходы, до платежей по кредитам.</div>
        </Panel>
      </section>

      <section className={m.block}>
        <div className={m.blockHead}>
          <div className={m.blockTitle}>Действующие кредиты и платежи</div>
        </div>
        <table className={m.debts}>
          <thead>
            <tr>
              <th>Обязательство</th>
              <th>Остаток долга</th>
              <th>Платёж в месяц</th>
            </tr>
          </thead>
          <tbody>
            {alfa.length > 0 && (
              <tr>
                <td>
                  {alfa.length} {plural(alfa.length, 'кредит', 'кредита', 'кредитов')} в Альфа-Банке{' '}
                  <Pill tone='green' small>
                    Из Альфа-Бизнеса
                  </Pill>
                </td>
                <td>{formatMoney(sum(alfa, 'balance'))}</td>
                <td>{formatMoney(sum(alfa, 'monthly_payment'))}</td>
              </tr>
            )}
            {otherDebts.map((d) => (
              <tr key={d.lender}>
                <td>
                  {d.source === 'bki' ? 'Кредит в другом банке' : d.lender}{' '}
                  {d.source === 'bki' ? (
                    <Pill small>БКИ · {bkiDate}</Pill>
                  ) : (
                    <Pill small tone='blue'>
                      Вы указали
                    </Pill>
                  )}
                </td>
                <td>{formatMoney(d.balance)}</td>
                <td>{formatMoney(d.monthly_payment)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {bkiDate && <div className={m.small}>БКИ: сведения получены по действующему согласию.</div>}
        <Panel style={{ marginTop: 10, padding: '12px 16px' }}>
          <div className={m.flowRow} style={{ border: 0, padding: 0 }}>
            <b>Всего платежей по кредитам</b>
            <b>{formatMoney(finance.debts.total_monthly_payment)} / мес.</b>
          </div>
        </Panel>
        {debtOpen ? (
          <div className={m.debtForm}>
            <TextField value={debt.lender} onChange={(v) => setDebt({ ...debt, lender: v })} placeholder='Банк или кредитор' />
            <TextField value={debt.balance} onChange={(v) => setDebt({ ...debt, balance: formatNumberInput(parseNumberInput(v)) })} placeholder='Остаток, ₽' inputMode='numeric' />
            <TextField value={debt.payment} onChange={(v) => setDebt({ ...debt, payment: formatNumberInput(parseNumberInput(v)) })} placeholder='Платёж в месяц, ₽' inputMode='numeric' />
            <Btn
              size='m'
              loading={patch.isPending}
              disabled={!debt.lender.trim() || !parseNumberInput(debt.payment)}
              onClick={() =>
                patch.mutate({
                  debts_add: [{ lender: debt.lender.trim(), balance: rubToMoney(parseNumberInput(debt.balance) ?? 0), monthly_payment: rubToMoney(parseNumberInput(debt.payment) ?? 0) }],
                })
              }
            >
              Добавить
            </Btn>
          </div>
        ) : (
          <div className={m.addRow}>
            <TextLink onClick={() => setDebtOpen(true)} disabled={!canEdit}>
              <PlusMIcon style={{ width: 18, height: 18 }} /> Добавить неучтённое обязательство
            </TextLink>
          </div>
        )}
      </section>

      <div className={m.attach}>
        <span>Данные неполные? Добавьте выписку или отчётность.</span>
        <Btn variant='outline' size='m' leftAddons={<PaperclipMIcon style={{ width: 18, height: 18 }} />} onClick={() => setUploadOpen(true)}>
          Прикрепить документ
        </Btn>
      </div>

      <CheckField
        checked={confirmed}
        disabled={confirm.isPending}
        onChange={(v) => {
          setConfirmed(v);
          setError(null);
          confirm.mutate(v);
        }}
        label={
          <>
            Подтверждаю, что данные актуальны <span className={m.required}>*</span>
          </>
        }
      />
      {error && <div className={m.error}>{error}</div>}


      <UploadDialog
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        title='Прикрепить документ'
        documentType={home.company?.legal_form === 'IP' ? 'tax_return' : 'fin_statements_2025'}
      />
    </Stack>
    </Dialog>
  );
}
