import { describe, expect, it } from 'vitest';

import { businessAge } from './business';

describe('businessAge', () => {
  const now = new Date('2026-10-25T12:00:00');

  it('считает годы и месяцы', () => {
    expect(businessAge('2023-08-10', now)).toBe('3 года 2 месяца');
  });

  it('не засчитывает неполный месяц', () => {
    expect(businessAge('2026-09-30', now)).toBe('меньше месяца');
  });

  it('ровно год без месяцев', () => {
    expect(businessAge('2025-10-25', now)).toBe('1 год');
  });
});
