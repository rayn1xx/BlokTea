import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeftMIcon } from '@alfalab/icons-glyph/ArrowLeftMIcon';

import s from './PageHead.module.css';

export function PageHead({
  back,
  title,
  badge,
  subtitle,
  right,
}: {
  back?: { label: string; to: string };
  title: ReactNode;
  badge?: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
}) {
  const navigate = useNavigate();
  return (
    <div>
      {back && (
        <button type='button' className={s.back} onClick={() => navigate(back.to)}>
          <ArrowLeftMIcon />
          {back.label}
        </button>
      )}
      <div className={s.head}>
        <div className={s.text}>
          <h1 className={s.title}>
            {title}
            {badge}
          </h1>
          {subtitle && <p className={s.subtitle}>{subtitle}</p>}
        </div>
        {right}
      </div>
    </div>
  );
}
