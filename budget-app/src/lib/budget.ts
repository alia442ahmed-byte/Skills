import type { Category, Transaction } from './types'
import { toCents } from './money'
import { monthKeyFor, monthRange, parseISO } from './dates'

export interface CategoryRollup {
  category: Category
  spentCents: number
  limitCents: number
  remainingCents: number
  /** 0..1+ — can exceed 1 when over budget. */
  ratio: number
  state: 'none' | 'ok' | 'warning' | 'over'
}

export interface MonthTotals {
  incomeCents: number
  expenseCents: number
  netCents: number
  budgetedCents: number
  leftToSpendCents: number
}

export function transactionsInMonth(txs: Transaction[], monthKey: string): Transaction[] {
  const { start, endExclusive } = monthRange(monthKey)
  return txs.filter((t) => t.occurred_on >= start && t.occurred_on < endExclusive)
}

export function monthTotals(txs: Transaction[], categories: Category[]): MonthTotals {
  let incomeCents = 0
  let expenseCents = 0
  for (const t of txs) {
    const cents = toCents(t.amount)
    if (t.type === 'income') incomeCents += cents
    else expenseCents += cents
  }
  const budgetedCents = categories
    .filter((c) => c.kind === 'expense')
    .reduce((sum, c) => sum + toCents(c.monthly_limit), 0)
  return {
    incomeCents,
    expenseCents,
    netCents: incomeCents - expenseCents,
    budgetedCents,
    leftToSpendCents: budgetedCents - expenseCents,
  }
}

/** Per-category spend for one month, ordered by the category's own sort order. */
export function categoryRollups(txs: Transaction[], categories: Category[]): CategoryRollup[] {
  const spent = new Map<string, number>()
  for (const t of txs) {
    if (t.type !== 'expense' || !t.category_id) continue
    spent.set(t.category_id, (spent.get(t.category_id) ?? 0) + toCents(t.amount))
  }
  return categories
    .filter((c) => c.kind === 'expense')
    .map((category) => {
      const spentCents = spent.get(category.id) ?? 0
      const limitCents = toCents(category.monthly_limit)
      const ratio = limitCents > 0 ? spentCents / limitCents : 0
      return {
        category,
        spentCents,
        limitCents,
        remainingCents: limitCents - spentCents,
        ratio,
        state: budgetState(limitCents, ratio),
      }
    })
    .sort((a, b) => a.category.sort_order - b.category.sort_order)
}

function budgetState(limitCents: number, ratio: number): CategoryRollup['state'] {
  if (limitCents <= 0) return 'none'
  if (ratio > 1) return 'over'
  if (ratio >= 0.85) return 'warning'
  return 'ok'
}

export interface TrendPoint {
  monthKey: string
  incomeCents: number
  expenseCents: number
}

/** Income vs. spending for the last `count` budget months, oldest first. */
export function monthlyTrend(
  txs: Transaction[],
  count: number,
  monthStartDay: number,
): TrendPoint[] {
  const buckets = new Map<string, TrendPoint>()
  for (const t of txs) {
    const key = monthKeyFor(parseISO(t.occurred_on), monthStartDay)
    let point = buckets.get(key)
    if (!point) {
      point = { monthKey: key, incomeCents: 0, expenseCents: 0 }
      buckets.set(key, point)
    }
    const cents = toCents(t.amount)
    if (t.type === 'income') point.incomeCents += cents
    else point.expenseCents += cents
  }
  return [...buckets.values()]
    .sort((a, b) => a.monthKey.localeCompare(b.monthKey))
    .slice(-count)
}

export interface CategorySlice {
  id: string
  name: string
  color: string
  cents: number
}

/**
 * Spending by category for a donut. Small categories past `max` fold into a single
 * "Other" slice rather than generating new hues.
 */
export function spendByCategory(
  txs: Transaction[],
  categories: Category[],
  max = 7,
): CategorySlice[] {
  const byId = new Map(categories.map((c) => [c.id, c]))
  const totals = new Map<string, number>()
  for (const t of txs) {
    if (t.type !== 'expense') continue
    const key = t.category_id ?? 'uncategorized'
    totals.set(key, (totals.get(key) ?? 0) + toCents(t.amount))
  }
  const slices: CategorySlice[] = [...totals.entries()]
    .map(([id, cents]) => {
      const category = byId.get(id)
      return {
        id,
        name: category?.name ?? 'Uncategorized',
        color: category?.color ?? '#898781',
        cents,
      }
    })
    .filter((s) => s.cents > 0)
    .sort((a, b) => b.cents - a.cents)

  if (slices.length <= max) return slices
  const head = slices.slice(0, max)
  const restCents = slices.slice(max).reduce((sum, s) => sum + s.cents, 0)
  return [...head, { id: 'other', name: 'Other', color: '#898781', cents: restCents }]
}
