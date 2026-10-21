import type { Decision } from '@/features/applications/types';
import type { InfoRequest } from '@/features/info-requests/types';
import { formatDate, formatMoney } from '@/shared/lib/format';
import { InfoRow, InfoRows, Row, Stack, Text, ToneLabel } from '@/shared/ui';

export function ClientPreview({ view }: { view: Decision | InfoRequest }) {
  if ('question' in view) {
    return (
      <Stack gap={10}>
        <ToneLabel tone='attention'>Нужны уточнения</ToneLabel>
        <Text>{view.question || 'Вопрос не заполнен'}</Text>
        {view.due_at && <Text small secondary>Ответить до {formatDate(view.due_at)}</Text>}
        <Text small secondary>
          {view.lk_available ? 'Клиент сможет взять документ из Альфа-Бизнеса' : 'Клиент загрузит файл'}
        </Text>
      </Stack>
    );
  }
  return (
    <Stack gap={10}>
      <ToneLabel tone={view.type === 'approved' ? 'positive' : view.type === 'counter_offer' ? 'attention' : 'negative'}>
        {view.type === 'approved' ? 'Заявка одобрена' : view.type === 'counter_offer' ? 'Предложение банка' : 'Сейчас не можем выдать кредит'}
      </ToneLabel>
      <Text>{view.explanation_text}</Text>
      {view.offered && (
        <InfoRows>
          <InfoRow label='Сумма'>{formatMoney(view.offered.amount)}</InfoRow>
          <InfoRow label='Срок'>{view.offered.term_months} мес.</InfoRow>
          <InfoRow label='Платёж'>{formatMoney(view.offered.monthly_payment)}</InfoRow>
        </InfoRows>
      )}
      {view.improve_tips.length > 0 && (
        <Stack gap={4}>
          {view.improve_tips.map((t) => (
            <Text key={t} small>
              • {t}
            </Text>
          ))}
        </Stack>
      )}
      <Row gap={8}>
        <Text small secondary>
          Без слова «отказано» и без обвинительного тона
        </Text>
      </Row>
    </Stack>
  );
}
