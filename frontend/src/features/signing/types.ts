import type { Person, SignerStatus, SigningDocumentType } from '@/shared/types/common';

export type SigningState = {
  documents: { id: string; title: string; type: SigningDocumentType; url: string }[];
  signers: {
    order: number;
    person: Person;
    document: SigningDocumentType;
    status: SignerStatus;
    signed_at: string | null;
  }[];
  signed_count: number;
  required_count: number;
  can_current_user_sign: boolean;
  current_user_document: SigningDocumentType | null;
};
