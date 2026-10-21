import type { ReactNode } from 'react';
import { Typography } from '@alfalab/core-components/typography';
import { AlfaBankLogoMIcon } from '@alfalab/icons-logotype/AlfaBankLogoMIcon';

import styles from '../auth.module.css';

export function AuthLayout({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <span className={styles.logo} aria-label='Альфа-Банк'>
          <AlfaBankLogoMIcon />
        </span>
      </header>
      <main className={styles.main}>
        <Typography.Title tag='h1' view='xlarge' font='styrene' className={styles.title}>
          {title}
        </Typography.Title>
        <Typography.Text tag='p' view='primary-large' className={styles.subtitle}>
          {subtitle}
        </Typography.Text>
        {children}
      </main>
    </div>
  );
}
