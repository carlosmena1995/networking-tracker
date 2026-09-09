import { z } from 'zod';

/**
 * Validation rules for a contact.
 *
 * These mirror the CHECK constraints in `db/schema.sql` on purpose. The
 * database is the rule that cannot be bypassed; this module exists so the API
 * can reject bad input early and return a readable, per-field error instead of
 * a raw Postgres constraint violation.
 *
 * If you change a rule here, change it in db/schema.sql too.
 */

export const PRIORITIES = ['high', 'medium', 'low'] as const;
export type Priority = (typeof PRIORITIES)[number];

/** Trim, then treat an empty string as "not provided". */
const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} must be ${max} characters or fewer.`)
    .transform((value) => (value === '' ? null : value))
    .nullish()
    .transform((value) => value ?? null);

const name = z
  .string({ error: 'Name is required.' })
  .trim()
  .min(1, 'Name is required.')
  .max(200, 'Name must be 200 characters or fewer.');

const priority = z.enum(PRIORITIES, {
  error: `Priority must be one of: ${PRIORITIES.join(', ')}.`,
});

/**
 * Shape accepted when creating a contact.
 *
 * Unknown keys are stripped rather than rejected - this is what stops a caller
 * from smuggling `user_id` or `id` into an insert. Ownership is set by the
 * `default auth.user_id()` on the column, never by the request body.
 */
export const createContactSchema = z.object({
  name,
  company: optionalText(200, 'Company'),
  role: optionalText(200, 'Role'),
  met_at: optionalText(200, 'Where you met'),
  notes: optionalText(2000, 'Notes'),
  priority,
});

/** Same rules, but every field optional; at least one must be present. */
export const updateContactSchema = createContactSchema
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    error: 'Provide at least one field to update.',
  });

export type CreateContactInput = z.infer<typeof createContactSchema>;
export type UpdateContactInput = z.infer<typeof updateContactSchema>;

export type FieldErrors = Record<string, string>;

export type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; message: string; fieldErrors: FieldErrors };

/** Collapse a ZodError into one message per field, plus a summary line. */
function toFieldErrors(error: z.ZodError): { message: string; fieldErrors: FieldErrors } {
  const fieldErrors: FieldErrors = {};

  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? String(issue.path[0]) : '_';
    // Keep the first error per field - that is the one worth showing.
    if (!(key in fieldErrors)) fieldErrors[key] = issue.message;
  }

  const message = Object.values(fieldErrors)[0] ?? 'Invalid input.';
  return { message, fieldErrors };
}

export function validateCreateContact(input: unknown): ValidationResult<CreateContactInput> {
  const parsed = createContactSchema.safeParse(input);
  if (parsed.success) return { success: true, data: parsed.data };
  return { success: false, ...toFieldErrors(parsed.error) };
}

export function validateUpdateContact(input: unknown): ValidationResult<UpdateContactInput> {
  const parsed = updateContactSchema.safeParse(input);
  if (parsed.success) return { success: true, data: parsed.data };
  return { success: false, ...toFieldErrors(parsed.error) };
}
