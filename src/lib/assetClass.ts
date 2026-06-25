import type { AssetClass } from '@/store/types'

/** The asset-class enum, in display order (drives the template dropdown). */
export const ASSET_CLASSES: { value: AssetClass; label: string }[] = [
  { value: 'large_cap_buyout', label: 'Large Cap Buyout' },
  { value: 'mid_cap_buyout', label: 'Mid Cap Buyout' },
  { value: 'small_cap_buyout', label: 'Small Cap Buyout' },
  { value: 'venture', label: 'Venture' },
  { value: 'growth', label: 'Growth' },
  { value: 'private_credit', label: 'Private Credit' },
  { value: 'real_assets', label: 'Real Assets' },
]

const LABELS = Object.fromEntries(ASSET_CLASSES.map((a) => [a.value, a.label])) as Record<
  AssetClass,
  string
>

export function assetClassLabel(value: AssetClass): string {
  return LABELS[value] ?? value
}
