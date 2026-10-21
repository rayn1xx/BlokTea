import type { ReactNode } from 'react';

import { Row, Text } from '@/shared/ui';

import styles from '../matching.module.css';

export function Footer({ left, right, saved }: { left?: ReactNode; right?: ReactNode; saved?: string }) {
  return (
    <div className={styles.footer}>
      <Row gap={12}>{left}</Row>
      {saved && (
        <Text small secondary>
          {saved}
        </Text>
      )}
      <Row gap={12}>{right}</Row>
    </div>
  );
}
