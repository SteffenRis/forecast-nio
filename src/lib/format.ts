// Small display + parse helpers, shared across screens. (First introduced for the
// Templates editor; reused by later forecast views.)

import { currencySymbol } from './currency'

/** Parse a free-typed numeric field. Returns null for empty/invalid input. */
export function parseNumberInput(raw: string): number | null {
  const t = raw.trim()
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
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
