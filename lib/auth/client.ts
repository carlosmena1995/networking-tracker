'use client';

import { createAuthClient } from '@neondatabase/auth/next';

/**
 * Browser auth client.
 *
 * It takes no URL on purpose: in the Next.js build it targets the same-origin
 * /api/auth route, which `auth.handler()` proxies to Neon. Same-origin means
 * the session cookie is first-party, so the server can read it in route
 * handlers - the whole reason auth is proxied instead of called directly.
 */
export const authClient = createAuthClient();
