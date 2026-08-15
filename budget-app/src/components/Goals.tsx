import { useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Goal, Settings } from '../lib/types'
import { formatMoney, parseAmount, toCents } from '../lib/money'
import { CATEGORICAL, STATUS, forMode } from '../lib/palette'
import { useDarkMode } from '../hooks/useDarkMode'
import { Button, Card, Empty, Field, Input } from './ui'

export function Goals({
  goals,
  settings,
  refresh,
}: {
  goals: Goal[]
  settings: Settings
  refresh: () => Promise<void>
}) {
  const dark = useDarkMode()
  const [name, setName] = useState('')
  const [target, setTarget] = useState('')
  const [targetDate, setTargetDate] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function addGoal(e: React.FormEvent) {
    e.preventDefault()
    const cents = parseAmount(target)
    if (!name.trim() || !cents) {
      setError('A goal needs a name and a target above zero.')
      return
    }
    const { error } = await supabase.from('budget_goals').insert({
      name: name.trim(),
      target_amount: cents / 100,
      target_date: targetDate || null,
    })
    if (error) {
      setError(error.message)
      return
    }
    setName('')
    setTarget('')
    setTargetDate('')
    setError(null)
    await refresh()
  }

  async function contribute(goal: Goal, deltaCents: number) {
    const next = Math.max(0, toCents(goal.saved_amount) + deltaCents)
    await supabase.from('budget_goals').update({ saved_amount: next / 100 }).eq('id', goal.id)
    await refresh()
  }

  async function remove(id: string) {
    await supabase.from('budget_goals').delete().eq('id', id)
    await refresh()
  }

  return (
    <div className="flex flex-col gap-6">
      <Card title="Savings goals">
        {goals.length === 0 ? (
          <Empty>No goals yet. Add one below — an emergency fund is a good first.</Empty>
        ) : (
          <ul className="flex flex-col gap-5">
            {goals.map((goal, i) => {
              const saved = toCents(goal.saved_amount)
              const targetCents = toCents(goal.target_amount)
              const ratio = targetCents > 0 ? saved / targetCents : 0
              const reached = saved >= targetCents
              const color = reached ? STATUS.good : forMode(CATEGORICAL[i % CATEGORICAL.length].light, dark)
              return (
                <li key={goal.id}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="flex items-center gap-2 text-sm font-medium">
                      {goal.name}
                      {reached && (
                        <span className="flex items-center gap-1 text-xs" style={{ color: STATUS.good }}>
                          <span aria-hidden="true">✓</span> Reached
                        </span>
                      )}
                    </span>
                    <span className="tabular text-sm text-ink-secondary">
                      {formatMoney(saved, settings.currency)}
                      <span className="text-ink-muted"> / {formatMoney(targetCents, settings.currency)}</span>
                    </span>
                  </div>

                  <div
                    className="mt-2 h-2 rounded-full bg-surface-2 overflow-hidden"
                    role="meter"
                    aria-valuenow={Math.round(ratio * 100)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`${goal.name} progress`}
                  >
                    <div
                      className="h-full rounded-full transition-[width]"
                      style={{ width: `${Math.min(ratio, 1) * 100}%`, background: color }}
                    />
                  </div>

                  <div className="mt-2 flex items-center gap-2 text-xs text-ink-muted">
                    <span className="tabular">
                      {reached
                        ? 'Done'
                        : `${formatMoney(targetCents - saved, settings.currency)} to go`}
                    </span>
                    {goal.target_date && <span>· by {goal.target_date}</span>}
                    <span className="ml-auto flex gap-1">
                      <ContributeButton onSubmit={(cents) => contribute(goal, cents)} />
                      <button
                        onClick={() => void remove(goal.id)}
                        className="px-2 py-1 rounded-md hover:text-critical"
                      >
                        Delete
                      </button>
                    </span>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      <Card title="New goal">
        <form onSubmit={addGoal} className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-end">
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Emergency fund" />
          </Field>
          <Field label="Target">
            <Input
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              inputMode="decimal"
              placeholder="3000"
              className="tabular"
            />
          </Field>
          <Field label="Target date (optional)">
            <Input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
          </Field>
          <Button type="submit" variant="primary">
            Add goal
          </Button>
          {error && <p className="sm:col-span-4 text-sm text-critical">{error}</p>}
        </form>
      </Card>
    </div>
  )
}

function ContributeButton({ onSubmit }: { onSubmit: (cents: number) => Promise<void> }) {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState('')

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="px-2 py-1 rounded-md hover:text-ink">
        Add money
      </button>
    )
  }
  return (
    <span className="flex items-center gap-1">
      <Input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        inputMode="decimal"
        placeholder="50"
        aria-label="Amount to add"
        className="w-20 tabular"
      />
      <Button
        onClick={async () => {
          const cents = parseAmount(value)
          if (cents) await onSubmit(cents)
          setValue('')
          setOpen(false)
        }}
      >
        Save
      </Button>
      <Button
        onClick={async () => {
          const cents = parseAmount(value)
          if (cents) await onSubmit(-cents)
          setValue('')
          setOpen(false)
        }}
      >
        Take out
      </Button>
    </span>
  )
}
