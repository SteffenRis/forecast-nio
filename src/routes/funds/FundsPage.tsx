import { useStore } from '@/store'
import { RoutePlaceholder } from '@/components/common/RoutePlaceholder'

export function FundsPage() {
  const count = useStore((s) => s.fundOrder.length)
  return <RoutePlaceholder navId="funds" count={count} noun="fund" />
}
