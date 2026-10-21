import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { CalculatorMIcon } from '@alfalab/icons-glyph/CalculatorMIcon';
import { ChevronRightMIcon } from '@alfalab/icons-glyph/ChevronRightMIcon';
import { ListBulletedMIcon } from '@alfalab/icons-glyph/ListBulletedMIcon';
import { MagicWandMIcon } from '@alfalab/icons-glyph/MagicWandMIcon';

import { matchingApi } from '@/features/matching/api';
import { errorText } from '@/shared/api/query';
import { Stack, Text, uiStyles as s } from '@/shared/ui';

import styles from '../home.module.css';

export function QuickActions() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const start = useMutation({
    mutationFn: matchingApi.create,
    onSuccess: (session) => navigate(`/match/${session.id}/step/1`),
    onError: (e) => setError(errorText(e)),
  });

  const items = [
    {
      icon: MagicWandMIcon,
      title: 'Персональный подбор',
      text: 'Ответьте на 4 шага, и мы предложим кредит под вашу задачу',
      onClick: () => start.mutate(),
      loading: start.isPending,
      accent: true,
    },
    {
      icon: ListBulletedMIcon,
      title: 'Готовые варианты',
      text: 'Каталог кредитов для бизнеса с калькулятором платежа',
      onClick: () => navigate('/products'),
    },
    {
      icon: CalculatorMIcon,
      title: 'Оценить готовность к кредиту',
      text: 'Покажем, что банк увидит в ваших данных и что можно улучшить',
      onClick: () => navigate('/readiness'),
    },
  ];

  return (
    <Stack gap={8}>
      <div className={s.grid3}>
        {items.map(({ icon: Icon, title, text, onClick, loading, accent }) => (
          <button key={title} type='button' className={`${styles.quick} ${accent ? styles.quickAccent : ''}`} onClick={onClick} disabled={loading}>
            <span className={styles.quickIcon}>
              <Icon />
            </span>
            <span className={styles.quickBody}>
              <span className={styles.quickTitle}>{loading ? 'Открываем…' : title}</span>
              <span className={styles.quickText}>{text}</span>
            </span>
            <ChevronRightMIcon className={styles.quickChevron} />
          </button>
        ))}
      </div>
      {error && <Text color='negative'>{error}</Text>}
    </Stack>
  );
}
