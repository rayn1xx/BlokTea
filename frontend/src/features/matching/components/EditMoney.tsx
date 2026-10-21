import { Button } from '@alfalab/core-components/button';

import type { Money } from '@/shared/types/common';
import { MoneyInput, Row, Stack } from '@/shared/ui';

export function EditMoney({
  value,
  onChange,
  onSave,
  onCancel,
  loading,
}: {
  value: Money | null;
  onChange: (v: Money | null) => void;
  onSave: () => void;
  onCancel: () => void;
  loading: boolean;
}) {
  return (
    <Stack gap={8} style={{ width: '100%' }}>
      <MoneyInput label='Сумма в месяц' value={value} onChange={onChange} size={48} />
      <Row gap={8}>
        <Button view='primary' size={32} onClick={onSave} loading={loading}>
          Сохранить
        </Button>
        <Button view='transparent' size={32} onClick={onCancel}>
          Отмена
        </Button>
      </Row>
    </Stack>
  );
}
