import 'server-only';
import { createClient } from '@neondatabase/neon-js';
import { auth } from '@/lib/auth/server';
import { publicEnv } from '@/lib/env';
import type { CreateContactInput, UpdateContactInput, Priority } from '@/lib/validation';
import type { Contact } from '@/lib/types';

// The row shape lives in lib/types.ts so client components can import it
// without pulling in this server-only module.
export type { Contact };

/** Columns the client is allowed to read back. */
const COLUMNS = 'id,user_id,name,company,role,met_at,notes,priority,created_at,updated_at';

/**
 * Data API client for use inside route handlers.
 *
 * This is the "external auth provider" form of createClient: we already have a
 * session on the server, so instead of giving the client an auth URL we hand it
 * a `getToken` function. Neon calls it before every request and sends the JWT
 * to Postgres, where auth.user_id() reads the `sub` claim and RLS filters rows.
 *
 * The token is the user's own - the server holds no privileged database
 * credential, so a bug here cannot leak another user's rows.
 */
function dataClient() {
  return createClient({
    dataApi: {
      url: publicEnv.dataApiUrl,
      getToken: async () => {
        const { data, error } = await auth.token();
        if (error || !data) return null;
        // The endpoint returns { token }; tolerate a bare string too.
        if (typeof data === 'string') return data;
        const token = (data as { token?: string; accessToken?: string }).token
          ?? (data as { accessToken?: string }).accessToken;
        return token ?? null;
      },
    },
  });
}

export class ContactsError extends Error {
  status: number;
  constructor(message: string, status = 500) {
    super(message);
    this.status = status;
  }
}

/**
 * Turn a Data API / Postgres error into something a user can act on.
 * Constraint names come from db/schema.sql.
 */
function toContactsError(error: { message?: string; code?: string; details?: string } | null): ContactsError {
  const raw = `${error?.message ?? ''} ${error?.details ?? ''}`.toLowerCase();

  if (raw.includes('contacts_priority_check') || raw.includes('priority')) {
    return new ContactsError('Priority must be one of: high, medium, low.', 400);
  }
  if (raw.includes('contacts_name_check') || raw.includes('name')) {
    return new ContactsError('Name is required.', 400);
  }
  if (error?.code === '42501' || raw.includes('permission denied') || raw.includes('row-level security')) {
    return new ContactsError('You do not have access to that contact.', 403);
  }
  return new ContactsError(error?.message || 'The database rejected that request.', 500);
}

export type SortField = 'name' | 'company' | 'priority' | 'created_at';
export type SortDirection = 'asc' | 'desc';

export type ListOptions = {
  sort?: SortField;
  direction?: SortDirection;
  priority?: Priority | 'all';
  search?: string;
};

/**
 * List the signed-in user's contacts.
 *
 * Note there is no `.eq('user_id', ...)` filter anywhere: RLS already limits
 * the result to rows this JWT owns. Filtering here as well would imply the
 * security depends on us remembering to - it does not.
 */
export async function listContacts(options: ListOptions = {}): Promise<Contact[]> {
  const { sort = 'created_at', direction = 'desc', priority = 'all', search } = options;

  let query = dataClient().from('contacts').select(COLUMNS);

  if (priority !== 'all') query = query.eq('priority', priority);

  if (search && search.trim() !== '') {
    // Escape PostgREST's `or` delimiters so a search string cannot alter the filter.
    const term = search.trim().replace(/[(),*]/g, ' ').trim();
    if (term !== '') {
      query = query.or(
        `name.ilike.*${term}*,company.ilike.*${term}*,role.ilike.*${term}*,met_at.ilike.*${term}*`,
      );
    }
  }

  // Priority is stored as text, so alphabetical order would read high, low,
  // medium. Sort it by meaning instead, in the database.
  if (sort === 'priority') {
    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) throw toContactsError(error);
    const rank: Record<Priority, number> = { high: 0, medium: 1, low: 2 };
    const rows = (data ?? []) as Contact[];
    return [...rows].sort((a, b) =>
      direction === 'asc' ? rank[a.priority] - rank[b.priority] : rank[b.priority] - rank[a.priority],
    );
  }

  const { data, error } = await query.order(sort, {
    ascending: direction === 'asc',
    nullsFirst: false,
  });
  if (error) throw toContactsError(error);
  return (data ?? []) as Contact[];
}

export async function createContact(input: CreateContactInput): Promise<Contact> {
  // user_id is intentionally absent: the column default (auth.user_id()) sets
  // it, and the column-level GRANT means we could not set it even if we tried.
  const { data, error } = await dataClient()
    .from('contacts')
    .insert(input)
    .select(COLUMNS)
    .single();

  if (error) throw toContactsError(error);
  return data as Contact;
}

export async function updateContact(id: string, input: UpdateContactInput): Promise<Contact> {
  const { data, error } = await dataClient()
    .from('contacts')
    .update(input)
    .eq('id', id)
    .select(COLUMNS)
    .single();

  if (error) throw toContactsError(error);
  // RLS turns "someone else's row" into "no rows", which is a 404 to this user:
  // we must not reveal that the id exists.
  if (!data) throw new ContactsError('Contact not found.', 404);
  return data as Contact;
}

export async function deleteContact(id: string): Promise<void> {
  const { data, error } = await dataClient()
    .from('contacts')
    .delete()
    .eq('id', id)
    .select('id');

  if (error) throw toContactsError(error);
  if (!data || (data as unknown[]).length === 0) {
    throw new ContactsError('Contact not found.', 404);
  }
}
