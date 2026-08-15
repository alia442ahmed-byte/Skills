import Papa from 'papaparse'
import type { Category, TxType } from './types'
import { parseAmount } from './money'
import { isoDate } from './dates'

export interface ParsedCsv {
  headers: string[]
  rows: Record<string, string>[]
}

export interface ColumnMapping {
  date: string
  description: string
  /** Layout A: one signed amount column. */
  amount: string
  /** Layout B: separate debit/credit columns. */
  debit: string
  credit: string
  mode: 'single' | 'split'
  /** In single-column layouts, which sign means money leaving the account. */
  negativeIsExpense: boolean
}

export interface DraftTransaction {
  occurred_on: string
  amount: number
  type: TxType
  note: string
  category_id: string | null
  import_hash: string
  /** Set when the row could not be read; such rows are shown but never imported. */
  error?: string
}

export function parseCsv(text: string): ParsedCsv {
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => h.trim(),
  })
  const rows = result.data.filter((r) => Object.values(r).some((v) => (v ?? '').trim() !== ''))
  const headers = result.meta.fields?.map((f) => f.trim()) ?? []
  return { headers, rows }
}

/** Best-effort column guesses so the common bank export needs no manual mapping. */
export function guessMapping(headers: string[]): ColumnMapping {
  const find = (...needles: string[]) =>
    headers.find((h) => needles.some((n) => h.toLowerCase().includes(n))) ?? ''

  const debit = find('debit', 'withdrawal', 'money out', 'paid out')
  const credit = find('credit', 'deposit', 'money in', 'paid in')
  const amount = find('amount', 'value')
  return {
    date: find('date', 'posted', 'time') || headers[0] || '',
    description: find('description', 'memo', 'name', 'details', 'narrative', 'payee') || headers[1] || '',
    amount,
    debit,
    credit,
    mode: debit && credit ? 'split' : 'single',
    negativeIsExpense: true,
  }
}

const DATE_PATTERNS: RegExp[] = [
  /^(\d{4})-(\d{1,2})-(\d{1,2})$/, // 2026-08-15
  /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/, // 08/15/2026
  /^(\d{1,2})-(\d{1,2})-(\d{4})$/, // 08-15-2026
]

/**
 * Parse a bank date. `dayFirst` disambiguates 03/04/2026 — banks outside the US
 * write day first, and guessing wrong silently misdates half a statement.
 */
export function parseCsvDate(raw: string, dayFirst = false): string | null {
  const value = (raw ?? '').trim()
  if (!value) return null

  const iso = value.match(DATE_PATTERNS[0])
  if (iso) return `${iso[1]}-${pad(iso[2])}-${pad(iso[3])}`

  for (const pattern of DATE_PATTERNS.slice(1)) {
    const m = value.match(pattern)
    if (m) {
      const a = Number(m[1])
      const b = Number(m[2])
      const [month, day] = dayFirst || a > 12 ? [b, a] : [a, b]
      if (month < 1 || month > 12 || day < 1 || day > 31) return null
      return `${m[3]}-${pad(month)}-${pad(day)}`
    }
  }

  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : isoDate(parsed)
}

function pad(n: string | number): string {
  return String(n).padStart(2, '0')
}

/**
 * Stable identity for an imported row: same statement imported twice produces the
 * same hashes, and the unique index on (user_id, import_hash) drops the repeats.
 */
export function importHash(occurredOn: string, amountCents: number, type: TxType, note: string): string {
  const normalized = `${occurredOn}|${amountCents}|${type}|${note.trim().toLowerCase().replace(/\s+/g, ' ')}`
  let h1 = 0x811c9dc5
  let h2 = 0x01000193
  for (let i = 0; i < normalized.length; i++) {
    const c = normalized.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0
    h2 = Math.imul(h2 + c + i, 0x85ebca6b) >>> 0
  }
  return `csv_${h1.toString(36)}${h2.toString(36)}`
}

/** Keyword -> category name, used only to pre-select a category the user can change. */
const KEYWORDS: [RegExp, string][] = [
  [/grocer|market|supermarket|aldi|tesco|kroger|safeway|whole foods|trader/i, 'Groceries'],
  [/rent|landlord|mortgage/i, 'Rent'],
  [/uber|lyft|transit|metro|bus|train|fuel|gas station|shell|petrol|parking/i, 'Transport'],
  [/restaurant|cafe|coffee|starbucks|mcdonald|pizza|doordash|deliveroo|ubereats|dining/i, 'Eating out'],
  [/electric|water|internet|broadband|phone|mobile|utility|insurance|council tax/i, 'Bills'],
  [/netflix|spotify|cinema|game|steam|hobby|gym|entertain/i, 'Fun'],
  [/pharmac|doctor|dental|clinic|health|hospital/i, 'Health'],
  [/salary|payroll|paycheck|wages|deposit from|interest/i, 'Income'],
]

export function suggestCategory(note: string, categories: Category[], type: TxType): string | null {
  const pool = categories.filter((c) => c.kind === type)
  for (const [pattern, name] of KEYWORDS) {
    if (!pattern.test(note)) continue
    const match = pool.find((c) => c.name.toLowerCase() === name.toLowerCase())
    if (match) return match.id
  }
  return null
}

export function buildDrafts(
  rows: Record<string, string>[],
  mapping: ColumnMapping,
  categories: Category[],
  dayFirst = false,
): DraftTransaction[] {
  return rows.map((row) => {
    const note = (row[mapping.description] ?? '').trim()
    const occurred_on = parseCsvDate(row[mapping.date] ?? '', dayFirst)

    let cents: number | null = null
    let type: TxType = 'expense'

    if (mapping.mode === 'split') {
      const debit = parseAmount(row[mapping.debit] ?? '')
      const credit = parseAmount(row[mapping.credit] ?? '')
      if (debit) {
        cents = debit
        type = 'expense'
      } else if (credit) {
        cents = credit
        type = 'income'
      }
    } else {
      const raw = (row[mapping.amount] ?? '').trim()
      const negative = /^\(.*\)$/.test(raw) || raw.startsWith('-')
      cents = parseAmount(raw)
      const outgoing = mapping.negativeIsExpense ? negative : !negative
      type = outgoing ? 'expense' : 'income'
    }

    const base = { occurred_on: occurred_on ?? '', amount: 0, type, note, category_id: null, import_hash: '' }
    if (!occurred_on) return { ...base, error: 'Unreadable date' }
    if (!cents) return { ...base, error: 'Unreadable amount' }

    return {
      occurred_on,
      amount: cents / 100,
      type,
      note,
      category_id: suggestCategory(note, categories, type),
      import_hash: importHash(occurred_on, cents, type, note),
    }
  })
}
