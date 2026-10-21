import { useNavigate } from 'react-router-dom';
import { Button } from '@alfalab/core-components/button';

import type { Home } from '@/features/profile/types';
import { Card, Progress, Row, Text } from '@/shared/ui';

export function ProfileBanner({ home }: { home: Home }) {
  const navigate = useNavigate();
  return (
    <Card compact>
      <Row justify='space-between' gap={16}>
        <div style={{ flex: '1 1 280px' }}>
          <Text medium tag='div'>
            Профиль заполнен на {home.onboarding.progress_percent}%
          </Text>
          <Text small secondary tag='div'>
            Проверьте данные компании, и банку не придётся спрашивать их в заявке
          </Text>
          <div style={{ marginTop: 10, maxWidth: 360 }}>
            <Progress value={home.onboarding.progress_percent} tone='attention' />
          </div>
        </div>
        <Button view='secondary' size={40} onClick={() => navigate('/onboarding/company')}>
          Продолжить
        </Button>
      </Row>
    </Card>
  );
}
