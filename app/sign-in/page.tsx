import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/server';
import { AuthForm } from '@/components/auth-form';

export const dynamic = 'force-dynamic';

export default async function SignInPage() {
  const user = await getSessionUser();
  if (user) redirect('/contacts');

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 px-4 py-10">
      <div className="text-center">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Networking Tracker</h1>
        <p className="text-muted-foreground mt-2 text-sm text-balance">
          Keep track of the people you want to stay connected with at Berkeley.
        </p>
      </div>
      <AuthForm />
    </main>
  );
}
