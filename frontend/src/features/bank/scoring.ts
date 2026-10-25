import type { ScoringThresholds } from './types';

export type ThresholdErrors = Partial<Record<keyof ScoringThresholds, string>>;

export function thresholdErrors(t: ScoringThresholds): ThresholdErrors {
  const e: ThresholdErrors = {};
  if (t.approve_min > 100) e.approve_min = 'Не больше 100 баллов';
  if (t.counter_offer_min > t.approve_min) e.counter_offer_min = `Не выше порога автоодобрения: ${t.approve_min}`;
  if (t.manual_review_min < 0) e.manual_review_min = 'Не меньше 0 баллов';
  else if (t.manual_review_min > t.counter_offer_min) e.manual_review_min = `Не выше порога других условий: ${t.counter_offer_min}`;
  if (t.load_threshold_percent > 100) e.load_threshold_percent = 'Не больше 100%';
  if (t.load_target_percent <= 0) e.load_target_percent = 'Больше 0%';
  else if (t.load_target_percent > t.load_threshold_percent) e.load_target_percent = `Не выше порога нагрузки: ${t.load_threshold_percent}%`;
  return e;
}
