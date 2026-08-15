import { useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Category, Recurring, Settings, TxType } from '../lib/types'
import { formatMoney, parseAmount } from '../lib/money'
import { dayInMonth, formatDay, monthLabel } from '../lib/dates'
import { Button, Card, Empty, Field, Input, Select } from './ui'

/**
 * Bills are never inserted behind the user's back — an unposted bill for the month
 * on screen is offered as a one-click post, then stamped so it can't post twice.
 */
export function RecurringBills({
  recurring,
  categories,
  settings,
  monthKey,
  refresh,
}: {
  recurring: Recurring[]
  categories: Category[]
  settings: Settings
  monthKey: string
  refresh: () => Promise<void>
}) {
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const due = recurring.filter((r) => r.active && r.last_posted_month !== monthKey)

  async function post(bill: Recurring) {
    setBusy(bill.id)
    setError(null)
    const occurredOn = dayInMonth(monthKey, bill.day_of_month)
    const { error: txError } = await supabase.from('budget_transactions').insert({
      occurred_on: occurredOn,
      amount: bill.amount,
      type: bill.type,
      category_id: bill.category_id,
      note: bill.name,
      source: 'recurring',
      // Same identity trick as CSV import: re-posting the same bill for the same
      // month hits the unique index instead of duplicating the charge.
      import_hash: `recurring_${bill.id}_${monthKey}`,
    })
    if (txError && txError.code !== '23505') {
      setBusy(null)
      setError(txError.message)
      return
    }
    await supabase.from('budget_recurring').update({ last_posted_month: monthKey }).eq('id', bill.id)
    setBusy(null)
    await refresh()
  }

  async function postAll() {
    for (const bill of due) await post(bill)
  }

  async function toggle(bill: Recurring) {
    await supabase.from('budget_recurring').update({ active: !bill.active }).eq('id', bill.id)
    await refresh()
  }

  async function remove(id: string) {
    await supabase.from('budget_recurring').delete().eq('id', id)
    await refresh()
  }

  const byId = new Map(categories.map((c) => [c.id, c]))

  return (
    <div className="flex flex-col gap-6">
      <Card
        title={`Recurring bills`}
        action={
          due.length > 0 ? (
            <Button variant="primary" onClick={() => void postAll()}>
              Post {due.length} due for {monthLabel(monthKey, settings.month_start_day)}
            </Button>
          ) : (
            <span className="text-xs text-ink-muted">All posted for this month</span>
          )
        }
      >
        {error && (
          <p role="alert" className="mb-3 text-sm text-critical">
            {error}
          </p>
        )}
        {recurring.length === 0 ? (
          <Empty>No recurring bills yet. Add rent, subscriptions, or anything that repeats.</Empty>
        ) : (
          <ul className="divide-y divide-hairline">
            {recurring.map((bill) => {
              const posted = bill.last_posted_month === monthKey
              return (
                <li key={bill.id} className="py-3 flex items-center gap-3">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {bill.name}
                      {!bill.active && <span className="ml-2 text-xs text-ink-muted">paused</span>}
                    </span>
                    <span className="block text-xs text-ink-muted">
                      {byId.get(bill.category_id ?? '')?.name ?? 'Uncategorized'} · every month on the{' '}
                      {formatDay(dayInMonth(monthKey, bill.day_of_month))}
                    </span>
                  </span>
                  <span className="tabular text-sm">{formatMoney(parseAmount(String(bill.amount)) ?? 0, settings.currency)}</span>
                  {bill.active &&
                    (posted ? (
                      <span className="text-xs text-ink-muted whitespace-nowrap">✓ posted</span>
                    ) : (
                      <Button onClick={() => void post(bill)} disabled={busy === bill.id}>
                        {busy === bill.id ? 'Posting…' : 'Post'}
                      </Button>
                    ))}
                  <button onClick={() => void toggle(bill)} className="text-xs text-ink-muted hover:text-ink px-1">
                    {bill.active ? 'Pause' : 'Resume'}
                  </button>
                  <button
                    onClick={() => void remove(bill.id)}
                    className="text-xs text-ink-muted hover:text-critical px-1"
                  >
                    Delete
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      <NewBill categories={categories} refresh={refresh} />
    </div>
  )
}

function NewBill({ categories, refresh }: { categories: Category[]; refresh: () => Promise<void> }) {
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [type, setType] = useState<TxType>('expense')
  const [categoryId, setCategoryId] = useState('')
  const [day, setDay] = useState('1')
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const cents = parseAmount(amount)
    if (!name.trim() || !cents) {
      setError('A bill needs a name and an amount above zero.')
      return
    }
    const { error } = await supabase.from('budget_recurring').insert({
      name: name.trim(),
      amount: cents / 100,
      type,
      category_id: categoryId || null,
      day_of_month: Math.min(31, Math.max(1, Number(day) || 1)),
    })
    if (error) {
      setError(error.message)
      return
    }
    setName('')
    setAmount('')
    setError(null)
    await refresh()
  }

  return (
    <Card title="New recurring bill">
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr_1fr_auto] sm:items-end">
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Rent" />
        </Field>
        <Field label="Amount">
          <Input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            placeholder="1200"
            className="tabular"
          />
        </Field>
        <Field label="Type">
          <Select aria-label="Type" value={type} onChange={(e) => setType(e.target.value as TxType)}>
            <option value="expense">Spending</option>
            <option value="income">Income</option>
          </Select>
        </Field>
        <Field label="Day of month">
          <Input
            type="number"
            min={1}
            max={31}
            value={day}
            onChange={(e) => setDay(e.target.value)}
            className="tabular"
          />
        </Field>
        <Button type="submit" variant="primary">
          Add bill
        </Button>

        <div className="sm:col-span-5">
          <Field label="Category">
            <Select aria-label="Category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">Uncategorized</option>
              {categories
                .filter((c) => c.kind === type)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </Select>
          </Field>
        </div>
        {error && <p className="sm:col-span-5 text-sm text-critical">{error}</p>}
      </form>
    </Card>
  )
}
