import { useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Category, Settings } from '../lib/types'
import {
  buildDrafts,
  guessMapping,
  parseCsv,
  type ColumnMapping,
  type DraftTransaction,
  type ParsedCsv,
} from '../lib/csv'
import { formatMoney, toCents } from '../lib/money'
import { formatDay } from '../lib/dates'
import { Button, Card, Field, Select } from './ui'

export function CsvImport({
  categories,
  settings,
  refresh,
}: {
  categories: Category[]
  settings: Settings
  refresh: () => Promise<void>
}) {
  const [parsed, setParsed] = useState<ParsedCsv | null>(null)
  const [mapping, setMapping] = useState<ColumnMapping | null>(null)
  const [dayFirst, setDayFirst] = useState(false)
  const [fileName, setFileName] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ inserted: number; skipped: number; failed: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const drafts: DraftTransaction[] = useMemo(
    () => (parsed && mapping ? buildDrafts(parsed.rows, mapping, categories, dayFirst) : []),
    [parsed, mapping, categories, dayFirst],
  )
  const importable = drafts.filter((d) => !d.error)
  const broken = drafts.filter((d) => d.error)

  async function onFile(file: File) {
    setError(null)
    setResult(null)
    setFileName(file.name)
    const text = await file.text()
    const next = parseCsv(text)
    if (next.rows.length === 0) {
      setError('That file has no readable rows.')
      setParsed(null)
      return
    }
    setParsed(next)
    setMapping(guessMapping(next.headers))
  }

  async function runImport() {
    if (importable.length === 0) return
    setBusy(true)
    setError(null)

    // The unique index on (user_id, import_hash) is what actually prevents
    // double-counting; ignoreDuplicates turns a repeat import into a no-op.
    const rows = importable.map((d) => ({
      occurred_on: d.occurred_on,
      amount: d.amount,
      type: d.type,
      category_id: d.category_id,
      note: d.note,
      source: 'csv' as const,
      import_hash: d.import_hash,
    }))

    const { data, error } = await supabase
      .from('budget_transactions')
      .upsert(rows, { onConflict: 'user_id,import_hash', ignoreDuplicates: true })
      .select('id')

    setBusy(false)
    if (error) {
      setError(error.message)
      return
    }
    const inserted = data?.length ?? 0
    setResult({ inserted, skipped: importable.length - inserted, failed: broken.length })
    await refresh()
  }

  function reset() {
    setParsed(null)
    setMapping(null)
    setFileName('')
    setResult(null)
    setError(null)
  }

  return (
    <div className="flex flex-col gap-6">
      <Card title="Import a bank CSV">
        <p className="text-sm text-ink-secondary mb-4">
          Export a statement from your bank as CSV and drop it here. Rows you have already
          imported are recognised and skipped, so re-importing an overlapping statement is safe.
        </p>

        <label
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            const file = e.dataTransfer.files?.[0]
            if (file) void onFile(file)
          }}
          className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-axis p-8 cursor-pointer hover:bg-surface-2 transition"
        >
          <span className="text-sm font-medium">{fileName || 'Choose a CSV file'}</span>
          <span className="text-xs text-ink-muted">or drag one onto this box</span>
          <input
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void onFile(file)
            }}
          />
        </label>

        {error && (
          <p role="alert" className="mt-4 text-sm text-critical">
            {error}
          </p>
        )}

        {result && (
          <div className="mt-4 rounded-lg bg-surface-2 p-3 text-sm">
            <p className="font-medium">
              {result.inserted} imported
              {result.skipped > 0 && `, ${result.skipped} already there`}
              {result.failed > 0 && `, ${result.failed} unreadable`}
            </p>
            <Button className="mt-2" onClick={reset}>
              Import another file
            </Button>
          </div>
        )}
      </Card>

      {parsed && mapping && !result && (
        <>
          <Card title="Match up the columns">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Date column">
                <Select
                  aria-label="Date column"
                  value={mapping.date}
                  onChange={(e) => setMapping({ ...mapping, date: e.target.value })}
                >
                  {parsed.headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Description column">
                <Select
                  aria-label="Description column"
                  value={mapping.description}
                  onChange={(e) => setMapping({ ...mapping, description: e.target.value })}
                >
                  {parsed.headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Amount layout">
                <Select
                  aria-label="Amount layout"
                  value={mapping.mode}
                  onChange={(e) => setMapping({ ...mapping, mode: e.target.value as 'single' | 'split' })}
                >
                  <option value="single">One amount column</option>
                  <option value="split">Separate debit / credit</option>
                </Select>
              </Field>

              {mapping.mode === 'single' ? (
                <>
                  <Field label="Amount column">
                    <Select
                      aria-label="Amount column"
                      value={mapping.amount}
                      onChange={(e) => setMapping({ ...mapping, amount: e.target.value })}
                    >
                      <option value="">Choose…</option>
                      {parsed.headers.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Which sign is money out?">
                    <Select
                      aria-label="Which sign is money out?"
                      value={String(mapping.negativeIsExpense)}
                      onChange={(e) =>
                        setMapping({ ...mapping, negativeIsExpense: e.target.value === 'true' })
                      }
                    >
                      <option value="true">Negative = spending</option>
                      <option value="false">Positive = spending</option>
                    </Select>
                  </Field>
                </>
              ) : (
                <>
                  <Field label="Debit (money out) column">
                    <Select
                      aria-label="Debit column"
                      value={mapping.debit}
                      onChange={(e) => setMapping({ ...mapping, debit: e.target.value })}
                    >
                      <option value="">Choose…</option>
                      {parsed.headers.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Credit (money in) column">
                    <Select
                      aria-label="Credit column"
                      value={mapping.credit}
                      onChange={(e) => setMapping({ ...mapping, credit: e.target.value })}
                    >
                      <option value="">Choose…</option>
                      {parsed.headers.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </>
              )}

              <Field label="Date order">
                <Select aria-label="Date order" value={String(dayFirst)} onChange={(e) => setDayFirst(e.target.value === 'true')}>
                  <option value="false">Month first (03/04 = 4 March)</option>
                  <option value="true">Day first (03/04 = 3 April)</option>
                </Select>
              </Field>
            </div>
          </Card>

          <Card
            title={`Review — ${importable.length} ready${broken.length ? `, ${broken.length} unreadable` : ''}`}
            action={
              <Button variant="primary" onClick={() => void runImport()} disabled={busy || importable.length === 0}>
                {busy ? 'Importing…' : `Import ${importable.length}`}
              </Button>
            }
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-ink-muted text-left">
                    <th scope="col" className="font-medium pb-2">Date</th>
                    <th scope="col" className="font-medium pb-2">Description</th>
                    <th scope="col" className="font-medium pb-2">Category</th>
                    <th scope="col" className="font-medium pb-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {drafts.slice(0, 50).map((d, i) => (
                    <tr key={i} className={d.error ? 'text-ink-muted' : ''}>
                      <td className="py-2 whitespace-nowrap tabular">
                        {d.error ? '—' : formatDay(d.occurred_on)}
                      </td>
                      <td className="py-2 max-w-[22rem] truncate">
                        {d.note || <span className="text-ink-muted">(no description)</span>}
                        {d.error && <span className="ml-2 text-critical text-xs">{d.error}</span>}
                      </td>
                      <td className="py-2 text-ink-secondary">
                        {categories.find((c) => c.id === d.category_id)?.name ?? '—'}
                      </td>
                      <td
                        className={`py-2 text-right tabular ${d.type === 'income' ? 'text-success-text' : ''}`}
                      >
                        {d.error
                          ? '—'
                          : formatMoney(
                              d.type === 'income' ? toCents(d.amount) : -toCents(d.amount),
                              settings.currency,
                              { sign: true },
                            )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {drafts.length > 50 && (
                <p className="mt-3 text-xs text-ink-muted">
                  Showing the first 50 of {drafts.length} rows. All {importable.length} readable rows import.
                </p>
              )}
            </div>
          </Card>
        </>
      )}
    </div>
  )
}
