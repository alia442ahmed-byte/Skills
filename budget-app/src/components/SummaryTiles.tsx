import type { MonthTotals } from '../lib/budget'
import { formatMoney } from '../lib/money'

/**
 * Four hero figures. No plot here, so no hover layer — these are stat tiles.
 * Proportional figures for standalone numbers, per the type rule.
 */
export function SummaryTiles({ totals, currency }: { totals: MonthTotals; currency: string }) {
  const tiles = [
    { label: 'Money in', value: formatMoney(totals.incomeCents, currency), tone: 'text-ink' },
    { label: 'Money out', value: formatMoney(totals.expenseCents, currency), tone: 'text-ink' },
    {
      label: 'Net this month',
      value: formatMoney(totals.netCents, currency, { sign: true }),
      tone: totals.netCents >= 0 ? 'text-success-text' : 'text-critical',
    },
    {
      label: 'Left to spend',
      value: formatMoney(totals.leftToSpendCents, currency, { sign: true }),
      tone: totals.leftToSpendCents >= 0 ? 'text-ink' : 'text-critical',
      hint:
        totals.budgetedCents === 0
          ? 'Set category limits to track this'
          : `of ${formatMoney(totals.budgetedCents, currency)} budgeted`,
    },
  ]

  return (
    <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
      {tiles.map((t) => (
        <div key={t.label} className="rounded-xl bg-surface ring-1 ring-hairline p-4">
          <p className="text-xs font-medium text-ink-secondary">{t.label}</p>
          <p className={`mt-1 text-2xl font-semibold tracking-tight ${t.tone}`}>{t.value}</p>
          {t.hint && <p className="mt-1 text-xs text-ink-muted">{t.hint}</p>}
        </div>
      ))}
    </div>
  )
}
