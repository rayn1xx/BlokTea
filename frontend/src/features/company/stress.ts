export type StressInput = { inflow: number; outflow: number; payments: number };
export type StressScenario = { revenueDrop: number; costChange: number; months: number };

export type StressResult = {
  inflow: number;
  outflow: number;
  freeFlow: number;
  afterPayments: number;
  coverage: number | null;
  reserve: number;
  breakEvenDrop: number;
};

export const STRESS_PRESETS = [0.2, 0.35, 0.5] as const;

export function stressTest({ inflow, outflow, payments }: StressInput, { revenueDrop, costChange, months }: StressScenario): StressResult {
  const nextInflow = Math.round(inflow * (1 - revenueDrop));
  const nextOutflow = Math.round(outflow * (1 + costChange));
  const freeFlow = nextInflow - nextOutflow;
  const afterPayments = freeFlow - payments;
  const breakEven = inflow > 0 ? 1 - (nextOutflow + payments) / inflow : 0;
  return {
    inflow: nextInflow,
    outflow: nextOutflow,
    freeFlow,
    afterPayments,
    coverage: payments > 0 ? freeFlow / payments : null,
    reserve: Math.max(0, -afterPayments) * months,
    breakEvenDrop: Math.max(0, Math.min(1, breakEven)),
  };
}
