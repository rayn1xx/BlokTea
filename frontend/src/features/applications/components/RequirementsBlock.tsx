import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Button } from '@alfalab/core-components/button';
import { CheckmarkCircleMIcon } from '@alfalab/icons-glyph/CheckmarkCircleMIcon';

import { applicationsApi } from '@/features/applications/api';
import { useRequirements } from '@/features/applications/hooks';
import type { ApplicationDetail, Requirement, RequirementCode } from '@/features/applications/types';
import { documentsApi } from '@/features/documents/api';
import { UploadDialog } from '@/features/documents/components/UploadDialog';
import { queryClient } from '@/shared/api/query';
import { keys } from '@/shared/api/queryKeys';
import { formatDate } from '@/shared/lib/format';
import { Card, CardTitle, CodeConfirm, cx, Dialog, FieldTag, Row, SkeletonLines, SmallTag, SourceTag, Stack, Text, uiStyles as s } from '@/shared/ui';

import styles from '../edit.module.css';

export function RequirementsBlock({ app, missing, onDone }: { app: ApplicationDetail; missing: RequirementCode[]; onDone: () => void }) {
  const requirements = useRequirements(app.id);
  const [signing, setSigning] = useState<Requirement | null>(null);
  const [uploading, setUploading] = useState<Requirement | null>(null);
  const [picking, setPicking] = useState<Requirement | null>(null);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: keys.requirements(app.id) });
    void queryClient.invalidateQueries({ queryKey: keys.application(app.id) });
    onDone();
  };

  return (
    <Card>
      <CardTitle>Что нужно для отправки</CardTitle>
      {requirements.isLoading || !requirements.data ? (
        <SkeletonLines lines={4} />
      ) : (
        <ul className={styles.reqs}>
          {requirements.data.items.map((r) => (
            <li key={r.code} className={cx(styles.req, missing.includes(r.code) && styles.reqMissing)}>
              <span className={cx(styles.reqMark, r.status === 'done' && styles.reqDone, r.status === 'not_needed' && styles.reqNotNeeded)}>
                {r.status === 'done' ? <CheckmarkCircleMIcon /> : null}
              </span>
              <div className={s.grow}>
                <Row gap={8}>
                  <Text medium>{r.title}</Text>
                  <FieldTag kind={r.necessity === 'required' ? 'required' : 'situational'} />
                  <SourceTag source={r.source} />
                </Row>
                {r.note && (
                  <Text small secondary tag='div'>
                    {r.note}
                  </Text>
                )}
              </div>
              {r.status === 'missing' && r.action && r.action.type !== 'none' && (
                <Button
                  view={r.necessity === 'required' ? 'primary' : 'secondary'}
                  size={32}
                  disabled={(r.action.type === 'sign' && !app.available_actions.includes('consent.sign')) || (r.action.type !== 'sign' && !app.available_actions.includes('document.upload'))}
                  onClick={() => (r.action!.type === 'sign' ? setSigning(r) : r.action!.type === 'upload' ? setUploading(r) : setPicking(r))}
                >
                  {r.action.type === 'sign' ? 'Подписать' : r.action.type === 'upload' ? 'Загрузить' : 'Выбрать'}
                </Button>
              )}
              {r.status === 'done' && <SmallTag tone='positive'>готово</SmallTag>}
              {r.status === 'not_needed' && <SmallTag>не нужно</SmallTag>}
            </li>
          ))}
        </ul>
      )}

      <CodeConfirm
        open={!!signing}
        title={signing?.title ?? ''}
        description='Подпишите согласие кодом. Согласие на запрос кредитного отчёта входит в заявку и подписывается уполномоченным лицом'
        submitLabel='Подписать'
        requestChallenge={() => applicationsApi.consentChallenge(app.id, signing!.code)}
        confirm={(challengeId, code) => applicationsApi.consentConfirm(app.id, signing!.code, { challenge_id: challengeId, code })}
        onClose={() => setSigning(null)}
        onDone={() => {
          setSigning(null);
          refresh();
        }}
      />
      {uploading && (
        <UploadDialog
          open
          title={uploading.title}
          documentType={uploading.action?.document_type ?? undefined}
          applicationId={uploading.action?.document_type === 'collateral_docs' ? app.id : undefined}
          onClose={() => setUploading(null)}
          onUploaded={refresh}
        />
      )}
      {picking && <PickDocumentDialog app={app} requirement={picking} onClose={() => setPicking(null)} onPicked={refresh} />}
    </Card>
  );
}

function PickDocumentDialog({ app, requirement, onClose, onPicked }: { app: ApplicationDetail; requirement: Requirement; onClose: () => void; onPicked: () => void }) {
  const docs = useQuery({ queryKey: keys.documents({ scope: 'company' }), queryFn: () => documentsApi.list({ scope: 'company' }) });
  const list = (docs.data ?? []).filter((d) => !requirement.action?.document_type || d.document_type === requirement.action.document_type);
  const pick = useMutation({
    mutationFn: (docId: string) =>
      applicationsApi.patch(app.id, { version: app.version, form: { data: { [`picked_${requirement.code}`]: docId } } }),
    onSuccess: () => {
      onPicked();
      onClose();
    },
  });
  return (
    <Dialog open onClose={onClose} title={requirement.title} subtitle='Выберите из документов компании'>
      {docs.isLoading ? (
        <SkeletonLines />
      ) : list.length === 0 ? (
        <Text secondary>Подходящих документов нет. Загрузите новый в разделе «Документы»</Text>
      ) : (
        <Stack gap={8}>
          {list.map((d) => (
            <div key={d.id} className={s.personRow}>
              <div className={s.grow}>
                <Text medium tag='div'>
                  {d.title}
                </Text>
                <Text small secondary tag='div'>
                  {d.file_name} · {formatDate(d.uploaded_at)}
                </Text>
              </div>
              <Button view='secondary' size={32} onClick={() => pick.mutate(d.id)} loading={pick.isPending}>
                Выбрать
              </Button>
            </div>
          ))}
        </Stack>
      )}
    </Dialog>
  );
}
