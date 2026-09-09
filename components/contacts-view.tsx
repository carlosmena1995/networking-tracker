'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { ContactFormDialog } from '@/components/contact-form-dialog';
import type { Contact, ContactFormValues } from '@/lib/types';
import type { FieldErrors, Priority } from '@/lib/validation';

type SortField = 'created_at' | 'name' | 'company' | 'priority';
type Direction = 'asc' | 'desc';
type PriorityFilter = Priority | 'all';

const SORT_LABELS: Record<SortField, string> = {
  created_at: 'Date added',
  name: 'Name',
  company: 'Company',
  priority: 'Priority',
};

const PRIORITY_FILTER_LABELS: Record<PriorityFilter, string> = {
  all: 'All',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

const PRIORITY_STYLES: Record<Priority, string> = {
  high: 'border-transparent bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200',
  medium: 'border-transparent bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
  low: 'border-transparent bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
};

export function ContactsView() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [sort, setSort] = useState<SortField>('created_at');
  const [direction, setDirection] = useState<Direction>('desc');
  const [priority, setPriority] = useState<PriorityFilter>('all');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Contact | null>(null);
  const [deleting, setDeleting] = useState<Contact | null>(null);
  const [deletePending, setDeletePending] = useState(false);

  // Debounce so typing does not fire a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(timer);
  }, [search]);

  // Bumping this re-runs the fetch effect - used after a create/edit/delete
  // and by the "Try again" button.
  const [reloadToken, setReloadToken] = useState(0);
  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  // Fetching is exactly what effects are for: synchronising React with an
  // external system (the API) whenever the sort/filter inputs change.
  useEffect(() => {
    const controller = new AbortController();

    async function run() {
      const params = new URLSearchParams({ sort, direction, priority });
      if (debouncedSearch.trim()) params.set('search', debouncedSearch.trim());

      try {
        const response = await fetch(`/api/contacts?${params}`, {
          cache: 'no-store',
          signal: controller.signal,
        });
        const body = await response.json().catch(() => null);

        if (!response.ok) {
          setLoadError(body?.error ?? 'Could not load your contacts.');
          return;
        }
        setLoadError(null);
        setContacts(body.contacts ?? []);
      } catch {
        // An aborted request is a superseded one, not a failure: the newer
        // request owns the UI now, so leave the state alone.
        if (controller.signal.aborted) return;
        setLoadError('Could not reach the server. Check your connection and try again.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void run();
    // Cancelling on cleanup stops a slow response for old filters from
    // overwriting a fast response for the current ones.
    return () => controller.abort();
  }, [sort, direction, priority, debouncedSearch, reloadToken]);

  /** Shared submit handler for both create and edit. */
  async function submitContact(
    values: ContactFormValues,
  ): Promise<{ error?: string; fieldErrors?: FieldErrors }> {
    const isEdit = editing !== null;
    const url = isEdit ? `/api/contacts/${editing.id}` : '/api/contacts';

    try {
      const response = await fetch(url, {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      const body = await response.json().catch(() => null);

      if (!response.ok) {
        return {
          error: body?.error ?? 'Could not save the contact.',
          fieldErrors: body?.fieldErrors,
        };
      }

      toast.success(isEdit ? 'Contact updated.' : 'Contact added.');
      reload();
      return {};
    } catch {
      return { error: 'Could not reach the server. Please try again.' };
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    setDeletePending(true);
    try {
      const response = await fetch(`/api/contacts/${deleting.id}`, { method: 'DELETE' });
      const body = await response.json().catch(() => null);

      if (!response.ok) {
        toast.error(body?.error ?? 'Could not delete the contact.');
        return;
      }
      toast.success('Contact deleted.');
      setDeleting(null);
      reload();
    } catch {
      toast.error('Could not reach the server. Please try again.');
    } finally {
      setDeletePending(false);
    }
  }

  const filtersActive = priority !== 'all' || debouncedSearch.trim() !== '';

  return (
    <div className="flex flex-col gap-4">
      {/* Controls */}
      <Card>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[1fr_auto_auto_auto]">
          <div className="grid gap-2">
            <Label htmlFor="search">Search</Label>
            <Input
              id="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name, company, role, where you met"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="priority-filter">Priority</Label>
            <Select value={priority} onValueChange={(v) => setPriority(v as PriorityFilter)}>
              <SelectTrigger id="priority-filter" className="w-full lg:w-36">
                {/* Passing children overrides Radix's auto-detected text, which
                    is empty until SelectContent has been opened once. */}
                <SelectValue>{PRIORITY_FILTER_LABELS[priority]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(PRIORITY_FILTER_LABELS) as PriorityFilter[]).map((value) => (
                  <SelectItem key={value} value={value}>
                    {PRIORITY_FILTER_LABELS[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="sort">Sort by</Label>
            <Select value={sort} onValueChange={(v) => setSort(v as SortField)}>
              <SelectTrigger id="sort" className="w-full lg:w-40">
                <SelectValue>{SORT_LABELS[sort]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(SORT_LABELS) as SortField[]).map((field) => (
                  <SelectItem key={field} value={field}>
                    {SORT_LABELS[field]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="direction" className="lg:sr-only">Direction</Label>
            <Button
              id="direction"
              type="button"
              variant="outline"
              className="w-full lg:mt-6 lg:w-auto"
              onClick={() => setDirection((d) => (d === 'asc' ? 'desc' : 'asc'))}
              aria-label={`Sort ${direction === 'asc' ? 'ascending' : 'descending'}. Click to reverse.`}
            >
              {direction === 'asc' ? '↑ Ascending' : '↓ Descending'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm" aria-live="polite">
          {loading
            ? 'Loading…'
            : `${contacts.length} ${contacts.length === 1 ? 'contact' : 'contacts'}${
                filtersActive ? ' matching your filters' : ''
              }`}
        </p>
        <Button
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          Add contact
        </Button>
      </div>

      {/* States: error, loading, empty, list */}
      {loadError ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription className="flex flex-wrap items-center gap-3">
            {loadError}
            <Button size="sm" variant="outline" onClick={reload}>
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      ) : loading ? (
        <LoadingState />
      ) : contacts.length === 0 ? (
        <EmptyState
          filtersActive={filtersActive}
          onClear={() => {
            setPriority('all');
            setSearch('');
          }}
          onAdd={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        />
      ) : (
        <ContactList
          contacts={contacts}
          onEdit={(contact) => {
            setEditing(contact);
            setFormOpen(true);
          }}
          onDelete={setDeleting}
        />
      )}

      <ContactFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        contact={editing}
        onSubmit={submitContact}
      />

      <Dialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete contact?</DialogTitle>
            <DialogDescription>
              This permanently deletes {deleting?.name ?? 'this contact'}. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={deletePending}>
              {deletePending ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ContactList({
  contacts, onEdit, onDelete,
}: {
  contacts: Contact[];
  onEdit: (contact: Contact) => void;
  onDelete: (contact: Contact) => void;
}) {
  return (
    <>
      {/* Mobile: cards. Desktop: table. Same data, laid out for the space. */}
      <div className="grid gap-3 md:hidden">
        {contacts.map((contact) => (
          <Card key={contact.id}>
            <CardContent className="flex flex-col gap-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium break-words">{contact.name}</p>
                  <p className="text-muted-foreground text-sm break-words">
                    {[contact.role, contact.company].filter(Boolean).join(' · ') || '—'}
                  </p>
                </div>
                <PriorityBadge priority={contact.priority} />
              </div>

              {contact.met_at && (
                <p className="text-sm">
                  <span className="text-muted-foreground">Met at: </span>
                  {contact.met_at}
                </p>
              )}
              {contact.notes && <p className="text-sm break-words">{contact.notes}</p>}

              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="flex-1" onClick={() => onEdit(contact)}>
                  Edit
                </Button>
                <Button size="sm" variant="outline" className="flex-1" onClick={() => onDelete(contact)}>
                  Delete
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="hidden md:block">
        <Card className="py-0">
          <CardContent className="overflow-x-auto px-0">
            <table className="w-full text-sm">
              <caption className="sr-only">Your networking contacts</caption>
              <thead>
                <tr className="border-b text-left">
                  <Th>Name</Th>
                  <Th>Company</Th>
                  <Th>Role</Th>
                  <Th>Where you met</Th>
                  <Th>Priority</Th>
                  <th scope="col" className="px-4 py-3">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {contacts.map((contact) => (
                  <tr key={contact.id} className="border-b last:border-0 align-top">
                    <td className="px-4 py-3 font-medium">
                      {contact.name}
                      {contact.notes && (
                        <p className="text-muted-foreground mt-1 max-w-xs text-xs font-normal">
                          {contact.notes}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">{contact.company || '—'}</td>
                    <td className="px-4 py-3">{contact.role || '—'}</td>
                    <td className="px-4 py-3">{contact.met_at || '—'}</td>
                    <td className="px-4 py-3">
                      <PriorityBadge priority={contact.priority} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="outline" onClick={() => onEdit(contact)}>
                          Edit
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => onDelete(contact)}>
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th scope="col" className="text-muted-foreground px-4 py-3 font-medium">
      {children}
    </th>
  );
}

function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <Badge className={`capitalize ${PRIORITY_STYLES[priority]}`}>{priority}</Badge>
  );
}

function LoadingState() {
  return (
    <div className="grid gap-3" aria-busy="true" aria-label="Loading contacts">
      {[0, 1, 2].map((i) => (
        <Card key={i}>
          <CardContent className="flex flex-col gap-3">
            <div className="flex justify-between gap-4">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-5 w-16" />
            </div>
            <Skeleton className="h-4 w-56" />
            <Skeleton className="h-4 w-full max-w-md" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function EmptyState({
  filtersActive, onClear, onAdd,
}: {
  filtersActive: boolean;
  onClear: () => void;
  onAdd: () => void;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
        <p className="font-medium">
          {filtersActive ? 'No contacts match those filters' : 'No contacts yet'}
        </p>
        <p className="text-muted-foreground max-w-sm text-sm text-balance">
          {filtersActive
            ? 'Try a different search term or priority.'
            : 'Add the first person you want to stay connected with at Berkeley.'}
        </p>
        {filtersActive ? (
          <Button variant="outline" onClick={onClear}>
            Clear filters
          </Button>
        ) : (
          <Button onClick={onAdd}>Add your first contact</Button>
        )}
      </CardContent>
    </Card>
  );
}
