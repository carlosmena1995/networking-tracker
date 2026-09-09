/**
 * Two-account privacy check against the deployed application's own API.
 *
 * This is the companion to scripts/rls-check.mts. That one bypasses the app to
 * prove the database is the real boundary; this one goes through the Next.js
 * route handlers to prove the deployed app behaves correctly too - that User B
 * gets 404, not somebody else's data.
 *
 * Run:  npm run test:privacy
 *       BASE_URL=https://… npm run test:privacy
 */

const BASE_URL = (process.env.BASE_URL ?? 'http://localhost:3000').replace(/\/+$/, '');

const A = {
  label: 'User A',
  email: process.env.PRIVACY_A_EMAIL ?? 'privacy-a@berkeley.edu',
  password: process.env.PRIVACY_A_PASSWORD ?? 'PrivacyTestA2026!',
};
const B = {
  label: 'User B',
  email: process.env.PRIVACY_B_EMAIL ?? 'privacy-b@berkeley.edu',
  password: process.env.PRIVACY_B_PASSWORD ?? 'PrivacyTestB2026!',
};

type Session = { label: string; cookie: string };

/** Only the fields these checks read back. */
type ContactRow = { id: string; name: string; user_id?: string };
type ApiBody = { contact?: ContactRow; contacts?: ContactRow[]; error?: string };

function collectCookies(response: Response, existing = ''): string {
  const jar = new Map<string, string>();
  for (const pair of existing.split('; ').filter(Boolean)) {
    const i = pair.indexOf('=');
    if (i > 0) jar.set(pair.slice(0, i), pair.slice(i + 1));
  }
  for (const raw of response.headers.getSetCookie?.() ?? []) {
    const [pair] = raw.split(';');
    const i = pair.indexOf('=');
    if (i < 0) continue;
    const name = pair.slice(0, i).trim();
    const value = pair.slice(i + 1).trim();
    if (value === '' || /max-age=0/i.test(raw)) jar.delete(name);
    else jar.set(name, value);
  }
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

/** Sign in through the app's own /api/auth proxy, keeping the session cookie. */
async function signIn(user: typeof A): Promise<Session> {
  const headers = { 'Content-Type': 'application/json' };

  await fetch(`${BASE_URL}/api/auth/sign-up/email`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ email: user.email, password: user.password, name: user.label }),
  });

  const response = await fetch(`${BASE_URL}/api/auth/sign-in/email`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ email: user.email, password: user.password }),
  });

  if (!response.ok) {
    throw new Error(`${user.label} could not sign in (HTTP ${response.status})`);
  }

  const cookie = collectCookies(response);
  if (!cookie) throw new Error(`${user.label} received no session cookie.`);
  return { label: user.label, cookie };
}

async function api(session: Session | null, method: string, path: string, body?: unknown) {
  const headers: Record<string, string> = {};
  if (session) headers.Cookie = session.cookie;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
  });
  const text = await response.text();
  let json: ApiBody | null = null;
  try { json = JSON.parse(text) as ApiBody; } catch { /* leave null */ }
  return { status: response.status, body: json, text };
}

let checks = 0;
let failures = 0;
function check(passed: boolean, description: string, detail?: string) {
  checks += 1;
  if (passed) console.log(`  PASS  ${description}`);
  else {
    failures += 1;
    console.log(`  FAIL  ${description}`);
    if (detail) console.log(`        ${detail}`);
  }
}

async function main() {
  console.log('\nTwo-account privacy check, through the deployed app API');
  console.log(`  ${BASE_URL}\n`);

  const alice = await signIn(A);
  const bob = await signIn(B);

  const created = await api(alice, 'POST', '/api/contacts', {
    name: `Alice private ${Date.now()}`,
    company: 'Confidential',
    priority: 'high',
  });
  const contact = created.body?.contact;
  if (!contact?.id) throw new Error(`User A could not create a contact: ${created.text.slice(0, 200)}`);
  console.log(`User A created contact ${contact.id}\n`);

  const bobList = await api(bob, 'GET', '/api/contacts');
  const bobIds = (bobList.body?.contacts ?? []).map((c) => c.id);
  check(!bobIds.includes(contact.id), "User B's list does not contain User A's contact");

  const bobEdit = await api(bob, 'PATCH', `/api/contacts/${contact.id}`, { name: 'HIJACKED' });
  check(bobEdit.status === 404, "User B editing User A's contact returns 404", `got ${bobEdit.status}`);

  const bobSteal = await api(bob, 'PATCH', `/api/contacts/${contact.id}`, {
    name: 'HIJACKED',
    user_id: 'user-b',
  });
  check(bobSteal.status === 404, 'A user_id in the body does not help User B either', `got ${bobSteal.status}`);

  const bobDelete = await api(bob, 'DELETE', `/api/contacts/${contact.id}`);
  check(bobDelete.status === 404, "User B deleting User A's contact returns 404", `got ${bobDelete.status}`);

  const anon = await api(null, 'GET', '/api/contacts');
  check(anon.status === 401, 'A signed-out request returns 401', `got ${anon.status}`);

  const aliceAfter = await api(alice, 'GET', '/api/contacts');
  const stillThere = (aliceAfter.body?.contacts ?? []).find((c) => c.id === contact.id);
  check(Boolean(stillThere), "User A's contact still exists");
  check(stillThere?.name === contact.name, "User A's contact is unchanged", `name is "${stillThere?.name}"`);

  await api(alice, 'DELETE', `/api/contacts/${contact.id}`);

  console.log(`\n${checks - failures}/${checks} checks passed.`);
  if (failures > 0) {
    console.error('APP PRIVACY CHECK FAILED\n');
    process.exit(1);
  }
  console.log('APP PRIVACY CHECK PASSED\n');
}

main().catch((error) => {
  console.error('\nCheck could not complete:', error instanceof Error ? error.message : error);
  process.exit(1);
});
