import { PERMISSION_LABELS, ROLE_LABELS } from '@/shared/i18n/ru';
import type { Permission, UserRole } from '@/shared/types/common';

export const ROLES = Object.keys(ROLE_LABELS) as UserRole[];

export const PERMISSIONS = Object.keys(PERMISSION_LABELS) as Permission[];

export const MEMBER_STATUS = {
  active: { label: 'Активен', tone: 'positive' as const },
  invited: { label: 'Приглашён', tone: 'info' as const },
  pending_approval: { label: 'Ждёт подтверждения', tone: 'attention' as const },
  disabled: { label: 'Отключён', tone: 'neutral' as const },
};
