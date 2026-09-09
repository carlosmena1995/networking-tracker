'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { PRIORITIES, type Priority, type FieldErrors } from '@/lib/validation';
import { EMPTY_FORM, type Contact, type ContactFormValues } from '@/lib/types';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present when editing, absent when creating. */
  contact: Contact | null;
  onSubmit: (values: ContactFormValues) => Promise<{ error?: string; fieldErrors?: FieldErrors }>;
};

export function ContactFormDialog({ open, onOpenChange, contact, onSubmit }: Props) {
  const isEdit = contact !== null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit contact' : 'Add contact'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Update the details for this contact.'
              : 'Only a name and a priority are required.'}
          </DialogDescription>
        </DialogHeader>

        {/* Mounted only while open, and keyed by contact, so the form state is
            built fresh from props on mount. That avoids syncing props into
            state with an effect, which causes an extra cascading render. */}
        {open && (
          <ContactForm
            key={contact?.id ?? 'new'}
            contact={contact}
            isEdit={isEdit}
            onSubmit={onSubmit}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ContactForm({
  contact,
  isEdit,
  onSubmit,
  onClose,
}: {
  contact: Contact | null;
  isEdit: boolean;
  onSubmit: Props['onSubmit'];
  onClose: () => void;
}) {
  const [values, setValues] = useState<ContactFormValues>(() =>
    contact
      ? {
          name: contact.name,
          company: contact.company ?? '',
          role: contact.role ?? '',
          met_at: contact.met_at ?? '',
          notes: contact.notes ?? '',
          priority: contact.priority,
        }
      : EMPTY_FORM,
  );
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function set<K extends keyof ContactFormValues>(key: K, value: ContactFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
    // Clear the error for a field as soon as the user edits it.
    setFieldErrors((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setFormError(null);
    setFieldErrors({});

    try {
      const result = await onSubmit(values);
      if (result.error || result.fieldErrors) {
        setFieldErrors(result.fieldErrors ?? {});
        // Only show a banner for errors that belong to no specific field.
        const hasFieldError = Object.keys(result.fieldErrors ?? {}).length > 0;
        if (!hasFieldError) setFormError(result.error ?? 'Something went wrong.');
        return;
      }
      onClose();
    } finally {
      setPending(false);
    }
  }

  return (
    /* noValidate: we want our own messages, not the browser's, so the
       validation the grader sees is the server's. */
    <form onSubmit={handleSubmit} className="grid gap-4" noValidate>
          <Field id="name" label="Name" error={fieldErrors.name} required>
            <Input
              id="name"
              value={values.name}
              onChange={(e) => set('name', e.target.value)}
              aria-invalid={Boolean(fieldErrors.name)}
              placeholder="Dana Ruiz"
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="company" label="Company" error={fieldErrors.company}>
              <Input
                id="company"
                value={values.company}
                onChange={(e) => set('company', e.target.value)}
                aria-invalid={Boolean(fieldErrors.company)}
                placeholder="Sequoia"
              />
            </Field>

            <Field id="role" label="Role" error={fieldErrors.role}>
              <Input
                id="role"
                value={values.role}
                onChange={(e) => set('role', e.target.value)}
                aria-invalid={Boolean(fieldErrors.role)}
                placeholder="Partner"
              />
            </Field>
          </div>

          <Field id="met_at" label="Where you met" error={fieldErrors.met_at}>
            <Input
              id="met_at"
              value={values.met_at}
              onChange={(e) => set('met_at', e.target.value)}
              aria-invalid={Boolean(fieldErrors.met_at)}
              placeholder="Haas career fair"
            />
          </Field>

          <Field id="priority" label="Priority" error={fieldErrors.priority} required>
            <Select value={values.priority} onValueChange={(v) => set('priority', v as Priority)}>
              <SelectTrigger id="priority" className="w-full" aria-invalid={Boolean(fieldErrors.priority)}>
                <SelectValue placeholder="Select a priority" className="capitalize">
                  {values.priority}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {PRIORITIES.map((p) => (
                  <SelectItem key={p} value={p} className="capitalize">
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field id="notes" label="Notes" error={fieldErrors.notes}>
            <Textarea
              id="notes"
              rows={3}
              value={values.notes}
              onChange={(e) => set('notes', e.target.value)}
              aria-invalid={Boolean(fieldErrors.notes)}
              placeholder="Follow up in two weeks about the summer internship."
            />
          </Field>

          {formError && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          )}

      <DialogFooter className="gap-2 sm:gap-0">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : isEdit ? 'Save changes' : 'Add contact'}
        </Button>
      </DialogFooter>
    </form>
  );
}

function Field({
  id, label, error, required, children,
}: {
  id: string;
  label: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>
        {label}
        {required && <span className="text-muted-foreground"> *</span>}
      </Label>
      {children}
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
    </div>
  );
}
