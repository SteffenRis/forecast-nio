// Flexible date/quarter parser for an actuals CSV cell. The store keys actuals by
// calendar quarter, so any recognizable date or quarter label collapses to { year, q }.
// Pure (no `new Date()`), mirroring the rest of src/lib.

import type { CalendarQuarterRef } from '@/store/types'
import { quarterOfIso } from '@/lib/quarter'

const asQuarter = (q: number): 1 | 2 | 3 | 4 => q as 1 | 2 | 3 | 4

/** Parse a cell into a calendar quarter, or null if unrecognizable. Accepts:
 *   - quarter labels: 'Q1 2024', '2024 Q1', '2024-Q1', '2024Q1', 'q1-2024'
 *   - ISO-ish dates:  'YYYY-MM-DD', 'YYYY/MM/DD', 'YYYY-MM', 'YYYY/MM'
 *  Case- and whitespace-tolerant. Returns null for anything else (incl. bare years
 *  and day-first formats, which are ambiguous). */
export function parseCsvDate(raw: string): CalendarQuarterRef | null {
  const s = raw.trim()
  if (s === '') return null

  // Quarter + year in either order, with optional separators: "Q1 2024" / "2024-Q1".
  const qFirst = s.match(/^q\s*([1-4])\s*[-/ ]?\s*(\d{4})$/i)
  if (qFirst) return { year: Number(qFirst[2]), q: asQuarter(Number(qFirst[1])) }

  const yFirst = s.match(/^(\d{4})\s*[-/ ]?\s*q\s*([1-4])$/i)
  if (yFirst) return { year: Number(yFirst[1]), q: asQuarter(Number(yFirst[2])) }

  // YYYY-MM-DD or YYYY/MM/DD → the quarter of that day.
  const ymd = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/)
  if (ymd) {
    const year = Number(ymd[1])
    const month = Number(ymd[2])
    if (month < 1 || month > 12) return null
    return quarterOfIso(`${year}-${String(month).padStart(2, '0')}-01`)
  }

  // YYYY-MM or YYYY/MM → the quarter of that month.
  const ym = s.match(/^(\d{4})[-/](\d{1,2})$/)
  if (ym) {
    const year = Number(ym[1])
    const month = Number(ym[2])
    if (month < 1 || month > 12) return null
    return { year, q: asQuarter(Math.floor((month - 1) / 3) + 1) }
  }

  return null
}
