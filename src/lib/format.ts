// Small display + parse helpers, shared across screens. (First introduced for the
// Templates editor; reused by later forecast views.)

import { currencySymbol } from './currency'

/** Parse a free-typed numeric field. Returns null for empty/invalid input.
 *  Thousand separators (commas) are stripped first so grouped display round-trips. */
export function parseNumberInput(raw: string): number | null {
  const t = raw.trim().replace(/,/g, '')
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

/** Insert thousand separators into the integer part of a *clean* numeric string
 *  (digits, one leading '-', a single '.'). Preserves the sign, the decimal part,
 *  and a trailing '.' typed mid-entry. e.g. "9000000" → "9,000,000", "0.30" → "0.30". */
export function groupThousands(s: string): string {
  if (s === '' || s === '-') return s
  const neg = s.startsWith('-')
  const body = neg ? s.slice(1) : s
  const dot = body.indexOf('.')
  const intPart = dot >= 0 ? body.slice(0, dot) : body
  const decPart = dot >= 0 ? body.slice(dot + 1) : null
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return (neg ? '-' : '') + grouped + (decPart !== null ? '.' + decPart : '')
}

/** Sanitize a free-typed value (drop stray chars, keep one sign + one '.') and group
 *  it with thousand separators for live display while the user types. */
export function formatNumericInput(raw: string): string {
  let s = raw.replace(/[^\d.-]/g, '')
  const neg = s.startsWith('-')
  s = s.replace(/-/g, '')
  const firstDot = s.indexOf('.')
  if (firstDot >= 0) {
    s = s.slice(0, firstDot + 1) + s.slice(firstDot + 1).replace(/\./g, '')
  }
  return groupThousands((neg ? '-' : '') + s)
}

/** Full money for display, e.g. (30000000, 'EUR') → "€ 30,000,000". */
export function formatMoney(n: number, currency: string): string {
  if (!Number.isFinite(n)) return `${currencySymbol(currency)} 0`
  return `${currencySymbol(currency)} ${Math.round(n).toLocaleString('en-US')}`
}

/** Compact money helper, e.g. (30000000, 'EUR') → "€30.00M". */
export function formatMoneyCompact(n: number, currency: string): string {
  const sym = currencySymbol(currency)
  if (!Number.isFinite(n)) return `${sym}0`
  const abs = Math.abs(n)
  if (abs >= 1e9) return `${sym}${(n / 1e9).toFixed(2)}B`
  if (abs >= 1e6) return `${sym}${(n / 1e6).toFixed(2)}M`
  if (abs >= 1e3) return `${sym}${(n / 1e3).toFixed(2)}K`
  return `${sym}${n.toFixed(0)}`
}

/** Add whole years to an ISO 'YYYY-MM-DD' date, clamping Feb 29 → Feb 28 when the
 *  target year is not a leap year. Returns the input unchanged if it can't parse. */
export function addYearsIso(iso: string, years: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  const year = y + years
  // Last day of the (1-based) target month, to clamp e.g. 02-29 in a non-leap year.
  const lastDay = new Date(Date.UTC(year, m, 0)).getUTCDate()
  const day = Math.min(d, lastDay)
  const p = (v: number, n = 2) => String(v).padStart(n, '0')
  return `${p(year, 4)}-${p(m)}-${p(day)}`
}

/** Format a dimensionless ratio (PIC/DPI/TVPI multiple) for display. */
export function formatRatio(n: number, dp = 2): string {
  return n.toFixed(dp)
}

/** Format a fraction as a percent string, e.g. 0.6 → "60%". */
export function formatPercent(n: number, dp = 0): string {
  return `${(n * 100).toFixed(dp)}%`
}
