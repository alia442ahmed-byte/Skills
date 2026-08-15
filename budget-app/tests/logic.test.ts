import { strict as assert } from 'node:assert'
import { test } from 'vitest'
import { formatMoney, parseAmount, toCents } from '../src/lib/money'
import { dayInMonth, monthKeyFor, monthRange, parseISO, shiftMonth } from '../src/lib/dates'
import { categoryRollups, monthTotals, monthlyTrend, spendByCategory, transactionsInMonth } from '../src/lib/budget'
import { buildDrafts, guessMapping, importHash, parseCsv, parseCsvDate } from '../src/lib/csv'
import type { Category, Transaction } from '../src/lib/types'

const categories: Category[] = [
  { id: 'c1', name: 'Groceries', kind: 'expense', color: '#2a78d6', monthly_limit: 400, sort_order: 0 },
  { id: 'c2', name: 'Rent', kind: 'expense', color: '#eb6834', monthly_limit: 1200, sort_order: 1 },
  { id: 'c3', name: 'Fun', kind: 'expense', color: '#1baf7a', monthly_limit: 100, sort_order: 2 },
  { id: 'c4', name: 'Income', kind: 'income', color: '#eda100', monthly_limit: 0, sort_order: 3 },
]

function tx(partial: Partial<Transaction> & Pick<Transaction, 'occurred_on' | 'amount' | 'type'>): Transaction {
  return {
    id: Math.random().toString(36).slice(2),
    category_id: null,
    note: '',
    source: 'manual',
    import_hash: null,
    ...partial,
  }
}

test('money: parses free-typed input into cents', () => {
  assert.equal(parseAmount('12'), 1200)
  assert.equal(parseAmount('12.34'), 1234)
  assert.equal(parseAmount('$1,234.56'), 123456)
  assert.equal(parseAmount('-40'), 4000) // sign comes from type, not the amount
  assert.equal(parseAmount(''), null)
  assert.equal(parseAmount('abc'), null)
})

test('money: cent arithmetic does not drift the way floats do', () => {
  // 0.1 + 0.2 in floats is 0.30000000000000004; in cents it is exactly 30.
  const sum = toCents(0.1) + toCents(0.2)
  assert.equal(sum, 30)
  assert.equal(formatMoney(sum, 'USD'), '$0.30')

  let running = 0
  for (let i = 0; i < 1000; i++) running += toCents(19.99)
  assert.equal(running, 1999000)
})

test('money: formats negatives and signed values', () => {
  assert.equal(formatMoney(-2500, 'USD'), '−$25.00')
  assert.equal(formatMoney(2500, 'USD', { sign: true }), '+$25.00')
  assert.equal(formatMoney(-2500, 'USD', { sign: true }), '−$25.00')
})

test('dates: calendar month is the default budget month', () => {
  assert.equal(monthKeyFor(new Date(2026, 7, 15)), '2026-08-01')
  assert.deepEqual(monthRange('2026-08-01'), { start: '2026-08-01', endExclusive: '2026-09-01' })
})

test('dates: a payday cycle shifts the month boundary', () => {
  // With a cycle starting on the 25th, the 24th still belongs to the prior cycle.
  assert.equal(monthKeyFor(new Date(2026, 7, 24), 25), '2026-07-25')
  assert.equal(monthKeyFor(new Date(2026, 7, 25), 25), '2026-08-25')
})

test('dates: ISO dates parse as local, never sliding a day', () => {
  const d = parseISO('2026-03-01')
  assert.equal(d.getDate(), 1)
  assert.equal(d.getMonth(), 2)
})

test('dates: month shifting handles year boundaries', () => {
  assert.equal(shiftMonth('2026-01-01', -1), '2025-12-01')
  assert.equal(shiftMonth('2026-12-01', 1), '2027-01-01')
})

test('dates: a bill due on the 31st lands on the last day of a short month', () => {
  assert.equal(dayInMonth('2026-02-01', 31), '2026-02-28')
  assert.equal(dayInMonth('2024-02-01', 31), '2024-02-29') // leap year
  assert.equal(dayInMonth('2026-08-01', 15), '2026-08-15')
})

test('budget: month filtering excludes neighbouring months', () => {
  const txs = [
    tx({ occurred_on: '2026-07-31', amount: 10, type: 'expense' }),
    tx({ occurred_on: '2026-08-01', amount: 20, type: 'expense' }),
    tx({ occurred_on: '2026-08-31', amount: 30, type: 'expense' }),
    tx({ occurred_on: '2026-09-01', amount: 40, type: 'expense' }),
  ]
  const inMonth = transactionsInMonth(txs, '2026-08-01')
  assert.deepEqual(inMonth.map((t) => t.amount), [20, 30])
})

test('budget: totals and left-to-spend', () => {
  const txs = [
    tx({ occurred_on: '2026-08-02', amount: 3000, type: 'income', category_id: 'c4' }),
    tx({ occurred_on: '2026-08-03', amount: 150.5, type: 'expense', category_id: 'c1' }),
    tx({ occurred_on: '2026-08-04', amount: 1200, type: 'expense', category_id: 'c2' }),
  ]
  const totals = monthTotals(txs, categories)
  assert.equal(totals.incomeCents, 300000)
  assert.equal(totals.expenseCents, 135050)
  assert.equal(totals.netCents, 164950)
  assert.equal(totals.budgetedCents, 170000) // 400 + 1200 + 100
  assert.equal(totals.leftToSpendCents, 34950)
})

test('budget: category rollups flag warning and over states', () => {
  const txs = [
    tx({ occurred_on: '2026-08-03', amount: 350, type: 'expense', category_id: 'c1' }), // 87.5% of 400
    tx({ occurred_on: '2026-08-04', amount: 1200, type: 'expense', category_id: 'c2' }), // exactly at limit
    tx({ occurred_on: '2026-08-05', amount: 130, type: 'expense', category_id: 'c3' }), // over 100
    tx({ occurred_on: '2026-08-06', amount: 500, type: 'income', category_id: 'c4' }), // ignored
  ]
  const rollups = categoryRollups(txs, categories)
  assert.equal(rollups.length, 3) // income categories are not budget bars

  const [groceries, rent, fun] = rollups
  assert.equal(groceries.spentCents, 35000)
  assert.equal(groceries.remainingCents, 5000)
  assert.equal(groceries.state, 'warning')

  assert.equal(rent.state, 'warning') // exactly at the limit warns, but is not over
  assert.equal(rent.remainingCents, 0)

  assert.equal(fun.state, 'over')
  assert.equal(fun.remainingCents, -3000)
})

test('budget: a category with no limit reports no state', () => {
  const noLimit: Category[] = [{ ...categories[0], monthly_limit: 0 }]
  const rollups = categoryRollups([tx({ occurred_on: '2026-08-03', amount: 50, type: 'expense', category_id: 'c1' })], noLimit)
  assert.equal(rollups[0].state, 'none')
  assert.equal(rollups[0].ratio, 0)
})

test('budget: donut folds the tail into a single Other slice', () => {
  const many: Category[] = Array.from({ length: 10 }, (_, i) => ({
    id: `x${i}`,
    name: `Cat ${i}`,
    kind: 'expense' as const,
    color: '#2a78d6',
    monthly_limit: 0,
    sort_order: i,
  }))
  const txs = many.map((c, i) => tx({ occurred_on: '2026-08-05', amount: 100 - i, type: 'expense', category_id: c.id }))
  const slices = spendByCategory(txs, many, 7)
  assert.equal(slices.length, 8)
  assert.equal(slices[7].name, 'Other')
  assert.equal(slices[7].cents, (93 + 92 + 91) * 100)
  // Total is conserved: nothing is lost in the fold.
  assert.equal(slices.reduce((s, x) => s + x.cents, 0), txs.reduce((s, t) => s + toCents(t.amount), 0))
})

test('budget: uncategorized spending still shows up', () => {
  const slices = spendByCategory([tx({ occurred_on: '2026-08-05', amount: 12, type: 'expense' })], categories)
  assert.equal(slices[0].name, 'Uncategorized')
  assert.equal(slices[0].cents, 1200)
})

test('budget: trend buckets by month, oldest first', () => {
  const txs = [
    tx({ occurred_on: '2026-06-10', amount: 100, type: 'expense' }),
    tx({ occurred_on: '2026-07-10', amount: 200, type: 'expense' }),
    tx({ occurred_on: '2026-07-20', amount: 3000, type: 'income' }),
    tx({ occurred_on: '2026-08-10', amount: 300, type: 'expense' }),
  ]
  const trend = monthlyTrend(txs, 12, 1)
  assert.deepEqual(trend.map((p) => p.monthKey), ['2026-06-01', '2026-07-01', '2026-08-01'])
  assert.equal(trend[1].incomeCents, 300000)
  assert.equal(trend[1].expenseCents, 20000)
})

test('csv: guesses columns from a typical US bank export', () => {
  const { headers } = parseCsv('Date,Description,Amount\n2026-08-01,COFFEE,-4.50\n')
  const mapping = guessMapping(headers)
  assert.equal(mapping.date, 'Date')
  assert.equal(mapping.description, 'Description')
  assert.equal(mapping.amount, 'Amount')
  assert.equal(mapping.mode, 'single')
})

test('csv: detects a split debit/credit layout', () => {
  const { headers } = parseCsv('Transaction Date,Details,Debit,Credit\n')
  const mapping = guessMapping(headers)
  assert.equal(mapping.mode, 'split')
  assert.equal(mapping.debit, 'Debit')
  assert.equal(mapping.credit, 'Credit')
})

test('csv: date parsing respects day-first vs month-first', () => {
  assert.equal(parseCsvDate('2026-08-15'), '2026-08-15')
  assert.equal(parseCsvDate('08/15/2026'), '2026-08-15')
  assert.equal(parseCsvDate('03/04/2026', false), '2026-03-04')
  assert.equal(parseCsvDate('03/04/2026', true), '2026-04-03')
  assert.equal(parseCsvDate('15/08/2026'), '2026-08-15') // day > 12 is unambiguous
  assert.equal(parseCsvDate(''), null)
})

test('csv: single-column layout splits by sign, quoted commas survive', () => {
  const csv = 'Date,Description,Amount\n2026-08-01,"COFFEE SHOP, DOWNTOWN",-4.50\n2026-08-02,SALARY,3000.00\n'
  const parsed = parseCsv(csv)
  const drafts = buildDrafts(parsed.rows, guessMapping(parsed.headers), categories)

  assert.equal(drafts.length, 2)
  assert.equal(drafts[0].note, 'COFFEE SHOP, DOWNTOWN')
  assert.equal(drafts[0].type, 'expense')
  assert.equal(drafts[0].amount, 4.5)
  assert.equal(drafts[1].type, 'income')
  assert.equal(drafts[1].amount, 3000)
})

test('csv: parenthesised negatives read as spending', () => {
  const parsed = parseCsv('Date,Description,Amount\n2026-08-01,RENT,(1200.00)\n')
  const drafts = buildDrafts(parsed.rows, guessMapping(parsed.headers), categories)
  assert.equal(drafts[0].type, 'expense')
  assert.equal(drafts[0].amount, 1200)
})

test('csv: split layout routes debit to spending and credit to income', () => {
  const parsed = parseCsv('Date,Details,Debit,Credit\n2026-08-01,TESCO,45.20,\n2026-08-02,PAYROLL,,2500.00\n')
  const drafts = buildDrafts(parsed.rows, guessMapping(parsed.headers), categories)
  assert.equal(drafts[0].type, 'expense')
  assert.equal(drafts[0].amount, 45.2)
  assert.equal(drafts[1].type, 'income')
  assert.equal(drafts[1].amount, 2500)
})

test('csv: unreadable rows are reported, never imported', () => {
  const parsed = parseCsv('Date,Description,Amount\nnot-a-date,X,-5\n2026-08-01,Y,nonsense\n')
  const drafts = buildDrafts(parsed.rows, guessMapping(parsed.headers), categories)
  assert.equal(drafts[0].error, 'Unreadable date')
  assert.equal(drafts[1].error, 'Unreadable amount')
  assert.equal(drafts.filter((d) => !d.error).length, 0)
})

test('csv: import hash is stable across re-imports and sensitive to real changes', () => {
  const a = importHash('2026-08-01', 450, 'expense', 'COFFEE SHOP')
  const b = importHash('2026-08-01', 450, 'expense', '  coffee   shop ') // same row, sloppier text
  assert.equal(a, b)

  assert.notEqual(a, importHash('2026-08-02', 450, 'expense', 'COFFEE SHOP')) // different day
  assert.notEqual(a, importHash('2026-08-01', 451, 'expense', 'COFFEE SHOP')) // different amount
  assert.notEqual(a, importHash('2026-08-01', 450, 'income', 'COFFEE SHOP')) // different direction
  assert.notEqual(a, importHash('2026-08-01', 450, 'expense', 'TEA SHOP')) // different payee
})

test('csv: re-parsing the same statement produces identical hashes', () => {
  const csv = 'Date,Description,Amount\n2026-08-01,COFFEE,-4.50\n2026-08-02,TESCO,-45.20\n'
  const first = buildDrafts(parseCsv(csv).rows, guessMapping(parseCsv(csv).headers), categories)
  const second = buildDrafts(parseCsv(csv).rows, guessMapping(parseCsv(csv).headers), categories)
  assert.deepEqual(first.map((d) => d.import_hash), second.map((d) => d.import_hash))
  // Two genuinely different rows must not collide.
  assert.notEqual(first[0].import_hash, first[1].import_hash)
})

test('csv: descriptions pre-select a matching category', () => {
  const parsed = parseCsv('Date,Description,Amount\n2026-08-01,TESCO SUPERMARKET,-45.20\n2026-08-02,MONTHLY SALARY,3000\n')
  const drafts = buildDrafts(parsed.rows, guessMapping(parsed.headers), categories)
  assert.equal(drafts[0].category_id, 'c1') // Groceries
  assert.equal(drafts[1].category_id, 'c4') // Income
})
