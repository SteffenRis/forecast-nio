import { NavLink } from 'react-router-dom'
import { cn } from '@/lib/cn'
import type { NavEntry } from './nav'

interface NavItemProps {
  entry: NavEntry
  collapsed: boolean
}

/** A single primary-nav destination. Active state is derived from the route. */
export function NavItem({ entry, collapsed }: NavItemProps) {
  const Icon = entry.icon
  return (
    <NavLink
      to={entry.route}
      title={collapsed ? entry.label : undefined}
      className={({ isActive }) =>
        cn(
          'group flex h-9 items-center gap-[11px] rounded-[7px] text-[13px] font-medium transition-colors',
          collapsed ? 'justify-center px-0' : 'px-[11px]',
          isActive
            ? 'bg-slate-100 text-body shadow-xs'
            : 'text-muted hover:bg-slate-50 hover:text-body',
        )
      }
    >
      {({ isActive }) => (
        <>
          <Icon
            className={cn(
              'size-4 flex-shrink-0',
              isActive ? 'text-slate-700' : 'text-slate-400 group-hover:text-slate-600',
            )}
            strokeWidth={2}
          />
          {!collapsed && <span className="min-w-0 flex-1 truncate text-left">{entry.label}</span>}
        </>
      )}
    </NavLink>
  )
}
