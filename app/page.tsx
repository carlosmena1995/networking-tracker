import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/server';

export const dynamic = 'force-dynamic';

/** Send people where they belong: the list if signed in, otherwise sign-in. */
export default async function Home() {
  const user = await getSessionUser();
  redirect(user ? '/contacts' : '/sign-in');
}
