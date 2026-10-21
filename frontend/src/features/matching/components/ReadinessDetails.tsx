import { useReadiness } from '@/features/company/hooks';
import { READINESS_STATUS } from '@/shared/i18n/ru';
import { Row, Stack, Text, ToneLabel } from '@/shared/ui';

export function ReadinessDetails({ amount, term }: { amount: number; term: number }) {
  const readiness = useReadiness(amount * 100, term);
  if (readiness.isLoading) return <Text secondary>Загружаем…</Text>;
  if (!readiness.data) return null;
  return (
    <Stack gap={12} style={{ marginTop: 12 }}>
      {readiness.data.items.map((i) => (
        <div key={i.code}>
          <Row justify='space-between' gap={8}>
            <ToneLabel tone={READINESS_STATUS[i.status].tone} small>
              {i.title}
            </ToneLabel>
            <Text small>{i.value_text}</Text>
          </Row>
          {i.how_to_improve && (
            <Text small secondary tag='div'>
              {i.how_to_improve}
            </Text>
          )}
        </div>
      ))}
    </Stack>
  );
}
