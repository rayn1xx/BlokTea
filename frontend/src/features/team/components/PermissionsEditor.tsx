import { Checkbox } from '@alfalab/core-components/checkbox';

import { PERMISSIONS } from '@/features/team/constants';
import { PERMISSION_LABELS } from '@/shared/i18n/ru';
import type { Permission } from '@/shared/types/common';
import { FieldGroup, FieldLabel, Stack } from '@/shared/ui';

export function PermissionsEditor({ value, onChange }: { value: Permission[]; onChange: (v: Permission[]) => void }) {
  return (
    <FieldGroup label={<FieldLabel tag='situational'>Права</FieldLabel>} hint='По умолчанию права зависят от роли'>
      <Stack gap={10}>
        {PERMISSIONS.map((p) => (
          <Checkbox
            key={p}
            label={PERMISSION_LABELS[p]}
            checked={value.includes(p)}
            onChange={(_, { checked }) => onChange(checked ? [...value, p] : value.filter((x) => x !== p))}
          />
        ))}
      </Stack>
    </FieldGroup>
  );
}
