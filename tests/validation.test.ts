import { describe, it, expect } from 'vitest';
import {
  validateCreateContact,
  validateUpdateContact,
  PRIORITIES,
} from '@/lib/validation';

const valid = {
  name: 'Dana Ruiz',
  company: 'Sequoia',
  role: 'Partner',
  met_at: 'Haas career fair',
  notes: 'Follow up in two weeks.',
  priority: 'high',
};

describe('createContact validation', () => {
  it('accepts a complete, valid contact', () => {
    const result = validateCreateContact(valid);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('Dana Ruiz');
      expect(result.data.priority).toBe('high');
    }
  });

  it('accepts a contact with only the required fields', () => {
    const result = validateCreateContact({ name: 'Sam', priority: 'low' });
    expect(result.success).toBe(true);
    if (result.success) {
      // Omitted optional fields normalise to null, not undefined, so the
      // Data API writes an explicit NULL.
      expect(result.data.company).toBeNull();
      expect(result.data.notes).toBeNull();
    }
  });

  it('rejects an empty name with a clear message', () => {
    const result = validateCreateContact({ ...valid, name: '' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.message).toBe('Name is required.');
      expect(result.fieldErrors.name).toBe('Name is required.');
    }
  });

  it('rejects a whitespace-only name', () => {
    const result = validateCreateContact({ ...valid, name: '   ' });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.fieldErrors.name).toBe('Name is required.');
  });

  it('rejects a missing name', () => {
    const result = validateCreateContact({ priority: 'high' });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.fieldErrors.name).toBeDefined();
  });

  it('rejects a priority outside high/medium/low', () => {
    const result = validateCreateContact({ ...valid, priority: 'urgent' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.fieldErrors.priority).toContain('high, medium, low');
    }
  });

  it('rejects a missing priority', () => {
    const result = validateCreateContact({ name: 'Sam' });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.fieldErrors.priority).toBeDefined();
  });

  it.each(PRIORITIES)('accepts the valid priority %s', (priority) => {
    const result = validateCreateContact({ name: 'Sam', priority });
    expect(result.success).toBe(true);
  });

  it('trims surrounding whitespace from text fields', () => {
    const result = validateCreateContact({ ...valid, name: '  Dana Ruiz  ' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.name).toBe('Dana Ruiz');
  });

  it('rejects a name longer than 200 characters', () => {
    const result = validateCreateContact({ ...valid, name: 'a'.repeat(201) });
    expect(result.success).toBe(false);
  });

  it('strips user_id so a caller cannot choose a row owner', () => {
    const result = validateCreateContact({ ...valid, user_id: 'someone-else' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(Object.keys(result.data)).not.toContain('user_id');
    }
  });

  it('strips id so a caller cannot choose a primary key', () => {
    const result = validateCreateContact({ ...valid, id: 'forged-id' });
    expect(result.success).toBe(true);
    if (result.success) expect(Object.keys(result.data)).not.toContain('id');
  });

  it('rejects a non-object payload', () => {
    expect(validateCreateContact(null).success).toBe(false);
    expect(validateCreateContact('nope').success).toBe(false);
  });
});

describe('updateContact validation', () => {
  it('accepts a partial update', () => {
    const result = validateUpdateContact({ priority: 'medium' });
    expect(result.success).toBe(true);
  });

  it('rejects an empty update', () => {
    const result = validateUpdateContact({});
    expect(result.success).toBe(false);
  });

  it('still rejects an empty name on update', () => {
    const result = validateUpdateContact({ name: '  ' });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.fieldErrors.name).toBe('Name is required.');
  });

  it('still rejects an invalid priority on update', () => {
    const result = validateUpdateContact({ priority: 'URGENT' });
    expect(result.success).toBe(false);
  });

  it('strips user_id so an update cannot reassign ownership', () => {
    const result = validateUpdateContact({ name: 'Sam', user_id: 'someone-else' });
    expect(result.success).toBe(true);
    if (result.success) expect(Object.keys(result.data)).not.toContain('user_id');
  });
});
