/**
 * Environment access with loud, specific failures.
 *
 * A missing variable should say which one and where it comes from, not blow up
 * later as an opaque fetch error against `undefined`.
 */

function required(name: string, value: string | undefined): string {
  if (!value || value.trim() === '') {
    throw new Error(
      `Missing environment variable ${name}. Copy .env.example to .env.local and see docs/neon-setup.md.`,
    );
  }
  return value;
}

/** Server-only. Never referenced from a client component. */
export const serverEnv = {
  get authBaseUrl() {
    return required('NEON_AUTH_BASE_URL', process.env.NEON_AUTH_BASE_URL);
  },
  get authCookieSecret() {
    const secret = required('NEON_AUTH_COOKIE_SECRET', process.env.NEON_AUTH_COOKIE_SECRET);
    if (secret.length < 32) {
      throw new Error('NEON_AUTH_COOKIE_SECRET must be at least 32 characters.');
    }
    return secret;
  },
};

/**
 * Public endpoints. These are inlined into the browser bundle, which is fine:
 * they are addresses, not credentials. Row Level Security is what protects the
 * rows behind them.
 *
 * NEXT_PUBLIC_ variables must be read as full literal property accesses so the
 * Next.js compiler can statically replace them.
 */
export const publicEnv = {
  get dataApiUrl() {
    return required('NEXT_PUBLIC_NEON_DATA_API_URL', process.env.NEXT_PUBLIC_NEON_DATA_API_URL);
  },
  get authUrl() {
    return required('NEXT_PUBLIC_NEON_AUTH_URL', process.env.NEXT_PUBLIC_NEON_AUTH_URL);
  },
};
