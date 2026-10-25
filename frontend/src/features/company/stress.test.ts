import { describe, expect, it } from 'vitest';

import { stressTest } from './stress';

const base = { inflow: 1_000_000, outflow: 700_000, payments: 150_000 };

describe('stressTest', () => {
  it('без падения выручки показывает текущий запас', () => {
    const r = stressTest(base, { revenueDrop: 0, costChange: 0, months: 6 });
    expect(r.freeFlow).toBe(300_000);
    expect(r.afterPayments).toBe(150_000);
    expect(r.coverage).toBe(2);
    expect(r.reserve).toBe(0);
  });

  it('при падении выручки на 35% считает дефицит и подушку на нужное число месяцев', () => {
    const r = stressTest(base, { revenueDrop: 0.35, costChange: 0, months: 6 });
    expect(r.inflow).toBe(650_000);
    expect(r.afterPayments).toBe(-200_000);
    expect(r.reserve).toBe(1_200_000);
  });

  it('рост расходов тоже съедает запас', () => {
    const r = stressTest(base, { revenueDrop: 0.2, costChange: 0.1, months: 3 });
    expect(r.outflow).toBe(770_000);
    expect(r.afterPayments).toBe(-120_000);
    expect(r.reserve).toBe(360_000);
  });

  it('находит, при каком падении выручки платежи перестают покрываться', () => {
    expect(stressTest(base, { revenueDrop: 0, costChange: 0, months: 6 }).breakEvenDrop).toBeCloseTo(0.15);
    expect(stressTest({ ...base, outflow: 1_200_000 }, { revenueDrop: 0, costChange: 0, months: 6 }).breakEvenDrop).toBe(0);
  });

  it('без кредитов покрытие не считается', () => {
    expect(stressTest({ ...base, payments: 0 }, { revenueDrop: 0.2, costChange: 0, months: 6 }).coverage).toBeNull();
  });
});
