import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';

import { bankApi } from '@/features/bank/api';
import { thresholdErrors, type ThresholdErrors } from '@/features/bank/scoring';
import type { ScoringThresholds } from '@/features/bank/types';
import { useCurrentHome } from '@/features/profile/components/AppShell/AppShell';
import { errorText, fieldErrors, queryClient } from '@/shared/api/query';
import { keys } from '@/shared/api/queryKeys';
import { Btn, Card, Grid, InfoRow, InfoRows, Note, NumberInput, PageHead, QueryGate, Stack } from '@/shared/ui';

const FIELDS: { key: keyof ScoringThresholds; label: string; suffix: string }[] = [
  { key: 'approve_min', label: 'Автоодобрение от', suffix: 'баллов' },
  { key: 'counter_offer_min', label: 'Другие условия от', suffix: 'баллов' },
  { key: 'manual_review_min', label: 'Ручное рассмотрение от', suffix: 'баллов' },
  { key: 'load_threshold_percent', label: 'Порог нагрузки', suffix: '%' },
  { key: 'load_target_percent', label: 'Целевая нагрузка', suffix: '%' },
];

export function BankSettingsScreen() {
  const home = useCurrentHome();
  const settings = useQuery({ queryKey: keys.bankScoring, queryFn: bankApi.scoringSettings });
  const canEdit = home.bank_role === 'bank_admin';
  return (
    <div>
      <PageHead title='Настройки скоринга' subtitle={canEdit ? 'Пороги кредитного решения' : 'Только просмотр: менять может администратор'} />
      <QueryGate query={settings}>{(t) => <ThresholdsForm value={t} editable={canEdit} />}</QueryGate>
    </div>
  );
}

function ThresholdsForm({ value, editable }: { value: ScoringThresholds; editable: boolean }) {
  const [draft, setDraft] = useState(value);
  const [errors, setErrors] = useState<ThresholdErrors>({});
  const [msg, setMsg] = useState<{ tone: 'positive' | 'negative'; text: string } | null>(null);
  const save = useMutation({
    mutationFn: () => bankApi.putScoringSettings(draft),
    onSuccess: (t) => {
      queryClient.setQueryData(keys.bankScoring, t);
      setMsg({ tone: 'positive', text: 'Сохранено' });
    },
    onError: (e) => {
      const fe = fieldErrors(e);
      setErrors(fe);
      setMsg({ tone: 'negative', text: Object.keys(fe).length ? 'Пороги не сохранены: исправьте поля, отмеченные красным' : errorText(e) });
    },
  });

  const submit = () => {
    const next = thresholdErrors(draft);
    setErrors(next);
    if (Object.keys(next).length) {
      setMsg({ tone: 'negative', text: 'Пороги не сохранены: исправьте поля, отмеченные красным' });
      return;
    }
    setMsg(null);
    save.mutate();
  };

  if (!editable) {
    return (
      <Card>
        <InfoRows>
          {FIELDS.map((f) => (
            <InfoRow key={f.key} label={f.label}>
              {value[f.key]} {f.suffix}
            </InfoRow>
          ))}
        </InfoRows>
      </Card>
    );
  }

  return (
    <Card>
      <Stack gap={16}>
        <Grid>
          {FIELDS.map((f) => (
            <NumberInput
              key={f.key}
              label={f.label}
              suffix={f.suffix}
              value={draft[f.key]}
              error={errors[f.key]}
              onChange={(v) => {
                setDraft({ ...draft, [f.key]: v ?? 0 });
                setErrors({ ...errors, [f.key]: undefined });
              }}
            />
          ))}
        </Grid>
        {msg && <Note tone={msg.tone}>{msg.text}</Note>}
        <div>
          <Btn size='l' onClick={submit} loading={save.isPending}>
            Сохранить
          </Btn>
        </div>
      </Stack>
    </Card>
  );
}
