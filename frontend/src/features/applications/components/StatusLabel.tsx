import { APP_STATUS, STATUS } from '@/shared/i18n/ru';
import type { ApplicationStatus } from '@/shared/types/common';
import { Pill, ToneLabel } from '@/shared/ui';

export function StatusLabel({ status, small }: { status: ApplicationStatus; small?: boolean }) {
  const meta = STATUS[status];
  return (
    <ToneLabel tone={meta.tone} small={small}>
      {meta.label}
    </ToneLabel>
  );
}

export function AppStatusPill({ status, small }: { status: ApplicationStatus; small?: boolean }) {
  const meta = APP_STATUS[status];
  return (
    <Pill tone={meta.pill} small={small}>
      {meta.label}
    </Pill>
  );
}
