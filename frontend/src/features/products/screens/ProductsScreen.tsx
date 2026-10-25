import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { CheckmarkCircleMIcon } from '@alfalab/icons-glyph/CheckmarkCircleMIcon';
import { ChevronDownMIcon } from '@alfalab/icons-glyph/ChevronDownMIcon';
import { OfficeMIcon } from '@alfalab/icons-glyph/OfficeMIcon';
import { PencilMIcon } from '@alfalab/icons-glyph/PencilMIcon';

import { applicationsApi } from '@/features/applications/api';
import type { RecommendResponse } from '@/features/matching/types';
import { productsApi } from '@/features/products/api';
import { useProducts } from '@/features/products/hooks';
import type { Product } from '@/features/products/types';
import { useCurrentHome } from '@/features/profile/components/AppShell/AppShell';
import { errorText, invalidateApplication, queryClient } from '@/shared/api/query';
import { PURPOSE_LABELS } from '@/shared/i18n/ru';
import { formatMoney, formatMonths, formatNumberInput, formatPercent, parseNumberInput, rubToMoney } from '@/shared/lib/format';
import { Btn, Card, Field, PageHead, Pill, QueryGate, SelectField, Stack, TextField, TextLink } from '@/shared/ui';

import p from './ProductsScreen.module.css';

const COLLATERAL_TEXT = { none: 'Без залога', optional: 'Залог по желанию', required: 'Нужен залог' };

function rateOf(product: Product) {
  return Math.max(product.rate_from_percent, 15);
}

export function ProductsScreen() {
  const home = useCurrentHome();
  const products = useProducts(home.company?.legal_form);
  return <QueryGate query={products}>{(list) => <ProductChoice products={list} />}</QueryGate>;
}

function ProductChoice({ products }: { products: Product[] }) {
  const navigate = useNavigate();
  const home = useCurrentHome();
  const { code } = useParams();
  const [params] = useSearchParams();
  const sessionId = params.get('session');

  const recommendation = sessionId
    ? (queryClient.getQueriesData<RecommendResponse>({ queryKey: ['matching', sessionId, 'recommend'] }).find(([, d]) => d)?.[1] ?? null)
    : null;
  const recommendedCode = recommendation?.primary.product.code ?? null;

  const ordered = useMemo(() => {
    const list = [...products];
    if (recommendedCode) list.sort((a, b) => Number(b.code === recommendedCode) - Number(a.code === recommendedCode));
    return list;
  }, [products, recommendedCode]);

  const [showAll, setShowAll] = useState(!!code);
  const [selected, setSelected] = useState<Product['code']>((code as Product['code']) ?? recommendedCode ?? ordered[0].code);
  const product = products.find((x) => x.code === selected) ?? ordered[0];
  const visible = showAll ? ordered : ordered.slice(0, 3).some((x) => x.code === selected) ? ordered.slice(0, 3) : [product, ...ordered.slice(0, 2)];

  return (
    <div>
      <PageHead
        back={sessionId ? { label: 'Назад к подбору', to: `/match/${sessionId}/step/4` } : { label: 'Кредитование', to: '/home' }}
        title='Выберите вариант финансирования'
        subtitle={sessionId ? 'Ваш выбор сохранён. Можно сравнить другие варианты перед оформлением.' : 'Сравните условия и рассчитайте платёж перед оформлением.'}
      />
      <div className={p.layout}>
        <div>
          <div className={p.listHead}>
            <h2 className={p.listTitle}>Подходящие варианты</h2>
            <Pill icon={<OfficeMIcon style={{ width: 16, height: 16 }} />}>Для {home.company?.legal_form === 'IP' ? 'ИП' : 'ООО'}</Pill>
          </div>
          <Stack gap={14}>
            {visible.map((x) => (
              <ProductOption key={x.code} product={x} selected={x.code === selected} recommended={x.code === recommendedCode} onSelect={() => setSelected(x.code)} />
            ))}
          </Stack>
          {!showAll && ordered.length > 3 && (
            <div style={{ marginTop: 18 }}>
              <TextLink underline arrow onClick={() => setShowAll(true)}>
                Посмотреть весь каталог
              </TextLink>
            </div>
          )}
        </div>
        <Calculator key={product.code} product={product} recommendation={recommendation} onCreated={(id) => navigate(`/applications/${id}/edit`)} />
      </div>
    </div>
  );
}

function ProductOption({ product, selected, recommended, onSelect }: { product: Product; selected: boolean; recommended: boolean; onSelect: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <article className={`${p.option} ${selected ? p.optionSelected : ''}`}>
      <div className={p.optionTop}>
        <div>
          {recommended && (
            <div style={{ marginBottom: 8 }}>
              <Pill small>Рекомендация</Pill>
            </div>
          )}
          <h3 className={p.optionTitle}>
            {product.name}
            {product.is_fictional && <span className={p.fictional}>вымышленный</span>}
          </h3>
          <div className={p.optionSub}>{product.description}</div>
        </div>
        {selected ? (
          <span className={p.chosen}>
            <CheckmarkCircleMIcon /> Выбрано вами
          </span>
        ) : (
          <button type='button' className={p.radio} onClick={onSelect} aria-label={`Выбрать: ${product.name}`} />
        )}
      </div>
      {selected ? (
        <div className={p.facts}>
          <div>
            <b>от {formatMoney(product.amount_min)}</b>
            <span>до {formatMoney(product.amount_max)}</span>
          </div>
          <div>
            <b>{product.term_min_months === product.term_max_months ? formatMonths(product.term_max_months) : `${product.term_min_months}-${product.term_max_months} мес.`}</b>
            <span>Срок</span>
          </div>
          <div>
            <b>от {formatPercent(rateOf(product), 0)} годовых</b>
            <span>Ставка</span>
          </div>
          <div>
            <b>{COLLATERAL_TEXT[product.collateral]}</b>
            <span>Обеспечение</span>
          </div>
        </div>
      ) : (
        <div className={p.optionRow}>
          <span className={p.optionMeta}>
            {product.need_types.includes('recurring') ? 'Получение частями · лимит возобновляется' : product.collateral === 'required' ? 'Потребуется оценка залога' : product.decision_time_text}
          </span>
          <Btn variant='outline' size='l' onClick={onSelect}>
            Рассмотреть вариант
          </Btn>
        </div>
      )}
      <button type='button' className={p.more} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <ChevronDownMIcon style={{ transform: open ? 'rotate(180deg)' : undefined }} />
        Подробнее
      </button>
      {open && (
        <div className={p.details}>
          <div>Цели: {product.purposes.map((x) => PURPOSE_LABELS[x].toLowerCase()).join(', ')}</div>
          {product.suits.map((s) => (
            <div key={s}>✓ {s}</div>
          ))}
          {product.not_suits.map((s) => (
            <div key={s} className={p.muted}>
              ✕ {s}
            </div>
          ))}
          <div className={p.muted}>
            {product.decision_time_text}. Бизнесу от {formatMonths(product.min_business_age_months)}.
          </div>
          {product.source_note && <div className={p.muted}>{product.source_note}</div>}
        </div>
      )}
    </article>
  );
}

function Calculator({ product, recommendation, onCreated }: { product: Product; recommendation: RecommendResponse | null; onCreated: (id: string) => void }) {
  const fromRec = recommendation?.primary.product.code === product.code ? recommendation.primary : null;
  const defaultAmount = fromRec ? fromRec.amount.value / 100 : Math.min(Math.max(1_000_000, product.amount_min.value / 100), product.amount_max.value / 100);
  const terms = [3, 6, 12, 18, 24, 36, 48, 60, 84].filter((t) => t >= product.term_min_months && t <= product.term_max_months);
  const [amount, setAmount] = useState(formatNumberInput(defaultAmount));
  const [term, setTerm] = useState(String(fromRec?.term_months ?? (terms.includes(36) ? 36 : terms[terms.length - 1])));
  const [debounced, setDebounced] = useState({ amount, term });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced({ amount, term }), 400);
    return () => clearTimeout(t);
  }, [amount, term]);

  const rub = parseNumberInput(debounced.amount) ?? 0;
  const outOfRange = rub * 100 < product.amount_min.value || rub * 100 > product.amount_max.value;
  const calc = useQuery({
    queryKey: ['calc', product.code, rub, debounced.term],
    queryFn: () => productsApi.calcPayment({ amount: rubToMoney(rub), term_months: Number(debounced.term), rate_percent: rateOf(product), schedule: 'annuity' }),
    enabled: rub > 0 && !outOfRange,
  });

  const create = useMutation({
    mutationFn: () =>
      applicationsApi.create({
        source: 'catalog',
        product_code: product.code,
        amount: rubToMoney(parseNumberInput(amount) ?? 0),
        term_months: Number(term),
        purpose_code: product.purposes[0],
      }),
    onSuccess: (app) => {
      invalidateApplication(app.id);
      onCreated(app.id);
    },
    onError: (e) => setError(errorText(e)),
  });

  const rows: [string, string][] = [
    ['Ставка', `${formatPercent(rateOf(product), 0)} годовых`],
    ['Платёж в месяц', calc.data ? `≈ ${formatMoney(calc.data.monthly_payment)}` : '…'],
    ['Проценты за весь срок', calc.data ? `≈ ${formatMoney(calc.data.overpayment)}` : '…'],
    ['Всего к возврату', calc.data ? `≈ ${formatMoney(calc.data.total_payment)}` : '…'],
  ];

  return (
    <Card className={p.calc}>
      <div className={p.calcTitle}>Выбранный вариант</div>
      <div className={p.calcProduct}>{product.name}</div>
      <div className={p.calcSection}>Расчёт условий</div>
      <Stack gap={14}>
        <Field label='Сумма' error={outOfRange && rub ? `От ${formatMoney(product.amount_min)} до ${formatMoney(product.amount_max)}` : null}>
          <TextField value={amount} onChange={(v) => setAmount(formatNumberInput(parseNumberInput(v)))} suffix={<PencilMIcon style={{ width: 18, height: 18 }} />} inputMode='numeric' ariaLabel='Сумма, ₽' />
        </Field>
        <Field label='Срок'>
          <SelectField value={term} options={terms.map((t) => ({ value: String(t), label: formatMonths(t) }))} onChange={setTerm} ariaLabel='Срок' />
        </Field>
      </Stack>
      <dl className={p.calcRows}>
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <div className={p.calcNote}>Расчёт без дополнительных услуг и комиссий. Изменение суммы или срока потребует повторной оценки.</div>
      {error && <div style={{ color: 'var(--a-red)', marginBottom: 10 }}>{error}</div>}
      <Btn size='l' block loading={create.isPending} disabled={outOfRange || !rub} onClick={() => create.mutate()}>
        Перейти к оформлению
      </Btn>
      <div className={p.calcNote} style={{ marginTop: 10 }}>
        Предварительные демо-условия. Не является одобрением.
      </div>
    </Card>
  );
}
