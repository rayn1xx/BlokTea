import type { AvailableAction, Person } from '@/shared/types/common';

export type TaskType =
  | 'info_request'
  | 'sign'
  | 'accept_offer'
  | 'send_application'
  | 'approve_member'
  | 'consent';

export type Task = {
  id: string;
  type: TaskType;
  title: string;
  application: { id: string; number: string } | null;
  assignee: Person | null;
  waiting_for_text: string | null;
  due_at: string | null;
  cta: { label: string; route: string };
  available_actions: AvailableAction[];
  created_at: string;
};

export type TaskScope = 'mine' | 'waiting_others' | 'all';
