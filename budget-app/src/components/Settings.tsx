import { useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Settings } from '../lib/types'
import { Button, Card, Field, Select } from './ui'

const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'AED', 'EGP', 'INR', 'JPY', 'SAR']

export function SettingsPanel({
  settings,
  userId,
  refresh,
}: {
  settings: Settings
  userId: string | undefined
  refresh: () => Promise<void>
}) {
  const [currency, setCurrency] = useState(settings.currency)
  const [monthStartDay, setMonthStartDay] = useState(settings.month_start_day)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!userId) return
    const { error } = await supabase
      .from('budget_settings')
      .upsert({ user_id: userId, currency, month_start_day: monthStartDay })
    if (error) {
      setError(error.message)
      return
    }
    setError(null)
    setSaved(true)
    await refresh()
  }

  return (
    <Card title="Settings">
      <form onSubmit={save} className="grid gap-4 sm:grid-cols-2 max-w-lg">
        <Field label="Currency">
          <Select aria-label="Currency" value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Budget month starts on">
          <Select aria-label="Budget month starts on" value={monthStartDay} onChange={(e) => setMonthStartDay(Number(e.target.value))}>
            {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
              <option key={d} value={d}>
                {d === 1 ? '1st (calendar month)' : `${d}${ordinal(d)}`}
              </option>
            ))}
          </Select>
        </Field>

        <div className="sm:col-span-2 flex items-center gap-3">
          <Button type="submit" variant="primary">
            Save
          </Button>
          {saved && <span className="text-sm text-success-text">Saved</span>}
          {error && <span className="text-sm text-critical">{error}</span>}
        </div>

        <p className="sm:col-span-2 text-xs text-ink-muted">
          Set the start day to your payday to budget in pay cycles instead of calendar months.
        </p>
      </form>
    </Card>
  )
}

function ordinal(d: number): string {
  if (d % 10 === 1 && d !== 11) return 'st'
  if (d % 10 === 2 && d !== 12) return 'nd'
  if (d % 10 === 3 && d !== 13) return 'rd'
  return 'th'
}
