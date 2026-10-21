import { STEPS } from '@/features/matching/lib';

import styles from '../matching.module.css';

export function Stepper({ current }: { current: number }) {
  return (
    <ol className={styles.stepper} aria-label='Шаги подбора'>
      {STEPS.map((title, i) => {
        const n = i + 1;
        return (
          <li key={title} className={`${styles.step} ${n < current ? styles.stepDone : ''} ${n === current ? styles.stepCurrent : ''}`} aria-current={n === current ? 'step' : undefined}>
            <span className={styles.stepNum}>{n}</span>
            <span className={styles.stepTitle}>{title}</span>
          </li>
        );
      })}
    </ol>
  );
}
