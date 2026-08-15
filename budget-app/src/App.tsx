import { useMemo, useState } from 'react'
import { useAuth } from './hooks/useAuth'
import { useBudgetData } from './hooks/useBudgetData'
import { AuthGate } from './components/AuthGate'
import { Dashboard } from './components/Dashboard'
import { TransactionList } from './components/TransactionList'
import { Charts } from './components/Charts'
import { Goals } from './components/Goals'
import { RecurringBills } from './components/Recurring'
import { CsvImport } from './components/CsvImport'
import { SettingsPanel } from './components/Settings'
import { Button } from './components/ui'
import { monthKeyFor, monthLabel, shiftMonth } from './lib/dates'
import { transactionsInMonth } from './lib/budget'

const TABS = ['Dashboard', 'Transactions', 'Charts', 'Goals', 'Bills', 'Import', 'Settings'] as const
type Tab = (typeof TABS)[number]

export default function App() {
  const auth = useAuth()
  const data = useBudgetData(auth.user?.id)
  const [tab, setTab] = useState<Tab>('Dashboard')
  const [monthKey, setMonthKey] = useState(() => monthKeyFor(new Date()))

  const monthTxs = useMemo(
    () => transactionsInMonth(data.transactions, monthKey),
    [data.transactions, monthKey],
  )

  if (auth.loading) {
    return <main className="min-h-full grid place-items-center text-sm text-ink-muted">Loading…</main>
  }
  if (!auth.session) return <AuthGate auth={auth} />

  const shared = { ...data, monthKey, monthTxs }

  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-10 bg-plane/90 backdrop-blur border-b border-hairline">
        <div className="mx-auto max-w-5xl px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <h1 className="text-base font-semibold tracking-tight">Budget</h1>
            <div className="flex items-center gap-1">
              <button
                aria-label="Previous month"
                onClick={() => setMonthKey(shiftMonth(monthKey, -1))}
                className="size-7 rounded-md hover:bg-surface-2 text-ink-secondary"
              >
                ‹
              </button>
              <span className="text-sm text-ink-secondary min-w-36 text-center">
                {monthLabel(monthKey, data.settings.month_start_day)}
              </span>
              <button
                aria-label="Next month"
                onClick={() => setMonthKey(shiftMonth(monthKey, 1))}
                className="size-7 rounded-md hover:bg-surface-2 text-ink-secondary"
              >
                ›
              </button>
            </div>
          </div>
          <Button onClick={() => void auth.signOut()}>Sign out</Button>
        </div>

        <nav className="mx-auto max-w-5xl px-4 pb-2 flex gap-1 overflow-x-auto" aria-label="Sections">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              aria-current={tab === t ? 'page' : undefined}
              className={`rounded-lg px-3 py-1.5 text-sm whitespace-nowrap transition ${
                tab === t ? 'bg-surface text-ink ring-1 ring-hairline' : 'text-ink-secondary hover:text-ink'
              }`}
            >
              {t}
            </button>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">
        {data.error && (
          <p role="alert" className="mb-4 rounded-lg bg-surface p-3 text-sm text-critical ring-1 ring-hairline">
            {data.error}
          </p>
        )}
        {data.loading ? (
          <p className="text-sm text-ink-muted">Loading your money…</p>
        ) : (
          <>
            {tab === 'Dashboard' && <Dashboard {...shared} />}
            {tab === 'Transactions' && <TransactionList {...shared} />}
            {tab === 'Charts' && <Charts {...shared} />}
            {tab === 'Goals' && <Goals {...data} />}
            {tab === 'Bills' && <RecurringBills {...shared} />}
            {tab === 'Import' && <CsvImport {...data} />}
            {tab === 'Settings' && <SettingsPanel {...data} />}
          </>
        )}
      </main>
    </div>
  )
}
