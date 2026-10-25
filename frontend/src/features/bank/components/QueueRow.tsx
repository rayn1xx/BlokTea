import { StatusLabel } from '@/features/applications/components/StatusLabel';
import type { BankQueueItem } from '@/features/bank/types';
import { formatMinutes, formatMoney } from '@/shared/lib/format';
import { Btn, SmallTag, Text, ToneLabel } from '@/shared/ui';

export function QueueRow({ item, onOpen, onTake, taking }: { item: BankQueueItem; onOpen: () => void; onTake: () => void; taking: boolean }) {
  const riskTone = item.risk_level === 'low' ? 'positive' : item.risk_level === 'medium' ? 'attention' : 'negative';
  return (
    <tr onClick={onOpen}>
      <td>
        <Text small medium tag='div'>
          {item.number}
        </Text>
        <StatusLabel status={item.status} small />
      </td>
      <td>
        <Text small medium tag='div'>
          {item.company.short_name}
        </Text>
        <Text small secondary tag='div'>
          {item.company.legal_form === 'IP' ? 'ИП' : 'ООО'}, ИНН {item.company.inn}
        </Text>
      </td>
      <td>
        <Text small tag='div'>
          {item.product.name}
        </Text>
        <Text small medium tag='div'>
          {formatMoney(item.requested_amount)} на {item.requested_term_months} мес.
        </Text>
      </td>
      <td data-align='right'>
        {item.score !== null && (
          <ToneLabel tone={riskTone} small>
            {item.score}
          </ToneLabel>
        )}
      </td>
      <td>
        <ToneLabel tone={item.checks_status === 'ok' ? 'positive' : item.checks_status === 'warning' ? 'attention' : 'negative'} small>
          {item.checks_status === 'ok' ? 'в норме' : item.checks_status === 'warning' ? 'внимание' : 'стоп'}
        </ToneLabel>
        {item.checks_hint && (
          <Text small secondary tag='div'>
            {item.checks_hint}
          </Text>
        )}
      </td>
      <td>
        <Text small>{formatMinutes(item.in_queue_minutes)}</Text>
      </td>
      <td>
        <Text small>{item.assignee?.name ?? 'не назначен'}</Text>
      </td>
      <td onClick={(e) => e.stopPropagation()}>
        {item.auto_decided ? (
          <SmallTag>авторешение</SmallTag>
        ) : !item.assignee ? (
          <Btn size='s' onClick={onTake} loading={taking}>
            Взять в работу
          </Btn>
        ) : (
          <Btn variant='outline' size='s' onClick={onOpen}>
            Открыть
          </Btn>
        )}
      </td>
    </tr>
  );
}
