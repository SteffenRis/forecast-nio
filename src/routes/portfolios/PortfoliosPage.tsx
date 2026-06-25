import { useStore } from '@/store'
import { RoutePlaceholder } from '@/components/common/RoutePlaceholder'

export function PortfoliosPage() {
  const count = useStore((s) => s.portfolioOrder.length)
  return <RoutePlaceholder navId="portfolios" count={count} noun="portfolio" />
}
