import type { Home } from '@/features/profile/types';
import { ROLE_LABELS } from '@/shared/i18n/ru';
import type { Permission, UserRole } from '@/shared/types/common';

export type Capability =
  | 'apply'
  | 'upload_documents'
  | 'accept_offers'
  | 'sign'
  | 'manage_team'
  | 'bank';

export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  owner: ['submit_applications', 'upload_documents', 'sign', 'accept_offers', 'manage_team'],
  director: ['submit_applications', 'upload_documents', 'sign', 'accept_offers'],
  cfo_or_accountant: ['upload_documents', 'sign'],
  financing_employee: ['submit_applications', 'upload_documents'],
  banking_employee: ['submit_applications', 'upload_documents'],
  authorized_employee: ['upload_documents'],
};

const CAPABILITY_PERMISSION: Record<Exclude<Capability, 'bank'>, Permission> = {
  apply: 'submit_applications',
  upload_documents: 'upload_documents',
  accept_offers: 'accept_offers',
  sign: 'sign',
  manage_team: 'manage_team',
};

function permissionsOf(home: Home): Permission[] {
  if (!home.role) return [];
  return home.permissions.length ? home.permissions : ROLE_PERMISSIONS[home.role];
}

export function can(home: Home | undefined, capability: Capability): boolean {
  if (!home) return false;
  if (capability === 'bank') return !!home.bank_role;
  if (home.bank_role || !home.role) return false;
  return permissionsOf(home).includes(CAPABILITY_PERMISSION[capability]);
}

export function rolesWith(capability: Exclude<Capability, 'bank'>): UserRole[] {
  const permission = CAPABILITY_PERMISSION[capability];
  return (Object.keys(ROLE_PERMISSIONS) as UserRole[]).filter((r) => ROLE_PERMISSIONS[r].includes(permission));
}

export function whoCan(capability: Exclude<Capability, 'bank'>) {
  return rolesWith(capability)
    .map((r) => ROLE_LABELS[r].toLowerCase())
    .join(', ');
}

export const CAPABILITY_TEXT: Record<Capability, string> = {
  apply: 'Подбор и подача заявок',
  upload_documents: 'Загрузка документов',
  accept_offers: 'Решение по предложению банка',
  sign: 'Подписание',
  manage_team: 'Управление командой',
  bank: 'Кабинет сотрудника банка',
};
