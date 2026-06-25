// Reporting-currency list + symbol lookup. Drives the fund's currency <select>
// and the money-input prefix. (FX between currencies is a portfolio-level concern.)

export const CURRENCIES: { code: string; symbol: string; label: string }[] = [
  { code: 'EUR', symbol: '€', label: 'EUR — Euro (€)' },
  { code: 'USD', symbol: '$', label: 'USD — US Dollar ($)' },
  { code: 'GBP', symbol: '£', label: 'GBP — Pound (£)' },
]

const SYMBOLS = Object.fromEntries(CURRENCIES.map((c) => [c.code, c.symbol])) as Record<
  string,
  string
>

/** The symbol for a currency code, falling back to the code itself (e.g. 'CHF'). */
export function currencySymbol(code: string): string {
  return SYMBOLS[code] ?? code
}
