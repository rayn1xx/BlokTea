import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@alfalab/core-components/button';
import { Typography } from '@alfalab/core-components/typography';
import { CheckmarkCircleMIcon } from '@alfalab/icons-glyph/CheckmarkCircleMIcon';
import { DocumentLinesMIcon } from '@alfalab/icons-glyph/DocumentLinesMIcon';

import { useApplication } from '@/features/applications/hooks';
import { useLoans } from '@/features/loans/hooks';
import { useCurrentHome } from '@/features/profile/components/AppShell/AppShell';
import { signingApi } from '@/features/signing/api';
import { useSigning } from '@/features/signing/hooks';
import type { SigningState } from '@/features/signing/types';
import { requestFile } from '@/shared/api/client';
import { errorText, invalidateApplication, queryClient } from '@/shared/api/query';
import { keys } from '@/shared/api/queryKeys';
import { ROLE_SHORT, SIGNER_STATUS, SIGNING_DOCUMENT_LABELS } from '@/shared/i18n/ru';
import { formatDateTime } from '@/shared/lib/format';
import { Card, CardTitle, CodeConfirm, Dialog, Note, PageHeader, Progress, QueryGate, Row, SmallTag, Stack, Text, ToneLabel, uiStyles as s } from '@/shared/ui';

import styles from '../signing.module.css';

export function SigningScreen() {
  const { id = '' } = useParams();
  const signing = useSigning(id);
  const app = useApplication(id, true);
  return (
    <QueryGate query={signing}>
      {(data) => <SigningView applicationId={id} state={data} number={app.data?.number} actions={app.data?.available_actions ?? []} status={app.data?.status} />}
    </QueryGate>
  );
}

function SigningView({
  applicationId,
  state,
  number,
  actions,
  status,
}: {
  applicationId: string;
  state: SigningState;
  number?: string;
  actions: string[];
  status?: string;
}) {
  const navigate = useNavigate();
  const home = useCurrentHome();
  const loans = useLoans();
  const [signOpen, setSignOpen] = useState(false);
  const [preview, setPreview] = useState<{ title: string; text: string } | null>(null);
  const [reminded, setReminded] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const loan = loans.data?.find((l) => l.application_id === applicationId);

  useEffect(() => {
    if (status === 'issued') void queryClient.invalidateQueries({ queryKey: keys.loans });
  }, [status]);

  const remind = useMutation({
    mutationFn: (userId: string) => signingApi.remind(applicationId, userId),
    onSuccess: (_, userId) => setReminded((r) => [...r, userId]),
    onError: (e) => setError(errorText(e)),
  });

  const openDoc = async (doc: SigningState['documents'][number]) => {
    try {
      const blob = await requestFile(doc.url.replace('/api/v1', ''));
      setPreview({ title: doc.title, text: await blob.text() });
    } catch (e) {
      setError(errorText(e));
    }
  };

  const done = state.signed_count === state.required_count;
  const mySigner = state.signers.find((x) => x.person.user_id === home.id);

  return (
    <div>
      <PageHeader
        title='Подписание документов'
        subtitle={number ? `Заявка ${number}` : undefined}
        right={
          <Button view='transparent' size={40} onClick={() => navigate('/team')}>
            Правила подписи
          </Button>
        }
      />

      <Stack gap={16}>
        <Card>
          <Row justify='space-between' gap={16}>
            <Typography.Title tag='h2' view='small' weight='bold'>
              Подписано {state.signed_count} из {state.required_count}
            </Typography.Title>
            {done && <ToneLabel tone='positive'>Все подписали</ToneLabel>}
          </Row>
          <div style={{ marginTop: 12 }}>
            <Progress value={(state.signed_count / Math.max(1, state.required_count)) * 100} />
          </div>
        </Card>

        {done && status === 'issued' && (
          <Note
            tone='positive'
            title='Кредит выдан'
            action={
              loan ? (
                <Button view='primary' size={40} onClick={() => navigate(`/loans/${loan.id}`)}>
                  Кредит и график
                </Button>
              ) : undefined
            }
          >
            Деньги зачислены на расчётный счёт (смоделировано)
          </Note>
        )}

        <div className={s.mainAside}>
          <Card>
            <CardTitle>Подписанты</CardTitle>
            <ul className={styles.signers}>
              {state.signers.map((signer) => {
                const meta = SIGNER_STATUS[signer.status];
                const isMe = signer.person.user_id === home.id;
                return (
                  <li key={`${signer.order}-${signer.person.user_id}`} className={styles.signer}>
                    <span className={s.avatar}>{signer.status === 'signed' ? <CheckmarkCircleMIcon style={{ color: 'var(--color-light-graphic-positive, #0cc44d)' }} /> : signer.order}</span>
                    <div className={s.grow}>
                      <Row gap={8}>
                        <Text medium>{signer.person.name}</Text>
                        {isMe && <SmallTag tone='info'>вы</SmallTag>}
                      </Row>
                      <Text small secondary tag='div'>
                        {SIGNING_DOCUMENT_LABELS[signer.document]} · {ROLE_SHORT[signer.person.role]}
                        {signer.signed_at ? ` · ${formatDateTime(signer.signed_at)}` : ''}
                      </Text>
                    </div>
                    <ToneLabel tone={meta.tone} small>
                      {meta.label}
                    </ToneLabel>
                    {signer.status !== 'signed' && !isMe && actions.includes('signing.remind') && (
                      <Button view='transparent' size={32} onClick={() => remind.mutate(signer.person.user_id)} disabled={reminded.includes(signer.person.user_id)}>
                        {reminded.includes(signer.person.user_id) ? 'Напомнили' : 'Напомнить'}
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          </Card>

          <Stack gap={16}>
            <Card>
              <CardTitle>Документы</CardTitle>
              <Stack gap={8}>
                {state.documents.map((d) => (
                  <button key={d.id} type='button' className={styles.doc} onClick={() => openDoc(d)}>
                    <DocumentLinesMIcon />
                    <span className={s.grow}>
                      <Text medium tag='div'>
                        {d.title}
                      </Text>
                      <Text small secondary tag='div'>
                        Открыть договор
                      </Text>
                    </span>
                  </button>
                ))}
              </Stack>
            </Card>

            <Card>
              {state.can_current_user_sign ? (
                <Stack gap={12}>
                  <Text>
                    Ваш документ: <b>{SIGNING_DOCUMENT_LABELS[state.current_user_document!]}</b>
                  </Text>
                  <Button view='primary' size={56} block onClick={() => setSignOpen(true)}>
                    Подписать
                  </Button>
                  <Text small secondary>
                    Подпись подтверждается кодом прямо в кабинете
                  </Text>
                </Stack>
              ) : mySigner?.status === 'signed' ? (
                <Note tone='positive'>{done ? 'Вы подписали. Все документы подписаны' : 'Вы подписали. Ждём остальных подписантов'}</Note>
              ) : (
                <Note tone='info'>
                  Режим просмотра: вы не подписант по правилам компании.{' '}
                  {state.signers.filter((x) => x.status !== 'signed').map((x) => `Подписывает: ${x.person.name}`).join('. ')}
                </Note>
              )}
            </Card>
          </Stack>
        </div>

        {error && <Note tone='negative'>{error}</Note>}
      </Stack>

      <CodeConfirm
        open={signOpen}
        title={state.current_user_document ? SIGNING_DOCUMENT_LABELS[state.current_user_document] : 'Подпись'}
        description='Введите код, чтобы подписать документ электронной подписью (смоделировано)'
        submitLabel='Подписать'
        requestChallenge={() => signingApi.challenge(applicationId)}
        confirm={(challengeId, code) => signingApi.confirm(applicationId, { challenge_id: challengeId, code })}
        onClose={() => setSignOpen(false)}
        onDone={() => {
          setSignOpen(false);
          invalidateApplication(applicationId);
          void queryClient.invalidateQueries({ queryKey: keys.signing(applicationId) });
        }}
      />

      <Dialog open={!!preview} onClose={() => setPreview(null)} title={preview?.title ?? ''} size={800}>
        <pre className={s.preview}>{preview?.text}</pre>
      </Dialog>
    </div>
  );
}
