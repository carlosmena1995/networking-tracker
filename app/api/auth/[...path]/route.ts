import { auth } from '@/lib/auth/server';

/**
 * First-party auth endpoint.
 *
 * Everything under /api/auth/* is proxied to Neon Managed Better Auth by the
 * SDK. Running it on our own origin is what makes the session cookie
 * first-party, so route handlers can read it with auth.getSession().
 */
export const { GET, POST } = auth.handler();
