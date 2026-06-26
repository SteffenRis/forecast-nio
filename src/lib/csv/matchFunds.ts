// Maps a fund name from the spreadsheet onto a fund in the system. Deterministic and
// conservative — no fuzzy/edit-distance, no dependencies. When it can't be sure, it
// returns 'none' so the user maps the name by hand on the wizard's mapping step.

/** Minimal fund shape — structurally satisfied by the store's Fund. */
export interface FundLike {
  id: string
  name: string
}

export type FundMatch =
  | { kind: 'exact'; fundId: string }
  | { kind: 'heuristic'; fundId: string }
  | { kind: 'none' }

/** Structural / legal words that don't distinguish one fund from another. Dropped
 *  before the heuristic comparison so "Acme Partners VII" and "Acme VII" line up,
 *  while version tokens (VII, VIII, 7) survive and keep funds in a family apart. */
const NOISE_TOKENS = new Set([
  'fund', 'funds', 'the', 'lp', 'llp', 'llc', 'ltd', 'limited', 'co', 'company',
  'partners', 'partnership', 'capital', 'ventures', 'venture', 'holdings', 'group',
  'investment', 'investments', 'vehicle', 'plc', 'inc', 'sa', 'ag', 'gmbh', 'bv',
  'cv', 'scsp', 'sicav', 'and',
])

/** lowercase, strip punctuation, collapse whitespace. Used for the exact comparison
 *  and as the basis for tokenization. */
export function normalizeFundName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** The set of meaningful tokens (normalized, minus noise words). */
function significantTokens(raw: string): Set<string> {
  return new Set(
    normalizeFundName(raw)
      .split(' ')
      .filter((t) => t !== '' && !NOISE_TOKENS.has(t)),
  )
}

const sameSet = (a: Set<string>, b: Set<string>): boolean =>
  a.size === b.size && [...a].every((t) => b.has(t))

/** Match a CSV fund name to exactly one system fund.
 *   1. EXACT — normalized full names are identical.
 *   2. HEURISTIC — the significant-token sets are identical (noise words ignored,
 *      order ignored), and exactly one system fund qualifies. Version tokens are
 *      significant, so "Acme VII" never matches "Acme VIII".
 *  Anything ambiguous (0 or 2+ candidates) returns 'none'. */
export function autoMatchFund(csvName: string, funds: FundLike[]): FundMatch {
  const normCsv = normalizeFundName(csvName)
  if (normCsv === '') return { kind: 'none' }

  const exact = funds.find((f) => normalizeFundName(f.name) === normCsv)
  if (exact) return { kind: 'exact', fundId: exact.id }

  const sigCsv = significantTokens(csvName)
  if (sigCsv.size === 0) return { kind: 'none' }
  const candidates = funds.filter((f) => sameSet(significantTokens(f.name), sigCsv))
  if (candidates.length === 1) return { kind: 'heuristic', fundId: candidates[0].id }

  return { kind: 'none' }
}
