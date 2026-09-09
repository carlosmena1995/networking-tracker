import { describe, it, expect } from 'vitest';
import { sortByPriority, PRIORITY_RANK } from '@/lib/sort';

const rows = [
  { name: 'low one', priority: 'low' as const },
  { name: 'high one', priority: 'high' as const },
  { name: 'medium one', priority: 'medium' as const },
  { name: 'high two', priority: 'high' as const },
];

const names = (list: { name: string }[]) => list.map((r) => r.name);

describe('sortByPriority', () => {
  it('ranks high above medium above low', () => {
    expect(PRIORITY_RANK.high).toBeGreaterThan(PRIORITY_RANK.medium);
    expect(PRIORITY_RANK.medium).toBeGreaterThan(PRIORITY_RANK.low);
  });

  it('puts the most important first when descending', () => {
    // The regression this guards: an earlier version ranked high as 0, so the
    // default "descending" view showed low-priority contacts at the top.
    const sorted = sortByPriority(rows, 'desc');
    expect(names(sorted).slice(0, 2).every((n) => n.startsWith('high'))).toBe(true);
    expect(names(sorted).at(-1)).toBe('low one');
  });

  it('puts the least important first when ascending', () => {
    const sorted = sortByPriority(rows, 'asc');
    expect(names(sorted)[0]).toBe('low one');
    expect(names(sorted).at(-1)?.startsWith('high')).toBe(true);
  });

  it('does not mutate the input', () => {
    const original = [...rows];
    sortByPriority(rows, 'desc');
    expect(rows).toEqual(original);
  });

  it('handles an empty list', () => {
    expect(sortByPriority([], 'desc')).toEqual([]);
  });
});
