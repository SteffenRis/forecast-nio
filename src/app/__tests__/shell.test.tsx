import { render, screen } from '@testing-library/react'
import { App } from '@/App'

describe('app shell', () => {
  it('renders the chrome and lands on Templates by default', async () => {
    render(<App />)
    // brand lockup present
    expect(screen.getByText('Forecasting')).toBeInTheDocument()
    // four nav destinations (Templates also shows in the topbar breadcrumb when active)
    expect(screen.getAllByText('Templates').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Portfolios')).toBeInTheDocument()
    expect(screen.getByText('Funds')).toBeInTheDocument()
    expect(screen.getByText('Settings')).toBeInTheDocument()
    // default redirect to /templates renders the real editor (New-template action)
    expect(await screen.findByText('New template')).toBeInTheDocument()
  })
})
