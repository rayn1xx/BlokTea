import { STATUS } from '@/shared/i18n/ru';
import type { ApplicationStatus } from '@/shared/types/common';
import { ToneLabel } from '@/shared/ui';

export function StatusLabel({ status, small }: { status: ApplicationStatus; small?: boolean }) {
  const meta = STATUS[status];
  return (
    <ToneLabel tone={meta.tone} small={small}>
      {meta.label}
    </ToneLabel>
  );
}
