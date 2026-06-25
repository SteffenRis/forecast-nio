import type { FeeBasis } from '@/store/types'

/** The fee-basis enum, in display order (drives the four basis dropdowns). */
export const FEE_BASES: { value: FeeBasis; label: string }[] = [
  { value: 'commitment', label: 'Commitment' },
  { value: 'cost_basis', label: 'Cost basis' },
  { value: 'nav', label: 'NAV' },
  { value: 'paid_in', label: 'Paid-in' },
]

const LABELS = Object.fromEntries(FEE_BASES.map((b) => [b.value, b.label])) as Record<
  FeeBasis,
  string
>

export function feeBasisLabel(value: FeeBasis): string {
  return LABELS[value] ?? value
}
