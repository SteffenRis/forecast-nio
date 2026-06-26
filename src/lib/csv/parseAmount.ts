// Tolerant money parser for an actuals CSV cell. US-style: comma = thousands,
// dot = decimal. Strips currency symbols/codes and whitespace, understands
// accounting parentheses-negatives. Distinguishes a *blank* cell (no value) from a
// *garbage* cell (something was there but isn't a number), so required-field
// validation can treat them differently.

export interface AmountResult {
  /** The parsed number, or null when the cell is blank or unparseable. */
  value: number | null
  /** Set when the cell had non-blank content that could not be parsed as a number. */
  invalid?: true
}

const CURRENCY_CODE = /\b(?:eur|usd|gbp|chf|jpy|sek|nok|dkk)\b/gi
const CURRENCY_SYMBOL = /[€$£¥]/g

/** Parse a free-typed money cell. Examples:
 *   "1,234,567" → 1234567 · "€ 1,000.50" → 1000.5 · "(1,234)" → -1234 ·
 *   "" → {value:null} · "n/a" → {value:null, invalid:true} */
export function parseAmount(raw: string): AmountResult {
  let s = raw.trim()
  if (s === '') return { value: null }

  // Accounting negative: ( 1,234 ) → -1,234
  let negative = false
  if (/^\(.*\)$/.test(s)) {
    negative = true
    s = s.slice(1, -1).trim()
  }

  s = s
    .replace(CURRENCY_CODE, '')
    .replace(CURRENCY_SYMBOL, '')
    .replace(/\s/g, '')
    .replace(/,/g, '') // strip thousands separators

  if (s.startsWith('-')) {
    negative = true
    s = s.slice(1)
  } else if (s.startsWith('+')) {
    s = s.slice(1)
  }

  if (s === '') return { value: null, invalid: true }
  // Only digits and at most one decimal point survive a valid number.
  if (!/^\d*\.?\d*$/.test(s) || s === '.') return { value: null, invalid: true }

  const n = Number(s)
  if (!Number.isFinite(n)) return { value: null, invalid: true }
  return { value: negative ? -n : n }
}
