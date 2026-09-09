'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';

type Mode = 'sign-in' | 'sign-up';

export function AuthForm() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const isSignUp = mode === 'sign-up';

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (isSignUp && password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    setPending(true);
    try {
      const result = isSignUp
        ? await authClient.signUp.email({ email, password, name: name.trim() || email })
        : await authClient.signIn.email({ email, password });

      if (result.error) {
        setError(result.error.message ?? 'Could not sign you in. Check your details and try again.');
        return;
      }

      // refresh() re-runs the server components so they see the new session
      // cookie; push() alone would render the signed-out tree.
      router.push('/contacts');
      router.refresh();
    } catch {
      setError('Something went wrong reaching the auth service. Please try again.');
    } finally {
      setPending(false);
    }
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>{isSignUp ? 'Create an account' : 'Sign in'}</CardTitle>
        <CardDescription>
          {isSignUp
            ? 'Your contacts are private to your account.'
            : 'Welcome back. Enter your details to continue.'}
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          {isSignUp && (
            <div className="grid gap-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
              />
            </div>
          )}

          <div className="grid gap-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@berkeley.edu"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              required
              autoComplete={isSignUp ? 'new-password' : 'current-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={isSignUp ? 'At least 8 characters' : undefined}
            />
          </div>

          {error && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Button type="submit" disabled={pending} className="w-full">
            {pending ? 'Working…' : isSignUp ? 'Create account' : 'Sign in'}
          </Button>

          <Button
            type="button"
            variant="ghost"
            className="w-full"
            onClick={() => {
              setMode(isSignUp ? 'sign-in' : 'sign-up');
              setError(null);
            }}
          >
            {isSignUp ? 'Already have an account? Sign in' : 'Need an account? Sign up'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
