import { NextResponse } from 'next/server';
import type { FieldErrors } from '@/lib/validation';

/** One error shape for the whole API, so the client can render it uniformly. */
export type ApiError = {
  error: string;
  fieldErrors?: FieldErrors;
};

export function errorResponse(message: string, status: number, fieldErrors?: FieldErrors) {
  const body: ApiError = fieldErrors ? { error: message, fieldErrors } : { error: message };
  return NextResponse.json(body, { status });
}

export const unauthorized = () => errorResponse('You must be signed in to do that.', 401);

/** Parse a JSON body without letting malformed input throw a 500. */
export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
