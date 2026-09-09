import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/server';
import { ContactsView } from '@/components/contacts-view';
import { SignOutButton } from '@/components/sign-out-button';

export const dynamic = 'force-dynamic';

export default async function ContactsPage() {
  // Server-side gate. The API and RLS enforce this too - this only spares a
  // signed-out visitor a flash of empty UI.
  const user = await getSessionUser();
  if (!user) redirect('/sign-in');

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-10">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Your contacts</h1>
          <p className="text-muted-foreground mt-1 truncate text-sm">
            Signed in as {user.email}
          </p>
        </div>
        <SignOutButton />
      </header>

      <ContactsView />
    </div>
  );
}
