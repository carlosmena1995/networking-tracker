'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth/client';
import { Button } from '@/components/ui/button';

export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        try {
          await authClient.signOut();
          router.push('/sign-in');
          router.refresh();
        } finally {
          setPending(false);
        }
      }}
    >
      {pending ? 'Signing out…' : 'Sign out'}
    </Button>
  );
}
