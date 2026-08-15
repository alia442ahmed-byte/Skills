import { useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Category, Settings, Transaction } from '../lib/types'
import { formatMoney, parseAmount, toCents } from '../lib/money'
import { formatDay } from '../lib/dates'
import { CATEGORICAL } from '../lib/palette'
import { useDarkMode } from '../hooks/useDarkMode'
import { Button, Card, Dot, Empty, Input, Select } from './ui'

export function TransactionList({
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
  const [query, setQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState({ amount: '', note: '', category_id: '', occurred_on: '' })

  const byId = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories])

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return monthTxs.filter((t) => {
      if (typeFilter && t.type !== typeFilter) return false
      if (categoryFilter && t.category_id !== categoryFilter) return false
      if (!needle) return true
      const name = t.category_id ? (byId.get(t.category_id)?.name ?? '') : ''
      return t.note.toLowerCase().includes(needle) || name.toLowerCase().includes(needle)
    })
  }, [monthTxs, query, categoryFilter, typeFilter, byId])

  const shownTotal = rows.reduce(
    (sum, t) => sum + (t.type === 'income' ? toCents(t.amount) : -toCents(t.amount)),
    0,
  )

  async function remove(id: string) {
    await supabase.from('budget_transactions').delete().eq('id', id)
    await refresh()
  }

  async function saveEdit(id: string) {
    const cents = parseAmount(draft.amount)
    setEditing(null)
    await supabase
      .from('budget_transactions')
      .update({
        amount: cents ? cents / 100 : undefined,
        note: draft.note.trim(),
        category_id: draft.category_id || null,
        occurred_on: draft.occurred_on,
      })
      .eq('id', id)
    await refresh()
  }

  return (
    <Card
      title={`${rows.length} ${rows.length === 1 ? 'entry' : 'entries'}`}
      action={
        <span className="tabular text-sm text-ink-secondary">
          Net {formatMoney(shownTotal, settings.currency, { sign: true })}
        </span>
      }
    >
      {/* Filters live in one row above the data. */}
      <div className="flex flex-wrap gap-2 mb-4">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search notes and categories"
          aria-label="Search transactions"
          className="flex-1 min-w-48"
        />
        <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} aria-label="Filter by type">
          <option value="">All types</option>
          <option value="expense">Spending</option>
          <option value="income">Income</option>
        </Select>
        <Select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          aria-label="Filter by category"
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </div>

      {rows.length === 0 ? (
        <Empty>Nothing here for this month yet.</Empty>
      ) : (
        <ul className="divide-y divide-hairline">
          {rows.map((t) => {
            const category = t.category_id ? byId.get(t.category_id) : undefined
            const color = category ? dotColor(category.color, dark) : '#898781'

            if (editing === t.id) {
              return (
                <li key={t.id} className="py-3 grid gap-2 sm:grid-cols-[auto_1fr_1fr_auto_auto] sm:items-center">
                  <Input
                    type="date"
                    value={draft.occurred_on}
                    onChange={(e) => setDraft({ ...draft, occurred_on: e.target.value })}
                    aria-label="Date"
                  />
                  <Input
                    value={draft.note}
                    onChange={(e) => setDraft({ ...draft, note: e.target.value })}
                    placeholder="Note"
                    aria-label="Note"
                  />
                  <Select
                    value={draft.category_id}
                    onChange={(e) => setDraft({ ...draft, category_id: e.target.value })}
                    aria-label="Category"
                  >
                    <option value="">Uncategorized</option>
                    {categories
                      .filter((c) => c.kind === t.type)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                  </Select>
                  <Input
                    value={draft.amount}
                    onChange={(e) => setDraft({ ...draft, amount: e.target.value })}
                    inputMode="decimal"
                    aria-label="Amount"
                    className="w-24 tabular"
                  />
                  <Button variant="primary" onClick={() => void saveEdit(t.id)}>
                    Save
                  </Button>
                </li>
              )
            }

            return (
              <li key={t.id} className="py-3 flex items-center gap-3">
                <span className="w-14 shrink-0 text-xs text-ink-muted tabular">
                  {formatDay(t.occurred_on)}
                </span>
                <Dot color={color} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{t.note || category?.name || 'Uncategorized'}</span>
                  <span className="block text-xs text-ink-muted">
                    {category?.name ?? 'Uncategorized'}
                    {t.source === 'csv' && ' · imported'}
                    {t.source === 'recurring' && ' · recurring'}
                  </span>
                </span>
                <span
                  className={`tabular text-sm ${t.type === 'income' ? 'text-success-text' : 'text-ink'}`}
                >
                  {formatMoney(t.type === 'income' ? toCents(t.amount) : -toCents(t.amount), settings.currency, {
                    sign: true,
                  })}
                </span>
                <button
                  onClick={() => {
                    setEditing(t.id)
                    setDraft({
                      amount: String(t.amount),
                      note: t.note,
                      category_id: t.category_id ?? '',
                      occurred_on: t.occurred_on,
                    })
                  }}
                  className="text-xs text-ink-muted hover:text-ink px-1"
                >
                  Edit
                </button>
                <button
                  onClick={() => void remove(t.id)}
                  className="text-xs text-ink-muted hover:text-critical px-1"
                  aria-label={`Delete ${t.note || 'transaction'}`}
                >
                  Delete
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}

function dotColor(lightHex: string, dark: boolean): string {
  if (!dark) return lightHex
  return CATEGORICAL.find((c) => c.light.toLowerCase() === lightHex.toLowerCase())?.dark ?? lightHex
}
