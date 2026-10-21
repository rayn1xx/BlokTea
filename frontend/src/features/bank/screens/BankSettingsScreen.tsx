import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Button } from '@alfalab/core-components/button';

import { bankApi } from '@/features/bank/api';
import type { ScoringThresholds } from '@/features/bank/types';
import { useCurrentHome } from '@/features/profile/components/AppShell/AppShell';
import { errorText, queryClient } from '@/shared/api/query';
import { keys } from '@/shared/api/queryKeys';
import { Card, InfoRow, InfoRows, Note, NumberInput, PageHeader, QueryGate, Stack, uiStyles as s } from '@/shared/ui';

export function BankSettingsScreen() {
  const home = useCurrentHome();
  const settings = useQuery({ queryKey: keys.bankScoring, queryFn: bankApi.scoringSettings });
  const canEdit = home.bank_role === 'bank_admin';
  return (
    <div>
      <PageHeader title='Настройки скоринга' subtitle={canEdit ? 'Пороги кредитного решения' : 'Только просмотр: менять может администратор'} />
      <QueryGate query={settings}>{(t) => <ThresholdsForm value={t} editable={canEdit} />}</QueryGate>
    </div>
  );
}

function ThresholdsForm({ value, editable }: { value: ScoringThresholds; editable: boolean }) {
  const [draft, setDraft] = useState(value);
  const [msg, setMsg] = useState<{ tone: 'positive' | 'negative'; text: string } | null>(null);
  const save = useMutation({
    mutationFn: () => bankApi.putScoringSettings(draft),
    onSuccess: (t) => {
      queryClient.setQueryData(keys.bankScoring, t);
      setMsg({ tone: 'positive', text: 'Сохранено' });
    },
    onError: (e) => setMsg({ tone: 'negative', text: errorText(e) }),
  });

  const fields: { key: keyof ScoringThresholds; label: string; suffix: string }[] = [
    { key: 'approve_min', label: 'Автоодобрение от', suffix: 'баллов' },
    { key: 'counter_offer_min', label: 'Другие условия от', suffix: 'баллов' },
    { key: 'manual_review_min', label: 'Ручное рассмотрение от', suffix: 'баллов' },
    { key: 'load_threshold_percent', label: 'Порог нагрузки', suffix: '%' },
    { key: 'load_target_percent', label: 'Целевая нагрузка', suffix: '%' },
  ];

  return (
    <Card>
      {editable ? (
        <Stack gap={16}>
          <div className={s.grid2}>
            {fields.map((f) => (
              <NumberInput key={f.key} label={f.label} suffix={f.suffix} value={draft[f.key]} onChange={(v) => setDraft({ ...draft, [f.key]: v ?? 0 })} />
            ))}
          </div>
          {msg && <Note tone={msg.tone}>{msg.text}</Note>}
          <div>
            <Button view='primary' size={48} onClick={() => save.mutate()} loading={save.isPending}>
              Сохранить
            </Button>
          </div>
        </Stack>
      ) : (
        <InfoRows>
          {fields.map((f) => (
            <InfoRow key={f.key} label={f.label}>
              {value[f.key]} {f.suffix}
            </InfoRow>
          ))}
        </InfoRows>
      )}
    </Card>
  );
}
