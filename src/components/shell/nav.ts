import { Layers, LayoutTemplate, Settings, SquareChartGantt } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export interface NavEntry {
  id: string
  label: string
  icon: LucideIcon
  route: string
  group: 'top' | 'foot'
  /** Page heading + subheading rendered by the destination. */
  title: string
  sub: string
}

/** Four flat destinations — Forecasting is the whole app (no module switcher). */
export const NAV: NavEntry[] = [
  {
    id: 'templates',
    label: 'Templates',
    icon: LayoutTemplate,
    route: '/templates',
    group: 'top',
    title: 'Forecast Templates',
    sub: 'Reusable cash-flow models for building fund and portfolio forecasts.',
  },
  {
    id: 'portfolios',
    label: 'Portfolios',
    icon: Layers,
    route: '/portfolios',
    group: 'top',
    title: 'Portfolios',
    sub: 'Roll-up forecasts across funds in a portfolio.',
  },
  {
    id: 'funds',
    label: 'Funds',
    icon: SquareChartGantt,
    route: '/funds',
    group: 'top',
    title: 'Funds',
    sub: 'Every fund forecast, with plan-vs-actual tracking.',
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: Settings,
    route: '/settings',
    group: 'foot',
    title: 'Settings',
    sub: 'Workspace, members, and forecasting preferences.',
  },
]

/** Resolve the active nav entry from a pathname (top-level prefix match). */
export function activeNav(pathname: string): NavEntry {
  return NAV.find((n) => pathname === n.route || pathname.startsWith(n.route + '/')) ?? NAV[0]
}
