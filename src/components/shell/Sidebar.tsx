import { ChevronsUpDown, PanelLeftClose, Search } from 'lucide-react'
import { useStore } from '@/store'
import { cn } from '@/lib/cn'
import { BrandLockup, BrandMark } from './BrandLockup'
import { NavItem } from './NavItem'
import { NAV } from './nav'

export function Sidebar() {
  const collapsed = useStore((s) => s.ui.sidebarCollapsed)
  const toggleSidebar = useStore((s) => s.toggleSidebar)

  const top = NAV.filter((n) => n.group === 'top')
  const foot = NAV.filter((n) => n.group === 'foot')

  return (
    <aside
      className={cn(
        'flex h-full flex-shrink-0 flex-col border-r border-border-default bg-white transition-[width] duration-200',
        collapsed ? 'w-[68px]' : 'w-64',
      )}
    >
      {/* head: brand + collapse toggle */}
      <div
        className={cn(
          'flex h-14 flex-shrink-0 items-center border-b border-border-subtle',
          collapsed ? 'justify-center px-0' : 'justify-between px-4',
        )}
      >
        {collapsed ? (
          <button
            type="button"
            onClick={toggleSidebar}
            title="Expand sidebar"
            className="grid place-items-center rounded-md p-0"
          >
            <BrandMark />
          </button>
        ) : (
          <>
            <BrandLockup />
            <button
              type="button"
              onClick={toggleSidebar}
              title="Collapse sidebar"
              className="grid size-[26px] flex-shrink-0 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            >
              <PanelLeftClose className="size-4" strokeWidth={2} />
            </button>
          </>
        )}
      </div>

      {/* nav */}
      <nav className="flex flex-1 flex-col overflow-y-auto p-3">
        <button
          type="button"
          className={cn(
            'mb-4 flex h-[34px] items-center gap-[10px] rounded-md border border-border-default text-[12px] font-medium text-muted hover:bg-slate-50',
            collapsed ? 'justify-center px-0' : 'px-[10px]',
          )}
          title="Search (⌘K)"
        >
          <Search className="size-[14px] flex-shrink-0" strokeWidth={2} />
          {!collapsed && (
            <>
              <span className="flex-1 text-left">Search</span>
              <kbd className="inline-flex h-4 items-center rounded border border-border-default bg-slate-100 px-[5px] font-mono text-[9px]">
                ⌘K
              </kbd>
            </>
          )}
        </button>

        <div className="flex flex-col gap-[3px]">
          {top.map((entry) => (
            <NavItem key={entry.id} entry={entry} collapsed={collapsed} />
          ))}
        </div>

        <div className="mt-auto border-t border-border-subtle pt-2">
          {foot.map((entry) => (
            <NavItem key={entry.id} entry={entry} collapsed={collapsed} />
          ))}
        </div>
      </nav>

      {/* account */}
      <div className="flex-shrink-0 border-t border-border-subtle p-3">
        <button
          type="button"
          className={cn(
            'flex w-full items-center gap-[10px] rounded-[7px] p-1.5 hover:bg-slate-50',
            collapsed && 'justify-center',
          )}
          title="Maya Chen — Northbridge Capital"
        >
          <span className="grid size-[30px] flex-shrink-0 place-items-center rounded-full bg-slate-900 text-[11px] font-semibold text-white">
            MC
          </span>
          {!collapsed && (
            <>
              <span className="flex min-w-0 flex-1 flex-col text-left">
                <span className="truncate text-[12px] font-semibold">Maya Chen</span>
                <span className="truncate text-[10px] text-muted">Northbridge Capital</span>
              </span>
              <ChevronsUpDown className="size-[14px] flex-shrink-0 text-slate-400" strokeWidth={2} />
            </>
          )}
        </button>
      </div>
    </aside>
  )
}
