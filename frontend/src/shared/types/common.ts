export type ErrorCode =
  | 'BAD_REQUEST'
  | 'UNAUTHORIZED'
  | 'NO_COMPANY_ROLE'
  | 'FORBIDDEN_ACTION'
  | 'NOT_FOUND'
  | 'INVALID_TRANSITION'
  | 'VERSION_CONFLICT'
  | 'OFFER_EXPIRED'
  | 'VALIDATION_ERROR'
  | 'REQUIREMENTS_NOT_MET'
  | 'INVALID_CODE'
  | 'INVITE_NOT_FOUND'
  | 'INVITE_EXPIRED';

export type ApiErrorBody = {
  error: { code: ErrorCode; message: string; details: Record<string, unknown> };
};

export type Money = { value: number; currency: 'RUB' };

export type Paginated<T> = { items: T[]; page: number; page_size: number; total: number };

export type DataSource = 'registry' | 'alfa_lk' | 'bki' | 'fns' | 'multibank' | 'client' | 'system';

export type Sourced<T> = { value: T; source: DataSource; as_of: string | null; editable: boolean };

export type UserRole =
  | 'owner'
  | 'director'
  | 'cfo_or_accountant'
  | 'financing_employee'
  | 'banking_employee'
  | 'authorized_employee';

export type BankRole = 'underwriter' | 'bank_admin';

export type HomeProfile = 'entrepreneur' | 'accountant';

export type LegalForm = 'IP' | 'OOO';

export type Permission =
  | 'submit_applications'
  | 'upload_documents'
  | 'sign'
  | 'accept_offers'
  | 'manage_team';

export type ProductCode =
  | 'working_capital'
  | 'investment'
  | 'overdraft'
  | 'credit_line'
  | 'express'
  | 'any_purpose'
  | 'gov_program';

export type PurposeCode =
  | 'equipment'
  | 'repair'
  | 'current_expenses'
  | 'working_capital'
  | 'real_estate'
  | 'gov_contract'
  | 'other';

export type NeedType = 'one_time' | 'recurring';

export type Disbursement = 'lump_sum' | 'tranches';

export type Urgency = 'asap' | 'week' | 'not_urgent';

export type CollateralType = 'none' | 'real_estate' | 'vehicle_equipment' | 'purchased_asset';

export type Preference = 'lower_payment' | 'lower_overpayment' | 'flexibility';

export type ApplicationStatus =
  | 'draft'
  | 'submitted'
  | 'in_review'
  | 'info_requested'
  | 'approved'
  | 'counter_offer'
  | 'rejected'
  | 'signing'
  | 'issued'
  | 'cancelled';

export type AvailableAction =
  | 'application.edit'
  | 'application.submit'
  | 'application.handoff'
  | 'application.cancel'
  | 'consent.sign'
  | 'document.upload'
  | 'document.delete'
  | 'info_request.respond'
  | 'task.reassign'
  | 'offer.accept'
  | 'offer.decline'
  | 'signing.send'
  | 'signing.sign'
  | 'signing.remind'
  | 'company.confirm_registry'
  | 'company.edit_details'
  | 'team.invite'
  | 'team.edit'
  | 'team.approve'
  | 'signing_rules.edit'
  | 'bank.take'
  | 'bank.decide'
  | 'bank.request_info'
  | 'bank.settings_edit';

export type TextSource = 'llm' | 'template';

export type FitLevel = 'high' | 'medium' | 'low';

export type Person = { user_id: string; name: string; role: UserRole };

export type TaxRegime = 'osn' | 'usn_income' | 'usn_income_expense' | 'patent' | 'ausn';

export type ReadinessStatus = 'ok' | 'warning' | 'fail' | 'unknown';

export type DocumentStatus = 'uploaded' | 'analyzing' | 'accepted' | 'rejected' | 'expiring';

export type SignerStatus = 'waiting' | 'pending' | 'signed' | 'declined';

export type SigningDocumentType = 'contract' | 'surety' | 'deal_approval';

export type Challenge = { challenge_id: string; demo_code?: string; expires_at: string };
