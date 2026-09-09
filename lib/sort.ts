import type { Priority } from '@/lib/validation';

/**
 * Priority ordering.
 *
 * Postgres stores priority as text, so ORDER BY would give the alphabetical
 * "high, low, medium" - meaningless to a user. The rank below encodes
 * importance instead, and the sort runs after fetching.
 *
 * The numbers matter: higher = more important, so `desc` puts high first.
 * That is what someone choosing "sort by priority" is asking for. Getting this
 * backwards is easy and silent, hence the tests.
 */
export const PRIORITY_RANK: Record<Priority, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

export type SortDirection = 'asc' | 'desc';

/** Sort a copy of `rows` by priority importance. */
export function sortByPriority<T extends { priority: Priority }>(
  rows: readonly T[],
  direction: SortDirection,
): T[] {
  return [...rows].sort((a, b) =>
    direction === 'asc'
      ? PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
      : PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority],
  );
}
