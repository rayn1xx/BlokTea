import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ClockLineMIcon } from '@alfalab/icons-glyph/ClockLineMIcon';

import { applicationsApi } from '@/features/applications/api';
import { useStartMatching } from '@/features/matching/lib';
import { productsApi } from '@/features/products/api';
import { useProducts } from '@/features/products/hooks';
import type { PreapprovedOffer } from '@/features/products/types';
import { useCurrentHome } from '@/features/profile/components/AppShell/AppShell';
import { errorText, invalidateApplication } from '@/shared/api/query';
import { formatLongDate, formatMoney, formatMonths, formatPercent } from '@/shared/lib/format';
import { Accordion, Btn, Dialog, InfoLine, Panel, Stack, TextLink } from '@/shared/ui';

import p from './offer.module.css';

const COLLATERAL_TEXT = { none: 'Не требуется', optional: 'По желанию', required: 'Требуется' };

export function PersonalOfferModal({ offer, onClose }: { offer: PreapprovedOffer; onClose: () => void }) {
  const navigate = useNavigate();
  const home = useCurrentHome();
  const products = useProducts(home.company?.legal_form);
  const product = products.data?.find((x) => x.code === offer.product.code);
  const rate = Math.max(product?.rate_from_percent ?? 15, 15);
  const [error, setError] = useState<string | null>(null);
  const matching = useStartMatching();

  const calc = useQuery({
    queryKey: ['calc', 'offer', offer.offer_id, rate],
    queryFn: () => productsApi.calcPayment({ amount: offer.limit, term_months: offer.term_months, rate_percent: rate, schedule: 'annuity' }),
  });

  const create = useMutation({
    mutationFn: () => applicationsApi.create({ source: 'preapproved', offer_id: offer.offer_id }),
    onSuccess: (app) => {
      invalidateApplication(app.id);
      navigate(`/applications/${app.id}/edit`);
    },
    onError: (e) => setError(errorText(e)),
  });

  return (
    <Dialog open onClose={onClose} title='Персональное предложение' subtitle={`Для ${home.company?.short_name ?? 'вашей компании'}`}>
      <Stack gap={14}>
        <Panel>
          <div className={p.product}>{offer.product.name}</div>
          <div className={p.muted}>Деньги одной суммой</div>
          <div className={p.amount}>до {formatMoney(offer.limit)}</div>
          <dl className={p.grid}>
            <div>
              <dt>Срок</dt>
              <dd>{formatMonths(offer.term_months)}</dd>
            </div>
            <div>
              <dt>Ставка</dt>
              <dd>{formatPercent(rate, 0)} годовых</dd>
            </div>
            <div>
              <dt>Платёж в месяц</dt>
              <dd>{calc.data ? `≈ ${formatMoney(calc.data.monthly_payment)}` : '…'}</dd>
            </div>
            <div>
              <dt>Залог</dt>
              <dd>{product ? COLLATERAL_TEXT[product.collateral === 'optional' ? 'none' : product.collateral] : '…'}</dd>
            </div>
          </dl>
          <div className={p.note}>Расчёт для суммы {formatMoney(offer.limit)}</div>
        </Panel>
        <InfoLine icon={ClockLineMIcon}>
          Предложение действует до {formatLongDate(offer.valid_until)}
        </InfoLine>
        <Accordion title='График и расходы'>
          {calc.data && (
            <dl className={p.list}>
              <div>
                <dt>Ежемесячный платёж</dt>
                <dd>{formatMoney(calc.data.monthly_payment)}</dd>
              </div>
              <div>
                <dt>Проценты за весь срок</dt>
                <dd>{formatMoney(calc.data.overpayment)}</dd>
              </div>
              <div>
                <dt>Всего к возврату</dt>
                <dd>{formatMoney(calc.data.total_payment)}</dd>
              </div>
            </dl>
          )}
        </Accordion>
        <Accordion title='Требования и документы'>
          <Stack gap={6}>
            {product?.suits.map((s) => (
              <div key={s}>✓ {s}</div>
            ))}
            <div className={p.muted}>{product?.decision_time_text}. Данные компании подставим из Альфа-Бизнеса.</div>
          </Stack>
        </Accordion>
        <div className={p.muted} style={{ fontSize: 13 }}>
          Вы сможете проверить данные и необходимые условия перед отправкой заявки.
        </div>
        {(error || matching.error) && <div style={{ color: 'var(--a-red)' }}>{error ?? matching.error}</div>}
        <Btn size='l' block onClick={() => create.mutate()} loading={create.isPending}>
          Перейти к оформлению
        </Btn>
        <div style={{ textAlign: 'center' }}>
          <TextLink tone='red' onClick={matching.start}>
            Подобрать другой вариант
          </TextLink>
        </div>
        <div className={p.disclaimer}>Демонстрационные условия. Окончательное решение после рассмотрения заявки.</div>
      </Stack>
    </Dialog>
  );
}
