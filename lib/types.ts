import type { Priority } from '@/lib/validation';

/** Row shape shared by the API and the client components. */
export type Contact = {
  id: string;
  user_id: string;
  name: string;
  company: string | null;
  role: string | null;
  met_at: string | null;
  notes: string | null;
  priority: Priority;
  created_at: string;
  updated_at: string;
};

export type ContactFormValues = {
  name: string;
  company: string;
  role: string;
  met_at: string;
  notes: string;
  priority: Priority;
};

export const EMPTY_FORM: ContactFormValues = {
  name: '',
  company: '',
  role: '',
  met_at: '',
  notes: '',
  priority: 'medium',
};
