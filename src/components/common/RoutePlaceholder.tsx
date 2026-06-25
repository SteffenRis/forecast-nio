import { NAV } from '@/components/shell/nav'

interface RoutePlaceholderProps {
  navId: string
  count?: number
  noun?: string
  children?: React.ReactNode
}

/** Phase-1 page: real heading + an empty-state noting screens arrive in Phase 2.
 *  When `children` are provided, the page owns its full content (no auto heading). */
export function RoutePlaceholder({ navId, count, noun, children }: RoutePlaceholderProps) {
  const nav = NAV.find((n) => n.id === navId) ?? NAV[0]
  if (children) return <div className="mx-auto max-w-5xl">{children}</div>
  return (
    <div className="mx-auto max-w-5xl">
      <h2 className="text-xl font-bold tracking-[-0.02em]">{nav.title}</h2>
      <p className="mt-1 text-[13px] text-muted">{nav.sub}</p>

      <div className="mt-5 grid place-items-center rounded-xl border border-dashed border-border-default bg-white py-16 text-center shadow-sm">
        <div className="max-w-sm px-6">
          <p className="text-sm font-semibold text-body">
            {typeof count === 'number'
              ? `${count} ${noun}${count === 1 ? '' : 's'} in the store`
              : 'Foundation ready'}
          </p>
          <p className="mt-1 text-[13px] leading-relaxed text-muted">
            This screen is part of Phase&nbsp;2. The zustand store and the calculation engine
            are wired underneath — the editor and forecast views are built next.
          </p>
        </div>
      </div>
    </div>
  )
}
