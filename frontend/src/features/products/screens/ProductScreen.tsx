import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Button } from '@alfalab/core-components/button';

import { can } from '@/app/access';
import { applicationsApi } from '@/features/applications/api';
import { productsApi } from '@/features/products/api';
import { COLLATERAL_TEXT } from '@/features/products/components/ProductCard';
import type { Product } from '@/features/products/types';
import { useCurrentHome } from '@/features/profile/components/AppShell/AppShell';
import { errorText, invalidateApplication } from '@/shared/api/query';
import { keys } from '@/shared/api/queryKeys';
import { PURPOSE_LABELS, TEXTS } from '@/shared/i18n/ru';
import { formatMoney, formatMonths, formatPercent } from '@/shared/lib/format';
import type { Money } from '@/shared/types/common';
import { Card, CardTitle, Chips, FieldGroup, FieldLabel, InfoRow, InfoRows, MoneyInput, Note, PageHeader, QueryGate, Row, SmallTag, Stack, Text, uiStyles as s } from '@/shared/ui';

export function ProductScreen() {
  const { code = '' } = useParams();
  const product = useQuery({ queryKey: keys.product(code), queryFn: () => productsApi.get(code as Product['code']) });
  return <QueryGate query={product}>{(p) => <ProductDetails product={p} />}</QueryGate>;
}

function ProductDetails({ product: p }: { product: Product }) {
  const navigate = useNavigate();
  const home = useCurrentHome();
  const [amount, setAmount] = useState<Money | null>(clampDefault(p));
  const [term, setTerm] = useState<number>(Math.min(Math.max(12, p.term_min_months), p.term_max_months));
  const [debounced, setDebounced] = useState({ amount, term });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced({ amount, term }), 400);
    return () => clearTimeout(t);
  }, [amount, term]);

  const amountError =
    amount && (amount.value < p.amount_min.value || amount.value > p.amount_max.value)
      ? `От ${formatMoney(p.amount_min)} до ${formatMoney(p.amount_max)}`
      : null;

  const calc = useQuery({
    queryKey: ['calc', p.code, debounced.amount?.value, debounced.term],
    queryFn: () =>
      productsApi.calcPayment({ amount: debounced.amount!, term_months: debounced.term, rate_percent: Math.max(p.rate_from_percent, 15), schedule: 'annuity' }),
    enabled: !!debounced.amount?.value && !amountError,
  });

  const create = useMutation({
    mutationFn: () => applicationsApi.create({ source: 'catalog', product_code: p.code, amount: amount!, term_months: term, purpose_code: p.purposes[0] }),
    onSuccess: (app) => {
      invalidateApplication(app.id);
      navigate(`/applications/${app.id}/edit`);
    },
    onError: (e) => setError(errorText(e)),
  });

  const terms = [3, 6, 12, 18, 24, 36, 48, 60, 84].filter((t) => t >= p.term_min_months && t <= p.term_max_months);
  const canSubmit = can(home, 'apply');
  const wrongForm = home.company && !p.legal_forms.includes(home.company.legal_form);

  return (
    <div>
      <PageHeader
        title={
          <Row gap={12}>
            {p.name}
            {p.is_fictional && <SmallTag>вымышленный</SmallTag>}
          </Row>
        }
        subtitle={p.description}
        right={
          <Button view='secondary' size={40} onClick={() => navigate('/products')}>
            Все варианты
          </Button>
        }
      />
      <div className={s.mainAside}>
        <Stack gap={16}>
          <Card>
            <CardTitle>Калькулятор</CardTitle>
            <Stack gap={20}>
              <FieldGroup label={<FieldLabel tag='situational'>Сумма</FieldLabel>} error={amountError}>
                <MoneyInput label='Сколько нужно' value={amount} onChange={setAmount} />
              </FieldGroup>
              <FieldGroup label={<FieldLabel tag='situational'>Срок</FieldLabel>}>
                <Chips options={terms.map((t) => ({ value: String(t), label: `${t} мес.` }))} value={String(term)} onChange={(v) => setTerm(Number(v))} />
              </FieldGroup>
              <div className={s.grid3}>
                <Metric label='Платёж в месяц' value={calc.data ? formatMoney(calc.data.monthly_payment) : '…'} />
                <Metric label='Переплата' value={calc.data ? formatMoney(calc.data.overpayment) : '…'} />
                <Metric label='Ставка' value={`от ${formatPercent(p.rate_from_percent)}, условная`} />
              </div>
              <Text small secondary>
                {TEXTS.notADecision}
              </Text>
            </Stack>
          </Card>
          {wrongForm && <Note tone='attention'>Этот продукт недоступен для вашей формы бизнеса</Note>}
          {error && <Note tone='negative'>{error}</Note>}
          <div>
            <Button view='primary' size={56} disabled={!canSubmit || !amount?.value || !!amountError || !!wrongForm} loading={create.isPending} onClick={() => create.mutate()}>
              Оформить
            </Button>
          </div>
        </Stack>

        <Stack gap={16}>
          <Card>
            <CardTitle>Кому подходит</CardTitle>
            <Stack gap={8}>
              {p.suits.map((x) => (
                <Text key={x}>✓ {x}</Text>
              ))}
              {p.not_suits.map((x) => (
                <Text key={x} secondary>
                  ✕ {x}
                </Text>
              ))}
            </Stack>
          </Card>
          <Card>
            <InfoRows>
              <InfoRow label='Цели'>{p.purposes.map((x) => PURPOSE_LABELS[x]).join(', ')}</InfoRow>
              <InfoRow label='Залог'>{COLLATERAL_TEXT[p.collateral]}</InfoRow>
              <InfoRow label='Срок работы бизнеса'>от {formatMonths(p.min_business_age_months)}</InfoRow>
              <InfoRow label='Решение'>{p.decision_time_text}</InfoRow>
            </InfoRows>
            {p.source_note && (
              <Text small secondary tag='p' className={s.pageSubtitle}>
                {p.source_note}
              </Text>
            )}
          </Card>
        </Stack>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className={s.metric}>
      <Text small secondary>
        {label}
      </Text>
      <Text bold>{value}</Text>
    </div>
  );
}

function clampDefault(p: Product): Money {
  const target = 100_000_000;
  return { value: Math.min(Math.max(target, p.amount_min.value), p.amount_max.value), currency: 'RUB' };
}
