import type { Person } from '@/shared/types/common';

export type InfoRequest = {
  id: string;
  created_at: string;
  due_at: string | null;
  question: string;
  purpose_text: string | null;
  requested_document_types: string[];
  lk_available: boolean;
  status: 'open' | 'answered' | 'closed';
  response: {
    comment: string | null;
    document_ids: string[];
    answered_by: Person;
    answered_at: string;
  } | null;
};
