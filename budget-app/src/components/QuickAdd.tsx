import { useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Category, TxType } from '../lib/types'
import { parseAmount } from '../lib/money'
import { todayISO } from '../lib/dates'
import { Button, Field, Input, Select } from './ui'

export function QuickAdd({
  categories,
  refresh,
}: {
  categories: Category[]
  refresh: () => Promise<void>
}) {
  const [type, setType] = useState<TxType>('expense')
  const [amount, setAmount] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [occurredOn, setOccurredOn] = useState(todayISO)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const options = categories.filter((c) => c.kind === type)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const cents = parseAmount(amount)
    if (!cents) {
      setError('Enter an amount greater than zero.')
      return
    }
    setBusy(true)
    setError(null)
    const { error } = await supabase.from('budget_transactions').insert({
      occurred_on: occurredOn,
      amount: cents / 100,
      type,
      category_id: categoryId || options[0]?.id || null,
      note: note.trim(),
      source: 'manual',
    })
    setBusy(false)
    if (error) {
      setError(error.message)
      return
    }
    setAmount('')
    setNote('')
    await refresh()
  }

  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-[auto_1fr_1fr_1fr_auto] sm:items-end">
      <Field label="Type">
        <Select
          aria-label="Type"
          value={type}
          onChange={(e) => {
            setType(e.target.value as TxType)
            setCategoryId('')
          }}
        >
          <option value="expense">Spent</option>
          <option value="income">Received</option>
        </Select>
      </Field>

      <Field label="Amount">
        <Input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          inputMode="decimal"
          placeholder="0.00"
          aria-label="Amount"
          className="tabular"
        />
      </Field>

      <Field label="Category">
        <Select aria-label="Category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">{options[0]?.name ?? 'Uncategorized'}</option>
          {options.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Date">
        <Input type="date" value={occurredOn} onChange={(e) => setOccurredOn(e.target.value)} />
      </Field>

      <Button type="submit" variant="primary" disabled={busy}>
        {busy ? 'Adding…' : 'Add'}
      </Button>

      <div className="sm:col-span-5">
        <Field label="Note (optional)">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="What was it for?" />
        </Field>
      </div>

      {error && (
        <p role="alert" className="sm:col-span-5 text-sm text-critical">
          {error}
        </p>
      )}
    </form>
  )
}
