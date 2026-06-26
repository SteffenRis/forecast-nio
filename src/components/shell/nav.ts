import {
  ArrowRightLeft,
  ClipboardList,
  Layers,
  LayoutTemplate,
  Settings,
  SquareChartGantt,
} from 'lucide-react'
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
  /** Routable + topbar-resolvable, but not shown in the sidebar. Used for fund
   *  sub-pages (Edit fund, Actuals) that are reached via the Funds-screen kebab. */
  hidden?: boolean
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
    id: 'performance',
    label: 'Funds',
    icon: SquareChartGantt,
    route: '/performance',
    group: 'top',
    title: 'Funds',
    sub: 'Plan vs actual per fund — open the editor or actuals from the menu.',
  },
  {
    // Fund input editor — reached via the Funds-screen kebab, not the sidebar.
    id: 'funds',
    label: 'Edit fund',
    icon: SquareChartGantt,
    route: '/funds',
    group: 'top',
    hidden: true,
    title: 'Edit fund',
    sub: 'Commitment, dates, fee terms and carry for the selected fund.',
  },
  {
    // Quarterly actuals entry — reached via the Funds-screen kebab, not the sidebar.
    id: 'actuals',
    label: 'Actuals',
    icon: ClipboardList,
    route: '/actuals',
    group: 'top',
    hidden: true,
    title: 'Actuals',
    sub: 'Upload realized contributions, distributions and NAV, quarter by quarter.',
  },
  {
    id: 'exchange-rates',
    label: 'Exchange Rates',
    icon: ArrowRightLeft,
    route: '/exchange-rates',
    group: 'top',
    title: 'Exchange Rates',
    sub: 'Pull market FX rates from frankfurter.dev for the currency pairs and dates your funds and portfolios actually use.',
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
