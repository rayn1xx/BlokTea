import { useRef, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { CheckmarkCircleMIcon } from '@alfalab/icons-glyph/CheckmarkCircleMIcon';
import { ChevronRightMIcon } from '@alfalab/icons-glyph/ChevronRightMIcon';
import { DocumentLinesMIcon } from '@alfalab/icons-glyph/DocumentLinesMIcon';
import { DocumentMIcon } from '@alfalab/icons-glyph/DocumentMIcon';
import { InformationCircleLineMIcon } from '@alfalab/icons-glyph/InformationCircleLineMIcon';

import { applicationsApi } from '@/features/applications/api';
import { CompanyStep } from '@/features/applications/components/CompanyStep';
import { FinanceStep } from '@/features/applications/components/FinanceStep';
import { useApplication, useRequirements } from '@/features/applications/hooks';
import type { ApplicationDetail, Requirement, RequirementCode } from '@/features/applications/types';
import { UploadDialog } from '@/features/documents/components/UploadDialog';
import { PRODUCT_ICONS } from '@/features/products/productIcons';
import { useCurrentHome } from '@/features/profile/components/AppShell/AppShell';
import { MemberPicker } from '@/features/team/components/MemberPicker';
import { isApiError } from '@/shared/api/client';
import { errorText, invalidateApplication, queryClient } from '@/shared/api/query';
import { keys } from '@/shared/api/queryKeys';
import { ERRORS, PURPOSE_LABELS } from '@/shared/i18n/ru';
import { formatMoney, formatMonths, formatNumberInput, formatPercent, parseNumberInput, rubToMoney } from '@/shared/lib/format';
import { useAutosave } from '@/shared/lib/useAutosave';
import { Btn, Card, CodeConfirm, Dialog, Field, Grow, IconCircle, Metrics, ModalFooter, PageHead, Pill, QueryGate, SelectField, SkeletonLines, Stack, TextField, TextLink } from '@/shared/ui';

import s from './ApplicationEditScreen.module.css';

const CONSENTS: RequirementCode[] = ['consent_bki', 'consent_pd'];

export function ApplicationEditScreen() {
  const { id = '' } = useParams();
  const app = useApplication(id);
  return (
    <QueryGate query={app}>
      {(data) => (data.status !== 'draft' || !data.available_actions.includes('application.edit') ? <Navigate to={`/applications/${id}`} replace /> : <EditView app={data} />)}
    </QueryGate>
  );
}

function EditView({ app }: { app: ApplicationDetail }) {
  const navigate = useNavigate();
  const home = useCurrentHome();
  const requirements = useRequirements(app.id);
  const version = useRef(app.version);
  version.current = Math.max(version.current, app.version);

  const [dialog, setDialog] = useState<null | 'terms' | 'company' | 'finance' | 'consentText' | 'handoff'>(null);
  const [confirmQueue, setConfirmQueue] = useState<Requirement[]>([]);
  const [upload, setUpload] = useState<Requirement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [handedOff, setHandedOff] = useState<string | null>(null);

  const applyServer = (u: ApplicationDetail) => {
    version.current = u.version;
    queryClient.setQueryData(keys.application(app.id), u);
  };
  const { state, schedule, flush } = useAutosave<{ amount?: ApplicationDetail['requested_amount']; term_months?: number; form?: { data?: Record<string, unknown> } }>(async (patch) => {
    try {
      applyServer(await applicationsApi.patch(app.id, { ...patch, version: version.current }));
    } catch (err) {
      if (isApiError(err, 'VERSION_CONFLICT')) {
        setConflict(true);
        applyServer(await applicationsApi.get(app.id));
      }
      throw err;
    }
  });

  const refreshReqs = () => {
    void queryClient.invalidateQueries({ queryKey: keys.requirements(app.id) });
    void queryClient.invalidateQueries({ queryKey: keys.application(app.id) });
  };

  const submit = useMutation({
    mutationFn: async () => {
      await flush().catch(() => undefined);
      return applicationsApi.submit(app.id);
    },
    onSuccess: () => {
      invalidateApplication(app.id);
      navigate(`/applications/${app.id}`, { replace: true });
    },
    onError: (err) => setError(isApiError(err, 'REQUIREMENTS_NOT_MET') ? 'Не всё готово для отправки: выполните пункты в блоке «Что осталось для отправки»' : errorText(err)),
  });

  const saveExit = useMutation({
    mutationFn: () => flush(),
    onSuccess: () => {
      invalidateApplication(app.id);
      navigate('/home');
    },
    onError: (err) => setError(errorText(err)),
  });

  const items = requirements.data?.items ?? [];
  const missingConsents = items.filter((r) => CONSENTS.includes(r.code) && r.status !== 'done');
  const otherRequired = items.filter((r) => !CONSENTS.includes(r.code) && r.necessity === 'required' && r.status === 'missing');
  const docs = items.filter((r) => !CONSENTS.includes(r.code) && r.status !== 'not_needed');
  const requiredDocsDone = docs.filter((r) => r.necessity === 'required').every((r) => r.status === 'done');
  const canSubmit = requirements.data?.can_submit ?? false;
  const actions = app.available_actions;
  const Icon = PRODUCT_ICONS[app.product.code];
  const amount = app.requested_amount;
  const hint = !requirements.data ? '' : canSubmit ? 'Всё готово к отправке' : missingConsents.length ? 'Осталось подтвердить заявку' : 'Осталось добавить обязательные документы';

  return (
    <div className={s.page}>
      <PageHead
        back={{ label: 'К выбору кредита', to: '/products' }}
        title='Проверьте заявку'
        subtitle='Мы перенесли данные из подбора. Повторно заполнять их не нужно.'
        right={
          <span className={s.saved}>
            <CheckmarkCircleMIcon /> {state.status === 'saving' ? 'Сохраняем…' : state.status === 'error' ? 'Не сохранилось' : 'Черновик сохранён'}
          </span>
        }
      />

      {conflict && <div className={s.warn}>{ERRORS.versionConflict}</div>}
      {app.client_warning_accepted && <div className={s.warn}>Вы оставили сумму выше рекомендуемой. Банк увидит это и может предложить другие условия.</div>}

      <Stack gap={14}>
        <Card>
          <div className={s.productHead}>
            <IconCircle icon={Icon} />
            <Grow>
              <div className={s.productName}>{app.product.name}</div>
              <div className={s.muted}>Предварительные демо-условия · {app.collateral && app.collateral.type !== 'none' ? 'С залогом' : 'Без залога'}</div>
            </Grow>
            <Btn variant='outline' size='l' onClick={() => setDialog('terms')}>
              Изменить
            </Btn>
          </div>
          <div className={s.metrics}>
            <Metrics
              items={[
                { value: formatMoney(amount), label: 'Сумма кредита' },
                { value: formatMonths(app.requested_term_months), label: 'Срок' },
                { value: `${formatPercent(app.rate_percent, 0)} годовых`, label: 'Ставка' },
                { value: `≈ ${formatMoney(app.monthly_payment_estimate)}/мес.`, label: 'Ориентировочный платёж' },
              ]}
            />
          </div>
        </Card>

        <CheckRow title='Компания' text={`${home.company?.short_name ?? ''} · данные из реестра`} onClick={() => setDialog('company')} />
        <CheckRow title='Финансы' text='Данные из Альфа-Бизнеса и подбора' onClick={() => setDialog('finance')} />

        <Card title='Что осталось для отправки'>
          <div className={s.muted} style={{ marginTop: 4 }}>
            Подтверждение в прототипе: кодом внутри кабинета.
          </div>
          {!requirements.data ? (
            <SkeletonLines lines={2} />
          ) : missingConsents.length || otherRequired.length ? (
            <Stack gap={10} style={{ marginTop: 14 }}>
              {missingConsents.length > 0 && (
                <div className={s.todo}>
                  <IconCircle icon={DocumentLinesMIcon} />
                  <Grow>
                    <div className={s.todoTitle}>Подтвердите заявку и необходимые согласия</div>
                    <div className={s.muted}>{missingConsents.map((r) => r.title).join(' · ')}</div>
                  </Grow>
                  <Btn variant='outlineRed' size='l' disabled={!actions.includes('consent.sign')} onClick={() => setConfirmQueue(missingConsents)}>
                    Подтвердить
                  </Btn>
                  <TextLink underline onClick={() => setDialog('consentText')}>
                    Посмотреть текст
                  </TextLink>
                </div>
              )}
              {otherRequired.map((r) => (
                <div key={r.code} className={s.todo}>
                  <IconCircle icon={DocumentMIcon} />
                  <Grow>
                    <div className={s.todoTitle}>{r.title}</div>
                    <div className={s.muted}>{r.note}</div>
                  </Grow>
                  <Btn variant='outlineRed' size='l' disabled={!actions.includes('document.upload')} onClick={() => setUpload(r)}>
                    Добавить
                  </Btn>
                </div>
              ))}
            </Stack>
          ) : (
            <div className={s.done}>
              <CheckmarkCircleMIcon /> Заявка и согласия подтверждены
            </div>
          )}
        </Card>

        <Card title='Документы'>
          <div className={s.docRow}>
            <span className={requiredDocsDone ? s.ok : s.pending}>{requiredDocsDone ? <CheckmarkCircleMIcon /> : <DocumentMIcon />}</span>
            <Grow>
              <div className={s.todoTitle}>{requiredDocsDone ? 'Обязательные документы добавлены' : 'Не хватает обязательных документов'}</div>
              <div className={s.muted}>Из раздела «Документы»</div>
            </Grow>
            <TextLink onClick={() => navigate(`/applications/${app.id}/documents`)}>
              Посмотреть <ChevronRightMIcon className={s.chev} />
            </TextLink>
          </div>
          {docs
            .filter((r) => r.necessity === 'situational' && r.status === 'missing')
            .map((r) => (
              <div key={r.code} className={s.docRow}>
                <span className={s.pending}>
                  <DocumentMIcon />
                </span>
                <Grow>
                  <div className={s.todoTitle}>
                    {r.title} <Pill small>Необязательно сейчас</Pill>
                  </div>
                  <div className={s.muted}>{r.note}</div>
                </Grow>
                <Btn variant='outline' size='l' disabled={!actions.includes('document.upload')} onClick={() => setUpload(r)}>
                  Добавить
                </Btn>
              </div>
            ))}
        </Card>

        {error && <div className={s.error}>{error}</div>}
        {handedOff && <div className={s.done}>Заявка передана: {handedOff}. Сотрудник увидит задачу на главной</div>}
      </Stack>

      <div className={s.bottom} data-sticky-bar>
        <span className={s.hint}>
          <InformationCircleLineMIcon /> {hint}
        </span>
        <div className={s.bottomActions}>
          {actions.includes('application.submit') ? (
            <Btn size='l' disabled={!canSubmit} loading={submit.isPending} onClick={() => submit.mutate()} className={s.send}>
              Отправить в банк
            </Btn>
          ) : actions.includes('application.handoff') ? (
            <Btn size='l' onClick={() => setDialog('handoff')} className={s.send}>
              Передать на отправку
            </Btn>
          ) : (
            <span className={s.muted}>Отправить заявку может сотрудник с правом подачи</span>
          )}
          <TextLink onClick={() => saveExit.mutate()}>Сохранить и выйти</TextLink>
        </div>
      </div>

      {dialog === 'terms' && <TermsDialog app={app} onClose={() => setDialog(null)} onSave={(patch) => schedule(patch)} />}
      {dialog === 'company' && (
        <Dialog open onClose={() => setDialog(null)} title='Компания' size={600}>
          <CompanyStep />
        </Dialog>
      )}
      {dialog === 'finance' && (
        <Dialog open onClose={() => setDialog(null)} title='Финансы' size={600}>
          <FinanceStep amount={amount.value} term={app.requested_term_months} />
        </Dialog>
      )}
      {dialog === 'consentText' && (
        <Dialog open onClose={() => setDialog(null)} title='Текст согласий'>
          <Stack gap={12}>
            <p style={{ margin: 0 }}>
              <b>Согласие на запрос в бюро кредитных историй.</b> Компания разрешает банку получить кредитный отчёт для рассмотрения заявки {app.number}. Согласие входит в заявку и подписывается уполномоченным лицом.
            </p>
            <p style={{ margin: 0 }}>
              <b>Согласие на обработку персональных данных.</b> Подписант разрешает банку обрабатывать свои данные для рассмотрения заявки и заключения договора.
            </p>
          </Stack>
        </Dialog>
      )}
      {dialog === 'handoff' && (
        <MemberPicker
          open
          title='Передать на отправку'
          subtitle={`Заявка ${app.number}`}
          permission='submit_applications'
          excludeUserId={home.id}
          onClose={() => setDialog(null)}
          onSelect={async (m) => {
            await flush().catch(() => undefined);
            await applicationsApi.handoff(app.id, m.id);
            invalidateApplication(app.id);
            setHandedOff(`${m.last_name} ${m.first_name}`);
          }}
        />
      )}
      {confirmQueue[0] && (
        <CodeConfirm
          key={confirmQueue[0].code}
          open
          title={confirmQueue[0].title}
          description='Подтвердите кодом. Мы не отправляем коды по SMS и почте, всё происходит в кабинете'
          requestChallenge={() => applicationsApi.consentChallenge(app.id, confirmQueue[0].code)}
          confirm={(challengeId, code) => applicationsApi.consentConfirm(app.id, confirmQueue[0].code, { challenge_id: challengeId, code })}
          onClose={() => setConfirmQueue([])}
          onDone={() => {
            refreshReqs();
            setConfirmQueue((q) => q.slice(1));
          }}
        />
      )}
      {upload && (
        <UploadDialog
          open
          title={upload.title}
          documentType={upload.action?.document_type ?? undefined}
          applicationId={upload.action?.document_type === 'collateral_docs' ? app.id : undefined}
          onClose={() => setUpload(null)}
          onUploaded={refreshReqs}
        />
      )}
    </div>
  );
}

function CheckRow({ title, text, onClick }: { title: string; text: string; onClick: () => void }) {
  return (
    <button type='button' className={s.checkRow} onClick={onClick}>
      <CheckmarkCircleMIcon className={s.checkIcon} />
      <b className={s.checkTitle}>{title}</b>
      <span className={s.muted} style={{ flex: 1 }}>
        {text}
      </span>
      <span className={s.checkLink}>
        Проверить <ChevronRightMIcon className={s.chev} />
      </span>
    </button>
  );
}

function TermsDialog({
  app,
  onClose,
  onSave,
}: {
  app: ApplicationDetail;
  onClose: () => void;
  onSave: (patch: { amount?: ApplicationDetail['requested_amount']; term_months?: number; form?: { data?: Record<string, unknown> } }) => void;
}) {
  const [amount, setAmount] = useState(formatNumberInput(app.requested_amount.value / 100));
  const [term, setTerm] = useState(String(app.requested_term_months));
  const [purpose, setPurpose] = useState(app.purpose);
  const terms = [6, 12, 18, 24, 36, 48, 60];
  return (
    <Dialog
      open
      onClose={onClose}
      title='Параметры кредита'
      subtitle={PURPOSE_LABELS[app.purpose_code]}
      footer={
        <ModalFooter note='Изменение суммы или срока потребует повторной оценки'>
          <Btn variant='outline' size='l' onClick={onClose}>
            Отмена
          </Btn>
          <Btn
            size='l'
            disabled={!parseNumberInput(amount)}
            onClick={() => {
              onSave({ amount: rubToMoney(parseNumberInput(amount) ?? 0), term_months: Number(term), form: { data: { purpose } } });
              onClose();
            }}
          >
            Сохранить
          </Btn>
        </ModalFooter>
      }
    >
      <Stack gap={14}>
        <Field label='Сумма'>
          <TextField value={amount} onChange={(v) => setAmount(formatNumberInput(parseNumberInput(v)))} suffix='₽' inputMode='numeric' ariaLabel='Сумма' />
        </Field>
        <Field label='Срок'>
          <SelectField value={term} options={terms.map((t) => ({ value: String(t), label: formatMonths(t) }))} onChange={setTerm} ariaLabel='Срок' />
        </Field>
        <Field label='На что пойдут деньги'>
          <TextField value={purpose} onChange={setPurpose} ariaLabel='Цель' />
        </Field>
      </Stack>
    </Dialog>
  );
}

