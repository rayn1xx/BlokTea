import type { LegalForm, Permission, SigningDocumentType, UserRole } from '@/shared/types/common';

export type MemberStatus = 'active' | 'invited' | 'pending_approval' | 'disabled';

export type Member = {
  id: string;
  user_id: string | null;
  last_name: string;
  first_name: string;
  middle_name: string | null;
  role: UserRole;
  permissions: Permission[];
  status: MemberStatus;
  has_alfa_business_access: boolean;
  login: string | null;
  created_at: string;
};

export type InviteRequest = {
  last_name: string;
  first_name: string;
  middle_name?: string;
  role: UserRole;
  login_email: string;
  permissions?: Permission[];
};

export type InviteResponse = { member: Member; invite_code: string; expires_at: string };

export type MemberPatch = { role?: UserRole; permissions?: Permission[] };

export type SigningRules = {
  legal_form: LegalForm;
  can_send_to_signing: UserRole[];
  signers: {
    order: number;
    document: SigningDocumentType;
    user_id: string | null;
    role: UserRole | null;
    required: boolean;
  }[];
  version: number;
};
