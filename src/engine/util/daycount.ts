// §1.4 Day-counting conventions (load-bearing).
// All date math is hand-rolled and uses UTC consistently (Date.UTC / getUTC*)
// so that no timezone shift can move a quarter boundary.

/** A calendar quarter, never conflated with an inception-quarter index. */
export interface CalendarQuarter {
  year: number;
  /** 1..4 */
  q: number;
}

/** Parse an ISO date string ("YYYY-MM-DD") into a UTC Date. */
export function parseISO(s: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) throw new Error(`Invalid ISO date: ${s}`);
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  return new Date(Date.UTC(year, month - 1, day));
}

/** Format a UTC Date as "YYYY-MM-DD". */
export function formatISO(d: Date): string {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  return `${y}-${pad(m)}-${pad(day)}`;
}

/** Number of days in a given UTC month (month: 0..11). */
export function daysInMonth(year: number, month: number): number {
  // month is 0-indexed. Day 0 of next month = last day of this month.
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

/**
 * `D + k months` with end-of-month clamp (never naive day carry-over).
 * Examples:
 *   2024-01-31 + 1mo = 2024-02-29; 2023-01-31 + 1mo = 2023-02-28
 *   2024-01-31 + 3mo = 2024-04-30; 2024-02-29 + 12mo = 2025-02-28
 */
export function addMonths(d: Date, k: number): Date {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const day = d.getUTCDate();
  const totalMonths = y * 12 + m + k;
  const ny = Math.floor(totalMonths / 12);
  const nm = totalMonths - ny * 12;
  const dim = daysInMonth(ny, nm);
  const nd = Math.min(day, dim);
  return new Date(Date.UTC(ny, nm, nd));
}

/**
 * 30/360 directional day difference:
 *   (y2−y1)·360 + (m2−m1)·30 + (min(d2,30) − min(d1,30))
 * Months are 1-indexed in the formula; we use getUTCMonth()+1 internally.
 */
export function days30360(d1: Date, d2: Date): number {
  const y1 = d1.getUTCFullYear();
  const y2 = d2.getUTCFullYear();
  const m1 = d1.getUTCMonth() + 1;
  const m2 = d2.getUTCMonth() + 1;
  const day1 = Math.min(d1.getUTCDate(), 30);
  const day2 = Math.min(d2.getUTCDate(), 30);
  return (y2 - y1) * 360 + (m2 - m1) * 30 + (day2 - day1);
}

const MS_PER_DAY = 86400000;

/** ACT/365 day-count fraction between two dates (actual days / 365). */
export function actDays(d1: Date, d2: Date): number {
  // Actual calendar days between (UTC, so no DST artifacts).
  return Math.round((d2.getTime() - d1.getTime()) / MS_PER_DAY);
}

/** Calendar quarter containing a date. */
export function quarterOf(d: Date): CalendarQuarter {
  const month = d.getUTCMonth(); // 0..11
  const q = Math.floor(month / 3) + 1;
  return { year: d.getUTCFullYear(), q };
}

/** First day (inclusive) of a calendar quarter: date(year, 3(q-1)+1, 1). */
export function calQuarterStart(c: CalendarQuarter): Date {
  return new Date(Date.UTC(c.year, 3 * (c.q - 1), 1));
}

/** Exclusive end of a calendar quarter = start + 3 months. */
export function calQuarterEnd(c: CalendarQuarter): Date {
  return addMonths(calQuarterStart(c), 3);
}

/** Last day (inclusive) of a calendar quarter (Mar 31 / Jun 30 / Sep 30 / Dec 31). */
export function lastDayOfCalQuarter(c: CalendarQuarter): Date {
  const startNext = calQuarterEnd(c);
  return new Date(startNext.getTime() - MS_PER_DAY);
}

/**
 * Ordinal index of a calendar quarter relative to a base quarter (0-based).
 * Used to iterate quarter ranges.
 */
export function calQuarterOrdinal(c: CalendarQuarter): number {
  return c.year * 4 + (c.q - 1);
}

/** Inverse of calQuarterOrdinal. */
export function calQuarterFromOrdinal(ord: number): CalendarQuarter {
  const year = Math.floor(ord / 4);
  const q = (ord - year * 4) + 1;
  return { year, q };
}

/** Advance a calendar quarter by `n` quarters (can be negative). */
export function addCalQuarters(c: CalendarQuarter, n: number): CalendarQuarter {
  return calQuarterFromOrdinal(calQuarterOrdinal(c) + n);
}

/** Inclusive range of calendar quarters from `start` to `end`. */
export function calQuarterRange(
  start: CalendarQuarter,
  end: CalendarQuarter,
): CalendarQuarter[] {
  const a = calQuarterOrdinal(start);
  const b = calQuarterOrdinal(end);
  const out: CalendarQuarter[] = [];
  for (let i = a; i <= b; i++) out.push(calQuarterFromOrdinal(i));
  return out;
}

/** Equality test for two calendar quarters. */
export function calQuarterEq(a: CalendarQuarter, b: CalendarQuarter): boolean {
  return a.year === b.year && a.q === b.q;
}

/**
 * Inception block bounds (§1.2 / §5). Inception-quarter `i` (1-indexed) for an
 * effective date `D_eff` spans:
 *   [D_eff + 3(i−1) months, D_eff + 3i months)
 * Calendar-month based with end-of-month clamp, NOT fixed 90-day blocks.
 */
export function inceptionBlockStart(dEff: Date, i: number): Date {
  return addMonths(dEff, 3 * (i - 1));
}
export function inceptionBlockEnd(dEff: Date, i: number): Date {
  return addMonths(dEff, 3 * i);
}

/** block_days = 90 under 30/360 (constant). */
export const BLOCK_DAYS = 90;
