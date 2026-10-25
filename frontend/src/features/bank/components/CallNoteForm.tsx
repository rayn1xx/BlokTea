import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Input } from '@alfalab/core-components/input';
import { Textarea } from '@alfalab/core-components/textarea';

import { bankApi } from '@/features/bank/api';
import type { BankApplicationDetail } from '@/features/bank/types';
import { errorText, fieldErrors, queryClient } from '@/shared/api/query';
import { keys } from '@/shared/api/queryKeys';
import { Btn, DateField, FieldTag, Grid, Note, NumberInput, Stack } from '@/shared/ui';

const EMPTY = { topic: '', summary: '', agreements: '', nextStep: '', due: '', minutes: null as number | null };

export function CallNoteForm({ app, onDone }: { app: BankApplicationDetail; onDone: () => void }) {
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (patch: Partial<typeof EMPTY>) => setForm({ ...form, ...patch });

  const save = useMutation({
    mutationFn: () =>
      bankApi.addCall(app.id, {
        topic: form.topic,
        summary: form.summary,
        agreements: form.agreements.split('\n'),
        next_step: form.nextStep || undefined,
        next_step_due: form.due || undefined,
        duration_minutes: form.minutes ?? undefined,
      }),
    onSuccess: (detail) => {
      queryClient.setQueryData(keys.bankApplication(app.id), detail);
      setForm(EMPTY);
      onDone();
    },
    onError: (e) => {
      const fe = fieldErrors(e);
      setErrors(Object.keys(fe).length ? fe : { form: errorText(e) });
    },
  });

  const submit = () => {
    const next: Record<string, string> = {};
    if (!form.topic.trim()) next.topic = 'Укажите тему звонка';
    if (!form.summary.trim()) next.summary = 'Опишите, о чём договорились';
    setErrors(next);
    if (!Object.keys(next).length) save.mutate();
  };

  return (
    <Stack gap={14}>
      <Input label='Тема звонка' size={56} block value={form.topic} onChange={(_, { value }) => set({ topic: value })} error={errors.topic} rightAddons={<FieldTag kind='required' />} />
      <Textarea label='Главное из разговора' block minRows={3} value={form.summary} onChange={(e) => set({ summary: e.target.value })} error={errors.summary} rightAddons={<FieldTag kind='required' />} />
      <Textarea label='Договорённости, по одной на строку' block minRows={2} value={form.agreements} onChange={(e) => set({ agreements: e.target.value })} />
      <Grid>
        <Input label='Следующий шаг клиента' size={56} block value={form.nextStep} onChange={(_, { value }) => set({ nextStep: value })} />
        <DateField label='Сделать до' value={form.due} onChange={(due) => set({ due })} size={56} error={errors.next_step_due} />
      </Grid>
      <NumberInput label='Длительность' suffix='мин' value={form.minutes} onChange={(minutes) => set({ minutes })} error={errors.duration_minutes} />
      {errors.form && <Note tone='negative'>{errors.form}</Note>}
      <div>
        <Btn size='l' onClick={submit} loading={save.isPending}>
          Сохранить итоги звонка
        </Btn>
      </div>
    </Stack>
  );
}
