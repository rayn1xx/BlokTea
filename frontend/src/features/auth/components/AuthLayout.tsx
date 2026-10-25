import type { ReactNode } from 'react';
import { Typography } from '@alfalab/core-components/typography';
import { AlfaBankLogoMIcon } from '@alfalab/icons-logotype/AlfaBankLogoMIcon';

import s from '../auth.module.css';

export function AuthLayout({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className={s.page}>
      <header className={s.header}>
        <span className={s.logo} aria-label='Альфа-Банк'>
          <AlfaBankLogoMIcon />
        </span>
      </header>
      <main className={s.main}>
        <Typography.Title tag='h1' view='xlarge' font='styrene' className={s.title}>
          {title}
        </Typography.Title>
        <Typography.Text tag='p' view='primary-large' className={s.subtitle}>
          {subtitle}
        </Typography.Text>
        {children}
      </main>
    </div>
  );
}
