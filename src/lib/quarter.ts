// Pure calendar-quarter helpers for the Actuals screen. Kept in `lib` (never importing
// the engine) so the dependency direction stays components → store → engine. The engine
// has its own CalendarQuarter logic; this is a small, deliberate UI-side mirror.

import type { CalendarQuarterRef, IsoDate } from '@/store/types'

/** Human label for a calendar quarter, e.g. { year: 2025, q: 2 } → "Q2 2025". */
export function quarterLabel(q: CalendarQuarterRef): string {
  return `Q${q.q} ${q.year}`
}

/** A monotonic integer for chronological ordering: year*4 + (q-1). Mirrors the
 *  engine's calendar-quarter ordinal so sorts here match the engine's own ordering. */
export function quarterOrdinal(q: CalendarQuarterRef): number {
  return q.year * 4 + (q.q - 1)
}

/** Inverse of quarterOrdinal: rebuild { year, q } from a monotonic ordinal. */
export function quarterFromOrdinal(ord: number): CalendarQuarterRef {
  const year = Math.floor(ord / 4)
  const q = ((ord % 4) + 1) as 1 | 2 | 3 | 4
  return { year, q }
}

/** Comparator for Array.prototype.sort — orders quarters oldest → newest. */
export function compareQuarter(a: CalendarQuarterRef, b: CalendarQuarterRef): number {
  return quarterOrdinal(a) - quarterOrdinal(b)
}

/** Same ordering, for records that carry a `quarter` (e.g. ActualsRecord). */
export function compareByQuarter<T extends { quarter: CalendarQuarterRef }>(a: T, b: T): number {
  return compareQuarter(a.quarter, b.quarter)
}

/** The quarter immediately after `q`, rolling Q4 → Q1 of the next year. */
export function nextQuarter(q: CalendarQuarterRef): CalendarQuarterRef {
  return q.q < 4 ? { year: q.year, q: (q.q + 1) as 1 | 2 | 3 | 4 } : { year: q.year + 1, q: 1 }
}

/** The calendar quarter containing an ISO 'YYYY-MM-DD' date (e.g. '2025-05-10' → Q2 2025). */
export function quarterOfIso(iso: IsoDate): CalendarQuarterRef {
  const [y, m] = iso.split('-').map(Number)
  const year = Number.isFinite(y) ? y : 1970
  const month = Number.isFinite(m) && m >= 1 && m <= 12 ? m : 1
  const q = (Math.floor((month - 1) / 3) + 1) as 1 | 2 | 3 | 4
  return { year, q }
}
