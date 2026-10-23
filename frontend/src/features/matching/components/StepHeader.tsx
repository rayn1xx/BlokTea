import { StepsBar } from '@/shared/ui';

import m from '../matching.module.css';

const TITLES = ['Потребность', 'Деньги бизнеса', 'Дополнительные сведения', 'Рекомендация'];

export function StepHeader({ step }: { step: 1 | 2 | 3 | 4 }) {
  return (
    <div className={m.stepHeader}>
      <StepsBar total={4} done={step} />
      <div className={m.stepCaption}>
        Шаг {step} из 4 · <b>{TITLES[step - 1]}</b>
      </div>
    </div>
  );
}
