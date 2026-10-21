import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import { matchingApi } from '@/features/matching/api';
import { Stepper } from '@/features/matching/components/Stepper';
import { StepExtra } from '@/features/matching/steps/StepExtra';
import { StepFinance } from '@/features/matching/steps/StepFinance';
import { StepNeed } from '@/features/matching/steps/StepNeed';
import { StepRecommendation } from '@/features/matching/steps/StepRecommendation';
import { keys } from '@/shared/api/queryKeys';
import { PageHeader, QueryGate } from '@/shared/ui';

export function MatchingScreen() {
  const { sessionId = '', step = '1' } = useParams();
  const session = useQuery({ queryKey: keys.matching(sessionId), queryFn: () => matchingApi.get(sessionId) });
  const stepNum = Math.min(4, Math.max(1, Number(step))) as 1 | 2 | 3 | 4;

  return (
    <div>
      <PageHeader title='Персональный подбор' subtitle='Ответьте на несколько вопросов, а данные компании мы подставим сами' />
      <Stepper current={stepNum} />
      <QueryGate query={session}>
        {(data) => (
          <>
            {stepNum === 1 && <StepNeed session={data} />}
            {stepNum === 2 && <StepFinance session={data} />}
            {stepNum === 3 && <StepExtra session={data} />}
            {stepNum === 4 && <StepRecommendation session={data} />}
          </>
        )}
      </QueryGate>
    </div>
  );
}
