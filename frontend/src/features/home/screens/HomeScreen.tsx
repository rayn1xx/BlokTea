import { Typography } from '@alfalab/core-components/typography';

import { can } from '@/app/access';
import { ApplicationsTable } from '@/features/applications/components/ApplicationsTable/ApplicationsTable';
import { FeedBlock } from '@/features/home/components/FeedBlock';
import { LoansBlock } from '@/features/home/components/LoansBlock';
import { PreapprovedBanner } from '@/features/home/components/PreapprovedBanner';
import { ProfileBanner } from '@/features/home/components/ProfileBanner';
import { QuickActions } from '@/features/home/components/QuickActions';
import { TasksBlock } from '@/features/home/components/TasksBlock';
import { useCurrentHome } from '@/features/profile/components/AppShell/AppShell';
import { TEXTS } from '@/shared/i18n/ru';
import { Note, Stack, Text, uiStyles as s } from '@/shared/ui';

export function HomeScreen() {
  const home = useCurrentHome();
  const isAccountant = home.home_profile === 'accountant';
  const canSubmit = can(home, 'apply');

  return (
    <Stack gap={28}>
      <div>
        <Typography.Title tag='h1' view='medium' className={s.pageTitle}>
          {greeting()}, {home.first_name}
        </Typography.Title>
        <Text secondary tag='p' className={s.pageSubtitle}>
          {home.company?.short_name}
        </Text>
      </div>

      {home.role === 'owner' && !home.onboarding.completed && <ProfileBanner home={home} />}

      {isAccountant || !canSubmit ? (
        <Note tone='info'>{TEXTS.accountantBanner}</Note>
      ) : (
        <>
          <PreapprovedBanner />
          <QuickActions />
        </>
      )}

      <TasksBlock home={home} />

      <ApplicationsTable readOnly={isAccountant} />

      <LoansBlock readOnly={isAccountant} />

      <FeedBlock />
    </Stack>
  );
}

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return 'Доброй ночи';
  if (h < 12) return 'Доброе утро';
  if (h < 18) return 'Добрый день';
  return 'Добрый вечер';
}
