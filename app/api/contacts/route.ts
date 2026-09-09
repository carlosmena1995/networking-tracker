import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/server';
import { validateCreateContact } from '@/lib/validation';
import { createContact, listContacts, ContactsError } from '@/lib/contacts-repo';
import type { Priority } from '@/lib/validation';
import type { SortField, SortDirection } from '@/lib/contacts-repo';
import { errorResponse, unauthorized, readJson } from '@/lib/api-response';

// Always evaluated per request: the response depends on the caller's session.
export const dynamic = 'force-dynamic';

const SORT_FIELDS: SortField[] = ['name', 'company', 'priority', 'created_at'];
const PRIORITY_FILTERS = ['high', 'medium', 'low', 'all'] as const;

/** GET /api/contacts - the signed-in user's contacts, sorted and filtered. */
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const params = new URL(request.url).searchParams;

  // Ignore anything unexpected rather than trusting query input.
  const sortParam = params.get('sort');
  const sort = SORT_FIELDS.includes(sortParam as SortField)
    ? (sortParam as SortField)
    : 'created_at';

  const direction: SortDirection = params.get('direction') === 'asc' ? 'asc' : 'desc';

  const priorityParam = params.get('priority');
  const priority = PRIORITY_FILTERS.includes(priorityParam as (typeof PRIORITY_FILTERS)[number])
    ? (priorityParam as Priority | 'all')
    : 'all';

  try {
    const contacts = await listContacts({
      sort,
      direction,
      priority,
      search: params.get('search') ?? undefined,
    });
    return NextResponse.json({ contacts });
  } catch (error) {
    if (error instanceof ContactsError) return errorResponse(error.message, error.status);
    throw error;
  }
}

/** POST /api/contacts - create a contact for the signed-in user. */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const body = await readJson(request);
  const result = validateCreateContact(body);
  if (!result.success) return errorResponse(result.message, 400, result.fieldErrors);

  try {
    const contact = await createContact(result.data);
    return NextResponse.json({ contact }, { status: 201 });
  } catch (error) {
    if (error instanceof ContactsError) return errorResponse(error.message, error.status);
    throw error;
  }
}
