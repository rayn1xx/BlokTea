import { HomeScreen } from '@/features/home/screens/HomeScreen';
import { MatchingModal } from '@/features/matching/components/MatchingModal';

export function MatchingScreen() {
  return <HomeScreen overlay={<MatchingModal />} />;
}
