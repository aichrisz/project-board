import type { Project, SortKey } from '../types';

export type SortDir = 'asc' | 'desc';

/** Starred projects always sort above non-starred (stable within each group). */
function starredFirst(a: Project, b: Project): number {
  const as = a.starred ? 1 : 0;
  const bs = b.starred ? 1 : 0;
  return bs - as;
}

export function sortProjects(
  list: Project[],
  sort: SortKey,
  dir: SortDir = 'desc',
): Project[] {
  const copy = [...list];
  const mul = dir === 'asc' ? 1 : -1;

  const byKey = (a: Project, b: Project): number => {
    switch (sort) {
      case 'title':
        return mul * a.title.localeCompare(b.title);
      case 'progress':
        return mul * (a.progress_pct - b.progress_pct);
      case 'deadline': {
        if (!a.deadline && !b.deadline) return 0;
        if (!a.deadline) return 1;
        if (!b.deadline) return -1;
        return mul * a.deadline.localeCompare(b.deadline);
      }
      case 'updated':
      default:
        return (
          mul *
          (new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime())
        );
    }
  };

  return copy.sort((a, b) => {
    const pin = starredFirst(a, b);
    if (pin !== 0) return pin;
    return byKey(a, b);
  });
}

/** Default direction per sort key (matches dashboard expectations). */
export function defaultSortDir(sort: SortKey): SortDir {
  // Title usually A→Z; others newest / highest / soonest first (desc on raw field
  // would reverse deadline soonest-first, so deadline defaults to asc).
  if (sort === 'title' || sort === 'deadline') return 'asc';
  return 'desc';
}
