import { useMemo } from 'react'
import type { Category, Settings, Transaction } from '../lib/types'
import { categoryRollups, monthTotals } from '../lib/budget'
import { useDarkMode } from '../hooks/useDarkMode'
import { SummaryTiles } from './SummaryTiles'
import { QuickAdd } from './QuickAdd'
import { AddCategory, CategoryBudgets } from './CategoryBudgets'
import { Card } from './ui'

export function Dashboard({
  categories,
  monthTxs,
  settings,
  refresh,
}: {
  categories: Category[]
  monthTxs: Transaction[]
  settings: Settings
  refresh: () => Promise<void>
}) {
  const dark = useDarkMode()
  const totals = useMemo(() => monthTotals(monthTxs, categories), [monthTxs, categories])
  const rollups = useMemo(() => categoryRollups(monthTxs, categories), [monthTxs, categories])

  return (
    <div className="flex flex-col gap-6">
      <SummaryTiles totals={totals} currency={settings.currency} />

      <Card title="Add something">
        <QuickAdd categories={categories} refresh={refresh} />
      </Card>

      <Card
        title="This month's budgets"
        action={<span className="text-xs text-ink-muted">Click an amount to set its limit</span>}
      >
        <CategoryBudgets
          rollups={rollups}
          currency={settings.currency}
          refresh={refresh}
          dark={dark}
        />
        <div className="mt-5 pt-4 border-t border-hairline">
          <AddCategory refresh={refresh} count={categories.length} />
        </div>
      </Card>
    </div>
  )
}
