import { request } from '@/shared/api/client';
import type { LegalForm, ProductCode } from '@/shared/types/common';

import type { PaymentCalcRequest, PaymentCalcResponse, PreapprovedOffer, Product } from './types';

export const productsApi = {
  list: (legalForm?: LegalForm) =>
    request<Product[]>('/products', { query: { legal_form: legalForm } }),
  get: (code: ProductCode) => request<Product>(`/products/${code}`),
  calcPayment: (body: PaymentCalcRequest) =>
    request<PaymentCalcResponse>('/calculator/payment', { method: 'POST', body }),

  preapproved: () => request<PreapprovedOffer | undefined>('/offers/preapproved').then((offer) => offer ?? null),
};
