import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Category, Goal, Recurring, Settings, Transaction } from '../lib/types'
import { CATEGORICAL } from '../lib/palette'
import { isoDate } from '../lib/dates'

/** What a brand-new account starts with, so the first screen is never empty. */
const STARTER_CATEGORIES: { name: string; kind: 'expense' | 'income'; monthly_limit: number }[] = [
  { name: 'Groceries', kind: 'expense', monthly_limit: 400 },
  { name: 'Rent', kind: 'expense', monthly_limit: 1200 },
  { name: 'Transport', kind: 'expense', monthly_limit: 120 },
  { name: 'Eating out', kind: 'expense', monthly_limit: 150 },
  { name: 'Bills', kind: 'expense', monthly_limit: 250 },
  { name: 'Fun', kind: 'expense', monthly_limit: 120 },
  { name: 'Health', kind: 'expense', monthly_limit: 80 },
  { name: 'Savings', kind: 'expense', monthly_limit: 300 },
  { name: 'Income', kind: 'income', monthly_limit: 0 },
]

const DEFAULT_SETTINGS: Settings = { currency: 'USD', month_start_day: 1 }

/** Transactions older than this are outside every view the app renders. */
function historyStart(): string {
  const d = new Date()
  d.setMonth(d.getMonth() - 24)
  d.setDate(1)
  return isoDate(d)
}

export function useBudgetData(userId: string | undefined) {
  const [categories, setCategories] = useState<Category[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [goals, setGoals] = useState<Goal[]>([])
  const [recurring, setRecurring] = useState<Recurring[]>([])
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!userId) return
    setError(null)
    const [cats, txs, gls, recs, setts] = await Promise.all([
      supabase.from('budget_categories').select('*').order('sort_order'),
      supabase
        .from('budget_transactions')
        .select('*')
        .gte('occurred_on', historyStart())
        .order('occurred_on', { ascending: false })
        .order('created_at', { ascending: false }),
      supabase.from('budget_goals').select('*').order('created_at'),
      supabase.from('budget_recurring').select('*').order('day_of_month'),
      supabase.from('budget_settings').select('*').maybeSingle(),
    ])

    const failure = [cats, txs, gls, recs, setts].find((r) => r.error)
    if (failure?.error) {
      setError(failure.error.message)
      setLoading(false)
      return
    }

    let categoryRows = (cats.data ?? []) as Category[]
    if (categoryRows.length === 0) {
      const seeded = await supabase
        .from('budget_categories')
        .insert(
          STARTER_CATEGORIES.map((c, i) => ({
            ...c,
            color: CATEGORICAL[i % CATEGORICAL.length].light,
            sort_order: i,
          })),
        )
        .select()
      if (seeded.error) setError(seeded.error.message)
      else categoryRows = (seeded.data ?? []) as Category[]
    }

    if (!setts.data) {
      const created = await supabase.from('budget_settings').insert(DEFAULT_SETTINGS).select().maybeSingle()
      setSettings((created.data as Settings) ?? DEFAULT_SETTINGS)
    } else {
      setSettings(setts.data as Settings)
    }

    setCategories(categoryRows)
    setTransactions((txs.data ?? []) as Transaction[])
    setGoals((gls.data ?? []) as Goal[])
    setRecurring((recs.data ?? []) as Recurring[])
    setLoading(false)
  }, [userId])

  useEffect(() => {
    if (!userId) {
      setLoading(false)
      return
    }
    setLoading(true)
    void refresh()
  }, [userId, refresh])

  return {
    userId,
    categories,
    transactions,
    goals,
    recurring,
    settings,
    loading,
    error,
    setError,
    refresh,
  }
}
