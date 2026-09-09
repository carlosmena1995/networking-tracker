import 'server-only';
import { createNeonAuth } from '@neondatabase/auth/next/server';
import { serverEnv } from '@/lib/env';

/**
 * Server-side Neon Managed Better Auth instance.
 *
 * This is the only place the app talks to the auth service with server
 * credentials. It reads and writes first-party cookies on our own domain,
 * which is why the browser signs in through /api/auth (proxied by
 * `auth.handler()`) rather than calling the Neon auth host cross-origin.
 */
export const auth = createNeonAuth({
  baseUrl: serverEnv.authBaseUrl,
  cookies: { secret: serverEnv.authCookieSecret },
});

export type SessionUser = {
  id: string;
  email: string;
  name?: string | null;
};

/** Returns the signed-in user, or null. Never throws for "not signed in". */
export async function getSessionUser(): Promise<SessionUser | null> {
  const { data, error } = await auth.getSession();
  if (error || !data?.user) return null;

  const user = data.user as { id: string; email: string; name?: string | null };
  return { id: user.id, email: user.email, name: user.name ?? null };
}
