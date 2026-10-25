import { describe, expect, it } from 'vitest';

import { thresholdErrors } from './scoring';

const ok = { approve_min: 70, counter_offer_min: 55, manual_review_min: 40, load_threshold_percent: 50, load_target_percent: 40 };

describe('thresholdErrors', () => {
  it('корректные пороги без ошибок', () => {
    expect(thresholdErrors(ok)).toEqual({});
  });

  it('объясняет, какой порог нарушает порядок', () => {
    expect(thresholdErrors({ ...ok, counter_offer_min: 80 })).toEqual({
      counter_offer_min: 'Не выше порога автоодобрения: 70',
    });
    expect(thresholdErrors({ ...ok, manual_review_min: 60 })).toEqual({
      manual_review_min: 'Не выше порога других условий: 55',
    });
  });

  it('проверяет границы и нагрузку', () => {
    expect(thresholdErrors({ ...ok, approve_min: 120, load_threshold_percent: 120, load_target_percent: 0 })).toEqual({
      approve_min: 'Не больше 100 баллов',
      load_threshold_percent: 'Не больше 100%',
      load_target_percent: 'Больше 0%',
    });
    expect(thresholdErrors({ ...ok, load_target_percent: 60 }).load_target_percent).toBe('Не выше порога нагрузки: 50%');
  });
});
