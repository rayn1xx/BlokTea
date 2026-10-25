import type { Home } from '@/features/profile/types';
import type { Member } from '@/features/team/types';

export function makeHome(patch: Partial<Home> = {}): Home {
  return {
    id: 'u-owner',
    first_name: 'Анна',
    middle_name: null,
    last_name: 'Смирнова',
    birth_date: null,
    role: 'owner',
    permissions: [],
    home_profile: {} as Home['home_profile'],
    bank_role: null,
    company: null,
    accounts: [],
    onboarding: { completed: true, progress_percent: 100, next_step: null },
    unread_notifications: 0,
    ...patch,
  };
}

export function makeMember(patch: Partial<Member> = {}): Member {
  return {
    id: 'm-1',
    user_id: 'u-1',
    last_name: 'Иванов',
    first_name: 'Иван',
    middle_name: null,
    role: 'cfo_or_accountant',
    permissions: ['upload_documents', 'sign'],
    status: 'active',
    has_alfa_business_access: true,
    login: null,
    created_at: '2026-01-01T00:00:00+03:00',
    ...patch,
  };
}
