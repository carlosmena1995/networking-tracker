import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/server';
import { validateUpdateContact } from '@/lib/validation';
import { updateContact, deleteContact, ContactsError } from '@/lib/contacts-repo';
import { errorResponse, unauthorized, readJson } from '@/lib/api-response';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** PATCH /api/contacts/:id - edit a contact you own. */
export async function PATCH(request: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { id } = await params;
  if (!UUID.test(id)) return errorResponse('Contact not found.', 404);

  const body = await readJson(request);
  const result = validateUpdateContact(body);
  if (!result.success) return errorResponse(result.message, 400, result.fieldErrors);

  try {
    const contact = await updateContact(id, result.data);
    return NextResponse.json({ contact });
  } catch (error) {
    if (error instanceof ContactsError) return errorResponse(error.message, error.status);
    throw error;
  }
}

/** DELETE /api/contacts/:id - delete a contact you own. */
export async function DELETE(_request: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { id } = await params;
  if (!UUID.test(id)) return errorResponse('Contact not found.', 404);

  try {
    await deleteContact(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof ContactsError) return errorResponse(error.message, error.status);
    throw error;
  }
}
