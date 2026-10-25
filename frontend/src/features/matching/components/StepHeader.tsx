import { StepsBar } from '@/shared/ui';

import s from './StepHeader.module.css';

const TITLES = ['Потребность', 'Деньги бизнеса', 'Дополнительные сведения', 'Рекомендация'];

export function StepHeader({ step }: { step: 1 | 2 | 3 | 4 }) {
  return (
    <div className={s.stepHeader}>
      <StepsBar total={4} done={step} />
      <div className={s.stepCaption}>
        Шаг {step} из 4 · <b>{TITLES[step - 1]}</b>
      </div>
    </div>
  );
}
