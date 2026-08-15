import { useState } from 'react'
import { supabase } from '../lib/supabase'
import type { CategoryRollup } from '../lib/budget'
import type { Category } from '../lib/types'
import { formatMoney, parseAmount } from '../lib/money'
import { CATEGORICAL, STATUS } from '../lib/palette'
import { Button, Dot, Empty, Input, Select } from './ui'

/** Status colors never carry meaning alone — each state ships an icon and a label. */
const STATE_CUE: Record<CategoryRollup['state'], { icon: string; label: string; color: string } | null> = {
  none: null,
  ok: null,
  warning: { icon: '▲', label: 'Close to limit', color: STATUS.warning },
  over: { icon: '●', label: 'Over budget', color: STATUS.critical },
}

export function CategoryBudgets({
  rollups,
  currency,
  refresh,
  dark,
}: {
  rollups: CategoryRollup[]
  currency: string
  refresh: () => Promise<void>
  dark: boolean
}) {
  const [editing, setEditing] = useState<string | null>(null)
  const [draftLimit, setDraftLimit] = useState('')

  async function saveLimit(category: Category) {
    const cents = parseAmount(draftLimit) ?? 0
    setEditing(null)
    await supabase.from('budget_categories').update({ monthly_limit: cents / 100 }).eq('id', category.id)
    await refresh()
  }

  if (rollups.length === 0) return <Empty>No spending categories yet.</Empty>

  return (
    <ul className="flex flex-col gap-4">
      {rollups.map((r) => {
        const cue = STATE_CUE[r.state]
        const barColor =
          r.state === 'over' ? STATUS.critical : dark ? colorFor(r.category.color) : r.category.color
        const width = r.limitCents > 0 ? Math.min(r.ratio, 1) * 100 : 0

        return (
          <li key={r.category.id}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="flex items-center gap-2 min-w-0">
                <Dot color={dark ? colorFor(r.category.color) : r.category.color} />
                <span className="truncate font-medium">{r.category.name}</span>
                {cue && (
                  <span className="flex items-center gap-1 text-xs" style={{ color: cue.color }}>
                    <span aria-hidden="true">{cue.icon}</span>
                    {cue.label}
                  </span>
                )}
              </span>

              {editing === r.category.id ? (
                <span className="flex items-center gap-2">
                  <Input
                    autoFocus
                    value={draftLimit}
                    onChange={(e) => setDraftLimit(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && void saveLimit(r.category)}
                    inputMode="decimal"
                    aria-label={`Monthly limit for ${r.category.name}`}
                    className="w-24 tabular"
                  />
                  <Button onClick={() => void saveLimit(r.category)}>Save</Button>
                </span>
              ) : (
                <button
                  onClick={() => {
                    setEditing(r.category.id)
                    setDraftLimit(String(r.category.monthly_limit))
                  }}
                  className="tabular text-ink-secondary hover:text-ink whitespace-nowrap"
                  title="Edit monthly limit"
                >
                  {formatMoney(r.spentCents, currency)}
                  {r.limitCents > 0 && (
                    <span className="text-ink-muted"> / {formatMoney(r.limitCents, currency)}</span>
                  )}
                </button>
              )}
            </div>

            <div
              className="mt-2 h-2 rounded-full bg-surface-2 overflow-hidden"
              role="meter"
              aria-valuenow={Math.round(r.ratio * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${r.category.name} budget used`}
            >
              <div
                className="h-full rounded-full transition-[width]"
                style={{ width: `${width}%`, background: barColor }}
              />
            </div>

            <p className="mt-1 text-xs text-ink-muted tabular">
              {r.limitCents === 0
                ? 'No limit set — click the amount to set one'
                : r.remainingCents >= 0
                  ? `${formatMoney(r.remainingCents, currency)} left`
                  : `${formatMoney(-r.remainingCents, currency)} over`}
            </p>
          </li>
        )
      })}
    </ul>
  )
}

function colorFor(lightHex: string): string {
  const slot = CATEGORICAL.find((c) => c.light.toLowerCase() === lightHex.toLowerCase())
  return slot?.dark ?? lightHex
}

export function AddCategory({ refresh, count }: { refresh: () => Promise<void>; count: number }) {
  const [name, setName] = useState('')
  const [kind, setKind] = useState<'expense' | 'income'>('expense')
  const [limit, setLimit] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    const { error } = await supabase.from('budget_categories').insert({
      name: name.trim(),
      kind,
      monthly_limit: (parseAmount(limit) ?? 0) / 100,
      // Colors are assigned in fixed slot order, never by rank.
      color: CATEGORICAL[count % CATEGORICAL.length].light,
      sort_order: count,
    })
    if (error) {
      setError(error.message)
      return
    }
    setName('')
    setLimit('')
    setError(null)
    await refresh()
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-2">
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="New category"
        aria-label="New category name"
        className="flex-1 min-w-40"
      />
      <Select value={kind} onChange={(e) => setKind(e.target.value as 'expense' | 'income')} aria-label="Kind">
        <option value="expense">Spending</option>
        <option value="income">Income</option>
      </Select>
      <Input
        value={limit}
        onChange={(e) => setLimit(e.target.value)}
        placeholder="Limit"
        inputMode="decimal"
        aria-label="Monthly limit"
        className="w-24 tabular"
      />
      <Button type="submit">Add</Button>
      {error && <p className="w-full text-sm text-critical">{error}</p>}
    </form>
  )
}
