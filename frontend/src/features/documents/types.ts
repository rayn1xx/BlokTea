import type { DocumentStatus, LegalForm, Person, ProductCode, TextSource } from '@/shared/types/common';

export type DocumentType = {
  code: string;
  title: string;
  legal_forms: LegalForm[];
  required_for_products: ProductCode[];
  scope: 'company' | 'application';
  accepted_formats: string[];
  max_size_mb: number;
  max_age_days: number | null;
  can_generate_from_lk: boolean;
};

export type DocumentAnalysis = {
  status: 'pending' | 'done' | 'failed' | 'unavailable';
  detected_type: string | null;
  detected_type_confidence: number | null;
  extracted_fields: { key: string; label: string; value: string; confidence: number }[];
  checks: {
    code: 'inn_match' | 'period_valid' | 'not_expired' | 'type_match' | 'signature_present';
    passed: boolean | null;
    text: string;
  }[];
  issues: { severity: 'info' | 'warning' | 'error'; text: string }[];
  model: string | null;
  text_source: TextSource;
  analyzed_at: string | null;
};

export type DocumentRef = {
  id: string;
  document_type: string;
  title: string;
  scope: 'company' | 'application';
  application_id: string | null;
  info_request_id: string | null;
  file_name: string;
  size_bytes: number;
  version: number;
  uploaded_by: Person;
  uploaded_at: string;
  origin: 'upload' | 'alfa_lk';
  status: DocumentStatus;
  status_reason: string | null;
  expires_at: string | null;
  analysis: DocumentAnalysis | null;
};

export type FromLkRequest = {
  kind: 'bank_statement' | 'tax_data' | 'fin_turnover';
  period_from: string;
  period_to: string;
  info_request_id?: string;
};

export type MissingDocument = {
  document_type: string;
  title: string;
  reason: string;
  application_id: string | null;
};
