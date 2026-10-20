// Заявка на кредит — GET /api/v1/applications (контракт: docs/api/applications.md в корне репозитория)

export type ApplicationStatus =
  | 'draft' // черновик, клиент ещё не отправил
  | 'submitted' // отправлена, ждёт приёма в работу
  | 'in_review' // проверка данных, обогащение (БКИ, ЕГРЮЛ), скоринг
  | 'info_requested' // банку нужны уточнения от клиента
  | 'approved' // одобрена на запрошенных условиях
  | 'counter_offer' // одобрена на иных условиях (сумма/срок/продукт)
  | 'rejected' // отказ
  | 'signing' // клиент принял предложение, подписание документов
  | 'issued' // кредит выдан
  | 'cancelled'; // клиент отозвал заявку

export type ProductCode =
  | 'working_capital'
  | 'investment'
  | 'overdraft'
  | 'credit_line'
  | 'express';

export interface Money {
  value: number; // в минимальных единицах валюты (копейках), целое число
  currency: string; // ISO 4217, например RUB
}

export interface ApplicationProduct {
  code: ProductCode;
  name: string;
}

export interface ApplicationSummary {
  id: string; // uuid
  number: string; // человекочитаемый номер, например КЗ-2026-000123
  product: ApplicationProduct;
  purpose: string;
  requested_amount: Money;
  requested_term_months: number;
  approved_amount: Money | null; // есть после решения: approved, counter_offer, signing, issued
  approved_term_months: number | null;
  status: ApplicationStatus;
  required_action: string | null; // что нужно сделать клиенту, если от него что-то ждут
  created_at: string; // datetime
  updated_at: string; // datetime
}

export type ApplicationSortField = 'created_at' | 'updated_at' | 'requested_amount';

// "-" перед полем — сортировка по убыванию
export type ApplicationSort = ApplicationSortField | `-${ApplicationSortField}`;

export interface ApplicationListParams {
  status?: ApplicationStatus[];
  page?: number; // с 1
  page_size?: number;
  sort?: ApplicationSort;
}

export interface ApplicationListResponse {
  items: ApplicationSummary[];
  page: number;
  page_size: number;
  total: number;
}
