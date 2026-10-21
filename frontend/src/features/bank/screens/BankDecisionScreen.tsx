import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Button } from '@alfalab/core-components/button';
import { Input } from '@alfalab/core-components/input';
import { Textarea } from '@alfalab/core-components/textarea';

import { bankApi } from '@/features/bank/api';
import { ClientPreview } from '@/features/bank/components/ClientPreview';
import { useBankApplication } from '@/features/bank/hooks';
import type { BankApplicationDetail, BankDecisionRequest } from '@/features/bank/types';
import { documentsApi } from '@/features/documents/api';
import { errorText, fieldErrors, queryClient } from '@/shared/api/query';
import { formatMoney, formatPercent } from '@/shared/lib/format';
import type { Money } from '@/shared/types/common';
import { Card, CardTitle, Chips, DateField, FieldGroup, FieldLabel, FieldTag, InfoRow, InfoRows, MoneyInput, Note, NumberInput, PageHeader, QueryGate, SkeletonLines, Stack, Text, ToneLabel, uiStyles as s } from '@/shared/ui';

type Kind = 'approve' | 'counter_offer' | 'request_info' | 'reject';

export function BankDecisionScreen() {
  const { id = '' } = useParams();
  const app = useBankApplication(id);
  return <QueryGate query={app}>{(data) => <DecisionForm app={data} />}</QueryGate>;
}

function DecisionForm({ app }: { app: BankApplicationDetail }) {
  const navigate = useNavigate();
  const [kind, setKind] = useState<Kind>(app.scoring.outcome === 'approved' ? 'approve' : app.scoring.outcome === 'rejected' ? 'reject' : 'counter_offer');
  const [comment, setComment] = useState('');
  const [amount, setAmount] = useState<Money | null>(app.requested_amount);
  const [term, setTerm] = useState<number | null>(app.requested_term_months);
  const [rate, setRate] = useState<number | null>(app.rate_percent);
  const [reason, setReason] = useState<string | null>(null);
  const [template, setTemplate] = useState<string | null>(null);
  const [question, setQuestion] = useState('');
  const [docTypes, setDocTypes] = useState<string[]>([]);
  const [dueAt, setDueAt] = useState(() => new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10));
  const [reasons, setReasons] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const options = useQuery({ queryKey: ['bank', 'options', app.id], queryFn: () => bankApi.counterOfferOptions(app.id) });
  const templates = useQuery({ queryKey: ['bank', 'templates'], queryFn: bankApi.infoRequestTemplates });
  const rejection = useQuery({ queryKey: ['bank', 'reasons'], queryFn: bankApi.rejectionReasons });
  const types = useQuery({ queryKey: ['documents', 'types', app.company.company.legal_form], queryFn: () => documentsApi.types({ legal_form: app.company.company.legal_form }) });

  const body: BankDecisionRequest | null = useMemo(() => {
    if (kind === 'approve') return { type: 'approve', comment: comment || undefined };
    if (kind === 'counter_offer') {
      if (!amount?.value || !term || !rate) return null;
      return { type: 'counter_offer', amount, term_months: term, rate_percent: rate, reason_code: reason ?? '', comment: comment || undefined };
    }
    if (kind === 'request_info') {
      return { type: 'request_info', template_code: template ?? undefined, question, requested_document_types: docTypes, due_at: dueAt ? `${dueAt}T18:00:00+03:00` : '' };
    }
    return { type: 'reject', reason_codes: reasons, comment: comment || undefined };
  }, [kind, comment, amount, term, rate, reason, template, question, docTypes, dueAt, reasons]);

  const [debounced, setDebounced] = useState(body);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(body), 500);
    return () => clearTimeout(t);
  }, [body]);
  const preview = useQuery({
    queryKey: ['bank', 'preview', app.id, debounced],
    queryFn: () => bankApi.previewDecision(app.id, debounced!),
    enabled: !!debounced,
    placeholderData: (prev) => prev,
  });

  const decide = useMutation({
    mutationFn: () => bankApi.decide(app.id, body!),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['bank'] });
      navigate('/bank/queue');
    },
    onError: (e) => {
      const fe = fieldErrors(e);
      setErrors(Object.keys(fe).length ? fe : { form: errorText(e) });
    },
  });

  const validate = () => {
    const next: Record<string, string> = {};
    if (kind === 'counter_offer') {
      if (!amount?.value) next.amount = 'Укажите сумму';
      if (!term) next.term_months = 'Укажите срок';
      if (!reason) next.reason_code = 'Выберите причину';
    }
    if (kind === 'request_info') {
      if (!question.trim()) next.question = 'Напишите вопрос';
      if (!docTypes.length) next.requested_document_types = 'Выберите документы';
      if (!dueAt) next.due_at = 'Укажите срок';
    }
    if (kind === 'reject' && !reasons.length) next.reason_codes = 'Выберите причину';
    setErrors(next);
    return !Object.keys(next).length;
  };

  if (app.status !== 'in_review' && app.status !== 'submitted') {
    return (
      <Card>
        <Note tone='info'>Решение по заявке уже принято</Note>
      </Card>
    );
  }

  return (
    <div>
      <PageHeader
        title={`Решение по заявке ${app.number}`}
        subtitle={`${app.company.company.short_name} · балл ${app.scoring.total}`}
        right={
          <Button view='secondary' size={40} onClick={() => navigate(`/bank/applications/${app.id}`)}>
            К карточке
          </Button>
        }
      />
      <div className={s.mainAside}>
        <Stack gap={16}>
          <Card>
            <Stack gap={24}>
              <Chips
                options={[
                  { value: 'approve', label: 'Одобрить' },
                  { value: 'counter_offer', label: 'Другие условия' },
                  { value: 'request_info', label: 'Запросить данные' },
                  { value: 'reject', label: 'Отказать' },
                ]}
                value={kind}
                onChange={(v) => {
                  setKind(v);
                  setErrors({});
                }}
              />

              {kind === 'approve' && (
                <InfoRows>
                  <InfoRow label='Сумма'>{formatMoney(app.requested_amount)}</InfoRow>
                  <InfoRow label='Срок'>{app.requested_term_months} мес.</InfoRow>
                  <InfoRow label='Ставка'>{formatPercent(app.rate_percent)}</InfoRow>
                </InfoRows>
              )}

              {kind === 'counter_offer' && (
                <>
                  <FieldGroup label={<FieldLabel>Варианты под целевую нагрузку</FieldLabel>}>
                    {options.isLoading ? (
                      <SkeletonLines lines={2} />
                    ) : (
                      <div className={s.grid3}>
                        {(options.data?.options ?? []).map((o) => (
                          <button
                            key={`${o.amount.value}-${o.term_months}`}
                            type='button'
                            className={s.personRow}
                            style={{ border: '1px solid var(--color-light-bg-tertiary, #e7e8ea)', background: 'none', textAlign: 'left', cursor: 'pointer', font: 'inherit', flexDirection: 'column', alignItems: 'flex-start' }}
                            onClick={() => {
                              setAmount(o.amount);
                              setTerm(o.term_months);
                            }}
                          >
                            <Text medium>
                              {formatMoney(o.amount)} на {o.term_months} мес.
                            </Text>
                            <Text small secondary>
                              платёж {formatMoney(o.monthly_payment)}
                            </Text>
                            <ToneLabel tone={o.load.load_percent <= o.load.target_percent ? 'positive' : o.load.load_percent <= o.load.threshold_percent ? 'attention' : 'negative'} small>
                              нагрузка {formatPercent(o.load.load_percent)}
                            </ToneLabel>
                          </button>
                        ))}
                      </div>
                    )}
                  </FieldGroup>
                  <div className={s.grid3}>
                    <MoneyInput label='Сумма' value={amount} onChange={setAmount} error={errors.amount} />
                    <NumberInput label='Срок' suffix='мес.' value={term} onChange={setTerm} error={errors.term_months} />
                    <Input label='Ставка, %' size={56} block value={rate?.toString() ?? ''} onChange={(_, { value }) => setRate(Number(value.replace(',', '.')) || null)} />
                  </div>
                  <FieldGroup label={<FieldLabel tag='required'>Причина</FieldLabel>} error={errors.reason_code}>
                    <Chips options={(rejection.data ?? []).map((r) => ({ value: r.code, label: r.title }))} value={reason} onChange={setReason} />
                  </FieldGroup>
                </>
              )}

              {kind === 'request_info' && (
                <>
                  <FieldGroup label={<FieldLabel>Шаблон</FieldLabel>}>
                    <Chips
                      options={(templates.data ?? []).map((t) => ({ value: t.code, label: t.title }))}
                      value={template}
                      onChange={(v) => {
                        setTemplate(v);
                        const t = templates.data?.find((x) => x.code === v);
                        if (t) {
                          setQuestion(t.question);
                          setDocTypes(t.requested_document_types);
                        }
                      }}
                    />
                  </FieldGroup>
                  <Textarea
                    label='Вопрос клиенту'
                    block
                    minRows={3}
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    error={errors.question}
                    rightAddons={<FieldTag kind='required' />}
                  />
                  <FieldGroup label={<FieldLabel tag='required'>Какие документы нужны</FieldLabel>} error={errors.requested_document_types}>
                    <Chips
                      multiple
                      options={(types.data ?? []).map((t) => ({ value: t.code, label: t.title }))}
                      value={docTypes}
                      onChange={(v) => setDocTypes(docTypes.includes(v) ? docTypes.filter((x) => x !== v) : [...docTypes, v])}
                    />
                  </FieldGroup>
                  <FieldGroup label={<FieldLabel tag='required'>Срок ответа</FieldLabel>} error={errors.due_at}>
                    <DateField label='Ответить до' value={dueAt} onChange={setDueAt} size={56} />
                  </FieldGroup>
                </>
              )}

              {kind === 'reject' && (
                <FieldGroup label={<FieldLabel tag='required'>Причины</FieldLabel>} error={errors.reason_codes}>
                  <Chips
                    multiple
                    options={(rejection.data ?? []).map((r) => ({ value: r.code, label: r.title }))}
                    value={reasons}
                    onChange={(v) => setReasons(reasons.includes(v) ? reasons.filter((x) => x !== v) : [...reasons, v])}
                  />
                </FieldGroup>
              )}

              {kind !== 'request_info' && (
                <Textarea label='Комментарий' block minRows={2} value={comment} onChange={(e) => setComment(e.target.value)} rightAddons={<FieldTag kind='situational' />} />
              )}

              {errors.form && <Note tone='negative'>{errors.form}</Note>}

              <div>
                <Button view='primary' size={56} onClick={() => validate() && decide.mutate()} loading={decide.isPending}>
                  Отправить решение
                </Button>
              </div>
            </Stack>
          </Card>
        </Stack>

        <Card>
          <CardTitle>Что увидит клиент</CardTitle>
          {!debounced ? (
            <Text secondary>Заполните поля, чтобы увидеть превью</Text>
          ) : preview.isLoading ? (
            <SkeletonLines lines={4} />
          ) : preview.data ? (
            <ClientPreview view={preview.data.client_view} />
          ) : null}
        </Card>
      </div>
    </div>
  );
}
