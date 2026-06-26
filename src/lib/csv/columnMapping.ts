// Maps the columns of an uploaded CSV onto the six canonical actuals fields.
// Auto-detection matches each header against a table of normalized synonyms; the
// UI lets the user override any column → field assignment afterwards.

export type CanonicalField =
  | 'fundName'
  | 'date'
  | 'contributions' // → cumulativePaidIn (cumulative-to-date, used as-is)
  | 'distributions' // → cumulativeDistributions (cumulative-to-date, used as-is)
  | 'recallable' // → recallableDistributions (optional)
  | 'nav'

/** field → column index in the CSV (null = unmapped). A column maps to at most one field. */
export type ColumnMapping = Record<CanonicalField, number | null>

/** Display metadata for the six fields, in canonical order. `required: false` is
 *  only the recallable balance, which funds may legitimately not report. */
export const FIELDS: { key: CanonicalField; label: string; required: boolean; hint: string }[] = [
  { key: 'fundName', label: 'Fund name', required: true, hint: 'Name as it appears in the sheet' },
  { key: 'date', label: 'Date', required: true, hint: 'Date or quarter of the reporting period' },
  { key: 'contributions', label: 'Contributions', required: true, hint: 'Cumulative paid-in to date' },
  { key: 'distributions', label: 'Distributions', required: true, hint: 'Cumulative distributions to date' },
  { key: 'recallable', label: 'Recallable', required: false, hint: 'Recallable-distributions balance (optional)' },
  { key: 'nav', label: 'NAV', required: true, hint: 'Net asset value at period end' },
]

export const CANONICAL_FIELDS: CanonicalField[] = FIELDS.map((f) => f.key)
export const REQUIRED_FIELDS: CanonicalField[] = FIELDS.filter((f) => f.required).map((f) => f.key)

/** Header synonyms per field, written in plain English and normalized at module load.
 *  `normalizeHeader` strips the noise tokens ("cumulative", currency codes, …) so we
 *  don't have to list every "cumulative paid in (EUR)" variant. */
const ALIAS_SOURCE: Record<CanonicalField, string[]> = {
  fundName: ['fund', 'fund name', 'name', 'investment', 'vehicle', 'partnership'],
  date: ['date', 'as of', 'as of date', 'reporting date', 'report date', 'valuation date', 'quarter', 'period'],
  contributions: ['contributions', 'contributed', 'paid in', 'capital called', 'called', 'drawdowns', 'drawn'],
  distributions: ['distributions', 'distributed', 'realizations', 'proceeds'],
  recallable: ['recallable', 'recallable distributions', 'recallable amount', 'return of capital recallable'],
  nav: ['nav', 'net asset value', 'ending nav', 'fair value', 'market value', 'residual value'],
}

/** Tokens stripped from any header before matching — currency and "cumulative/total"
 *  noise that would otherwise force a combinatorial alias list. */
const NOISE_TOKENS = new Set([
  'cumulative',
  'cumul',
  'total',
  'to',
  'date',
  'todate',
  'amount',
  'eur',
  'usd',
  'gbp',
  'value',
])

/** lowercase, strip punctuation, drop noise tokens, collapse whitespace. Note "value"
 *  is a noise token, so "net asset value" → "net asset" and "fair value" → "fair";
 *  the alias table is normalized the same way, keeping both sides consistent. */
export function normalizeHeader(raw: string): string {
  const cleaned = raw
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ') // punctuation → space
    .replace(/\s+/g, ' ')
    .trim()
  if (cleaned === '') return ''
  const kept = cleaned.split(' ').filter((t) => t !== '' && !NOISE_TOKENS.has(t))
  // If every token was noise (e.g. a bare "Value" column), fall back to the cleaned
  // string so the header still has something to match on.
  return (kept.length > 0 ? kept : cleaned.split(' ')).join(' ')
}

/** field → Set of normalized aliases, built once. */
const FIELD_ALIASES: Record<CanonicalField, Set<string>> = Object.fromEntries(
  (Object.keys(ALIAS_SOURCE) as CanonicalField[]).map((f) => [
    f,
    new Set(ALIAS_SOURCE[f].map(normalizeHeader)),
  ]),
) as Record<CanonicalField, Set<string>>

/** Which field (if any) a single header best matches: exact-normalized first, then
 *  a contains check (so "ending nav balance" still resolves to nav). */
function fieldForHeader(header: string): CanonicalField | null {
  const norm = normalizeHeader(header)
  if (norm === '') return null
  for (const f of CANONICAL_FIELDS) {
    if (FIELD_ALIASES[f].has(norm)) return f
  }
  for (const f of CANONICAL_FIELDS) {
    for (const alias of FIELD_ALIASES[f]) {
      if (norm === alias || norm.includes(alias) || alias.includes(norm)) return f
    }
  }
  return null
}

/** Best-effort auto-detection. Walks columns left to right; the first column that
 *  matches a still-unclaimed field wins it. Deterministic and order-stable. */
export function autoDetectColumns(header: string[]): ColumnMapping {
  const mapping: ColumnMapping = {
    fundName: null,
    date: null,
    contributions: null,
    distributions: null,
    recallable: null,
    nav: null,
  }
  header.forEach((h, idx) => {
    const field = fieldForHeader(h)
    if (field && mapping[field] === null) mapping[field] = idx
  })
  return mapping
}

/** True when every required field has a column assigned. */
export function isColumnMappingComplete(mapping: ColumnMapping): boolean {
  return REQUIRED_FIELDS.every((f) => mapping[f] !== null)
}
