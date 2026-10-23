import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import { matchingApi } from '@/features/matching/api';
import { StepExtra } from '@/features/matching/steps/StepExtra';
import { StepFinance } from '@/features/matching/steps/StepFinance';
import { StepNeed } from '@/features/matching/steps/StepNeed';
import { StepRecommendation } from '@/features/matching/steps/StepRecommendation';
import { keys } from '@/shared/api/queryKeys';
import { Dialog, ErrorState, SkeletonLines } from '@/shared/ui';

export function MatchingModal() {
  const navigate = useNavigate();
  const { sessionId = '', step = '1' } = useParams();
  const session = useQuery({ queryKey: keys.matching(sessionId), queryFn: () => matchingApi.get(sessionId) });
  const stepNum = Math.min(4, Math.max(1, Number(step))) as 1 | 2 | 3 | 4;
  const close = () => navigate('/home');

  if (!session.data) {
    return (
      <Dialog open onClose={close} title='Подбор кредита'>
        {session.isError ? <ErrorState error={session.error} onRetry={() => session.refetch()} /> : <SkeletonLines lines={5} />}
      </Dialog>
    );
  }

  const props = { session: session.data, onClose: close };
  if (stepNum === 1) return <StepNeed {...props} />;
  if (stepNum === 2) return <StepFinance {...props} />;
  if (stepNum === 3) return <StepExtra {...props} />;
  return <StepRecommendation {...props} />;
}
