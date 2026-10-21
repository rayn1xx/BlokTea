import type { PaymentScheduleRow } from '@/features/products/types';
import type { Money, ProductCode } from '@/shared/types/common';

export type Loan = {
  id: string;
  application_id: string | null;
  product: { code: ProductCode; name: string };
  amount: Money;
  balance: Money;
  rate_percent: number;
  term_months: number;
  next_payment: { date: string; amount: Money } | null;
  overpayment_total: Money;
  issued_to_account: string;
  schedule: PaymentScheduleRow[];
  source: 'alfa_lk' | 'system';
};
