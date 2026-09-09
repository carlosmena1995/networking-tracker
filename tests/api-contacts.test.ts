import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Route-handler tests.
 *
 * The auth layer and the database layer are mocked so these tests cover what
 * the handler itself is responsible for: rejecting anonymous callers, rejecting
 * invalid bodies before any write is attempted, and never letting a caller
 * choose the owner of a row.
 */

const getSessionUser = vi.fn();
const createContact = vi.fn();
const listContacts = vi.fn();
const updateContact = vi.fn();
const deleteContact = vi.fn();

class ContactsError extends Error {
  status: number;
  constructor(message: string, status = 500) {
    super(message);
    this.status = status;
  }
}

vi.mock('@/lib/auth/server', () => ({
  getSessionUser: () => getSessionUser(),
  auth: {},
}));

vi.mock('@/lib/contacts-repo', () => ({
  createContact: (...args: unknown[]) => createContact(...args),
  listContacts: (...args: unknown[]) => listContacts(...args),
  updateContact: (...args: unknown[]) => updateContact(...args),
  deleteContact: (...args: unknown[]) => deleteContact(...args),
  ContactsError,
}));

const { GET, POST } = await import('@/app/api/contacts/route');
const { PATCH, DELETE } = await import('@/app/api/contacts/[id]/route');

const SIGNED_IN = { id: 'user-a', email: 'a@example.com', name: 'A' };
const ID = '11111111-2222-4333-8444-555555555555';

function post(body: unknown) {
  return new Request('http://localhost/api/contacts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function patch(body: unknown) {
  return new Request(`http://localhost/api/contacts/${ID}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const params = (id = ID) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.clearAllMocks();
  getSessionUser.mockResolvedValue(SIGNED_IN);
});

describe('authentication', () => {
  beforeEach(() => getSessionUser.mockResolvedValue(null));

  it('GET returns 401 when signed out', async () => {
    const response = await GET(new Request('http://localhost/api/contacts'));
    expect(response.status).toBe(401);
    expect(listContacts).not.toHaveBeenCalled();
  });

  it('POST returns 401 when signed out and never touches the database', async () => {
    const response = await POST(post({ name: 'Dana', priority: 'high' }));
    expect(response.status).toBe(401);
    expect(createContact).not.toHaveBeenCalled();
  });

  it('PATCH returns 401 when signed out', async () => {
    const response = await PATCH(patch({ name: 'Dana' }), params());
    expect(response.status).toBe(401);
    expect(updateContact).not.toHaveBeenCalled();
  });

  it('DELETE returns 401 when signed out', async () => {
    const response = await DELETE(new Request('http://localhost'), params());
    expect(response.status).toBe(401);
    expect(deleteContact).not.toHaveBeenCalled();
  });
});

describe('POST /api/contacts validation', () => {
  it('rejects an empty name with 400 and a field error', async () => {
    const response = await POST(post({ name: '', priority: 'high' }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe('Name is required.');
    expect(body.fieldErrors.name).toBe('Name is required.');
    // The important half: nothing was written.
    expect(createContact).not.toHaveBeenCalled();
  });

  it('rejects an invalid priority with 400', async () => {
    const response = await POST(post({ name: 'Dana', priority: 'urgent' }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.fieldErrors.priority).toContain('high, medium, low');
    expect(createContact).not.toHaveBeenCalled();
  });

  it('rejects a malformed JSON body without throwing', async () => {
    const request = new Request('http://localhost/api/contacts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{ not json',
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
    expect(createContact).not.toHaveBeenCalled();
  });

  it('creates a valid contact and returns 201', async () => {
    createContact.mockResolvedValue({ id: ID, name: 'Dana', priority: 'high' });
    const response = await POST(post({ name: 'Dana', priority: 'high' }));

    expect(response.status).toBe(201);
    expect(createContact).toHaveBeenCalledTimes(1);
  });

  it('never forwards a caller-supplied user_id to the database', async () => {
    createContact.mockResolvedValue({ id: ID, name: 'Dana', priority: 'high' });
    await POST(post({ name: 'Dana', priority: 'high', user_id: 'user-b' }));

    const forwarded = createContact.mock.calls[0][0] as Record<string, unknown>;
    expect(forwarded).not.toHaveProperty('user_id');
  });
});

describe('PATCH /api/contacts/:id', () => {
  it('rejects an empty update with 400', async () => {
    const response = await PATCH(patch({}), params());
    expect(response.status).toBe(400);
    expect(updateContact).not.toHaveBeenCalled();
  });

  it('rejects an invalid priority with 400', async () => {
    const response = await PATCH(patch({ priority: 'urgent' }), params());
    expect(response.status).toBe(400);
    expect(updateContact).not.toHaveBeenCalled();
  });

  it('never forwards a caller-supplied user_id on update', async () => {
    updateContact.mockResolvedValue({ id: ID, name: 'Dana', priority: 'low' });
    await PATCH(patch({ name: 'Dana', user_id: 'user-b' }), params());

    const forwarded = updateContact.mock.calls[0][1] as Record<string, unknown>;
    expect(forwarded).not.toHaveProperty('user_id');
  });

  it('returns 404 for a non-UUID id without querying the database', async () => {
    const response = await PATCH(patch({ name: 'Dana' }), params('not-a-uuid'));
    expect(response.status).toBe(404);
    expect(updateContact).not.toHaveBeenCalled();
  });

  it("surfaces the repository's 404 when RLS hides another user's row", async () => {
    // This is what User A editing User B's contact looks like from here: RLS
    // matches no rows, so the row simply does not exist for this caller.
    updateContact.mockRejectedValue(new ContactsError('Contact not found.', 404));
    const response = await PATCH(patch({ name: 'Dana' }), params());
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe('Contact not found.');
  });
});

describe('DELETE /api/contacts/:id', () => {
  it('deletes and returns ok', async () => {
    deleteContact.mockResolvedValue(undefined);
    const response = await DELETE(new Request('http://localhost'), params());
    expect(response.status).toBe(200);
    expect(deleteContact).toHaveBeenCalledWith(ID);
  });

  it("returns 404 when the row is not the caller's", async () => {
    deleteContact.mockRejectedValue(new ContactsError('Contact not found.', 404));
    const response = await DELETE(new Request('http://localhost'), params());
    expect(response.status).toBe(404);
  });
});
