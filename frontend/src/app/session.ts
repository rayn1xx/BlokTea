import type { Home } from '@/features/profile/types';

export function routeAfterLogin(home: Home) {
  if (home.bank_role) return '/bank/queue';
  if (home.role === 'owner' && !home.onboarding.completed) return '/onboarding/company';
  return '/home';
}

export function shortName(home: Pick<Home, 'last_name' | 'first_name' | 'middle_name'>) {
  return `${home.last_name} ${home.first_name[0]}.${home.middle_name ? ` ${home.middle_name[0]}.` : ''}`;
}
