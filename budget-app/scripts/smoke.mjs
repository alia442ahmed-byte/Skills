/**
 * UI smoke test: drives the built app in a real browser against a stubbed
 * PostgREST backend that holds state in memory, so writes made through the UI
 * come back on the next fetch exactly as they would from Supabase.
 *
 *   npm run build && npm run smoke
 */
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'

const PORT = 4173
const BASE = `http://localhost:${PORT}`
const PROJECT_REF = 'qzfjozslmxadeiqnowjx'
const USER_ID = '11111111-2222-4333-8444-555555555555'
const SHOTS = 'screenshots'

const failures = []
function check(name, condition, detail = '') {
  const ok = Boolean(condition)
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures.push(name)
}

const today = new Date()
const iso = (y, m, d) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
const thisMonth = (d) => iso(today.getFullYear(), today.getMonth(), d)
const lastMonthDate = new Date(today.getFullYear(), today.getMonth() - 1, 15)
const lastMonth = (d) => iso(lastMonthDate.getFullYear(), lastMonthDate.getMonth(), d)

function fixtures() {
  const categories = [
    { id: 'c1', user_id: USER_ID, name: 'Groceries', kind: 'expense', color: '#2a78d6', monthly_limit: 400, sort_order: 0 },
    { id: 'c2', user_id: USER_ID, name: 'Rent', kind: 'expense', color: '#eb6834', monthly_limit: 1200, sort_order: 1 },
    { id: 'c3', user_id: USER_ID, name: 'Transport', kind: 'expense', color: '#1baf7a', monthly_limit: 120, sort_order: 2 },
    { id: 'c4', user_id: USER_ID, name: 'Fun', kind: 'expense', color: '#eda100', monthly_limit: 100, sort_order: 3 },
    { id: 'c5', user_id: USER_ID, name: 'Income', kind: 'income', color: '#e87ba4', monthly_limit: 0, sort_order: 4 },
  ]
  const t = (id, occurred_on, amount, type, category_id, note) => ({
    id, user_id: USER_ID, occurred_on, amount, type, category_id, note,
    source: 'manual', import_hash: null, created_at: `${occurred_on}T10:00:00Z`,
  })
  return {
    categories,
    transactions: [
      t('t1', thisMonth(2), 3000, 'income', 'c5', 'Salary'),
      t('t2', thisMonth(3), 350, 'expense', 'c1', 'Weekly shop'),
      t('t3', thisMonth(4), 1200, 'expense', 'c2', 'August rent'),
      t('t4', thisMonth(5), 40, 'expense', 'c3', 'Bus pass'),
      t('t5', thisMonth(6), 130, 'expense', 'c4', 'Concert'),
      t('l1', lastMonth(2), 2900, 'income', 'c5', 'Salary'),
      t('l2', lastMonth(8), 500, 'expense', 'c1', 'Groceries'),
    ],
    goals: [{ id: 'g1', user_id: USER_ID, name: 'Emergency fund', target_amount: 3000, saved_amount: 750, target_date: null }],
    recurring: [{
      id: 'r1', user_id: USER_ID, name: 'Rent', amount: 1200, type: 'expense',
      category_id: 'c2', day_of_month: 1, active: true, last_posted_month: null,
    }],
    settings: { user_id: USER_ID, currency: 'USD', month_start_day: 1 },
  }
}

/** Minimal PostgREST stand-in over the fixture store. */
function installBackend(page, store) {
  return page.route(`**/${PROJECT_REF}.supabase.co/**`, async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const table = url.pathname.split('/').pop()
    const method = request.method()
    const json = (body, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })

    if (url.pathname.includes('/auth/v1/')) return json({})

    if (table === 'budget_settings') {
      if (method === 'GET') return json(store.settings)
      if (method === 'POST' || method === 'PATCH') {
        store.settings = { ...store.settings, ...request.postDataJSON() }
        return json([store.settings], 201)
      }
    }

    const key = { budget_categories: 'categories', budget_transactions: 'transactions', budget_goals: 'goals', budget_recurring: 'recurring' }[table]
    if (!key) return json([])
    const rows = store[key]

    if (method === 'GET') return json(rows)

    if (method === 'POST') {
      const body = request.postDataJSON()
      const incoming = (Array.isArray(body) ? body : [body]).map((r, i) => ({
        id: `new-${key}-${rows.length + i}`, user_id: USER_ID, ...r,
      }))
      // The unique index on (user_id, import_hash) is what really dedupes;
      // mirror it here so a repeat import behaves the same in the stub.
      const fresh = incoming.filter(
        (r) => !r.import_hash || !rows.some((existing) => existing.import_hash === r.import_hash),
      )
      rows.unshift(...fresh)
      store.writes.push({ table, count: fresh.length })
      return json(fresh, 201)
    }

    if (method === 'PATCH') {
      const id = (url.searchParams.get('id') ?? '').replace('eq.', '')
      const row = rows.find((r) => r.id === id)
      if (row) Object.assign(row, request.postDataJSON())
      return json(row ? [row] : [])
    }

    if (method === 'DELETE') {
      const id = (url.searchParams.get('id') ?? '').replace('eq.', '')
      const index = rows.findIndex((r) => r.id === id)
      if (index >= 0) rows.splice(index, 1)
      return json([])
    }
    return json([])
  })
}

async function waitForServer(url, attempts = 60) {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url)
      if (res.ok) return true
    } catch {}
    await sleep(250)
  }
  return false
}

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
  stdio: 'ignore',
  env: { ...process.env, NO_PROXY: 'localhost,127.0.0.1' },
})

let browser
try {
  if (!(await waitForServer(BASE))) throw new Error(`preview server never came up on ${BASE}`)
  mkdirSync(SHOTS, { recursive: true })

  browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
  const store = { ...fixtures(), writes: [] }

  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 }, colorScheme: 'light' })
  await context.addInitScript(
    ([ref, userId]) => {
      // Seed a signed-in session so the app renders past the auth gate.
      window.localStorage.setItem(
        `sb-${ref}-auth-token`,
        JSON.stringify({
          access_token: 'stub-access-token',
          refresh_token: 'stub-refresh-token',
          token_type: 'bearer',
          expires_in: 3600,
          expires_at: 4102444800,
          user: { id: userId, aud: 'authenticated', role: 'authenticated', email: 'smoke@test.local' },
        }),
      )
    },
    [PROJECT_REF, USER_ID],
  )

  const page = await context.newPage()
  const consoleErrors = []
  page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()))
  page.on('pageerror', (e) => consoleErrors.push(String(e)))
  await installBackend(page, store)

  console.log('\nDashboard')
  await page.goto(BASE)
  await page.getByRole('heading', { name: 'Budget', exact: true }).waitFor()
  await page.getByText("This month's budgets").waitFor()

  const tile = async (label) =>
    (await page.locator('p', { hasText: new RegExp(`^${label}$`) }).locator('xpath=following-sibling::p[1]').first().innerText()).trim()

  // Fixtures: in 3000; out 350 + 1200 + 40 + 130 = 1720; budgeted 400+1200+120+100 = 1820.
  check('Money in tile', (await tile('Money in')).includes('3,000.00'), await tile('Money in'))
  check('Money out tile', (await tile('Money out')).includes('1,720.00'), await tile('Money out'))
  check('Net tile', (await tile('Net this month')).includes('1,280.00'), await tile('Net this month'))
  check('Left to spend tile', (await tile('Left to spend')).includes('100.00'), await tile('Left to spend'))

  check('over-budget category is called out in words', await page.getByText('Over budget').isVisible())
  check('near-limit category is called out in words', await page.getByText('Close to limit').first().isVisible())
  check('remaining shown for a category under its limit', await page.getByText('$50.00 left').isVisible())
  check('overspend shown as an amount over', await page.getByText('$30.00 over').isVisible())

  const groceriesMeter = page.getByRole('meter', { name: 'Groceries budget used' })
  check('Groceries meter reports 88% used', (await groceriesMeter.getAttribute('aria-valuenow')) === '88')

  await page.screenshot({ path: `${SHOTS}/dashboard-light.png`, fullPage: true })

  console.log('\nQuick add')
  const quickAdd = page.locator('form').filter({ has: page.getByPlaceholder('What was it for?') })
  await quickAdd.getByLabel('Amount').fill('25.50')
  await quickAdd.getByLabel('Category', { exact: true }).selectOption({ label: 'Groceries' })
  await quickAdd.getByPlaceholder('What was it for?').fill('Corner shop')
  await quickAdd.getByRole('button', { name: 'Add', exact: true }).click()
  await page.getByText('$24.50 left').waitFor({ timeout: 5000 })

  check('write reached the backend', store.writes.some((w) => w.table === 'budget_transactions'))
  // 1720 + 25.50 = 1745.50, and Groceries remaining 50 - 25.50 = 24.50.
  check('Money out includes the new entry', (await tile('Money out')).includes('1,745.50'), await tile('Money out'))
  check('Groceries remaining updated', await page.getByText('$24.50 left').isVisible())

  console.log('\nTransactions')
  await page.getByRole('button', { name: 'Transactions' }).click()
  await page.getByText('6 entries').waitFor()
  check('all six entries listed', await page.getByText('6 entries').isVisible())
  await page.getByLabel('Search transactions').fill('rent')
  await page.getByText('1 entry').waitFor()
  check('search narrows to one entry', await page.getByText('1 entry').isVisible())
  await page.getByLabel('Search transactions').fill('')

  console.log('\nCharts')
  await page.getByRole('button', { name: 'Charts' }).click()
  await page.getByText('Where the money went this month').waitFor()
  await page.locator('svg .recharts-pie').first().waitFor({ timeout: 5000 })
  check('donut renders slices', (await page.locator('.recharts-pie-sector').count()) >= 4,
    `${await page.locator('.recharts-pie-sector').count()} sectors`)
  check('donut centre shows the total spent', (await page.getByText('Total spent').locator('xpath=following-sibling::span[1]').innerText()).includes('1,745.50'))
  check('table view accompanies the donut', (await page.locator('table tbody tr').count()) >= 4)
  check('trend chart renders two series', (await page.locator('.recharts-line').count()) === 2,
    `${await page.locator('.recharts-line').count()} lines`)
  check('trend legend names both series', await page.getByText('Income', { exact: true }).first().isVisible())
  await page.screenshot({ path: `${SHOTS}/charts-light.png`, fullPage: true })

  console.log('\nGoals')
  await page.getByRole('button', { name: 'Goals' }).click()
  await page.getByText('Emergency fund').waitFor()
  const goalMeter = page.getByRole('meter', { name: 'Emergency fund progress' })
  check('goal meter reports 25%', (await goalMeter.getAttribute('aria-valuenow')) === '25')
  check('goal shows the amount still to go', await page.getByText('$2,250.00 to go').isVisible())

  console.log('\nRecurring bills')
  await page.getByRole('button', { name: 'Bills' }).click()
  await page.getByText('Recurring bills').waitFor()
  check('bill is offered, not auto-posted', await page.getByRole('button', { name: /^Post 1 due/ }).isVisible())
  await page.getByRole('button', { name: 'Post', exact: true }).click()
  await page.getByText('✓ posted').waitFor({ timeout: 5000 })
  check('bill posts once and is marked posted', await page.getByText('✓ posted').isVisible())
  const postedRows = store.transactions.filter((t) => t.source === 'recurring')
  check('exactly one recurring transaction written', postedRows.length === 1, `${postedRows.length} written`)

  await page.reload()
  await page.getByRole('button', { name: 'Bills' }).click()
  await page.getByText('✓ posted').waitFor({ timeout: 5000 })
  check('still posted once after reload', store.transactions.filter((t) => t.source === 'recurring').length === 1)

  console.log('\nCSV import')
  await page.getByRole('button', { name: 'Import' }).click()
  const csv = [
    'Date,Description,Amount',
    `${thisMonth(7)},"TESCO SUPERMARKET, LONDON",-45.20`,
    `${thisMonth(8)},STARBUCKS,-4.75`,
    `${thisMonth(9)},MONTHLY SALARY,2000.00`,
    'garbage,BROKEN ROW,-1.00',
  ].join('\n')
  const csvFile = { name: 'statement.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) }

  await page.locator('input[type=file]').setInputFiles(csvFile)
  await page.getByText(/Review — 3 ready/).waitFor({ timeout: 5000 })
  check('readable rows counted, broken row held back', await page.getByText('Review — 3 ready, 1 unreadable').isVisible())
  check('unreadable row is labelled', await page.getByText('Unreadable date').isVisible())
  check('grocery row auto-categorised', (await page.locator('table tbody tr').first().innerText()).includes('Groceries'))
  check('quoted comma in description survived', await page.getByText('TESCO SUPERMARKET, LONDON').isVisible())

  await page.getByRole('button', { name: 'Import 3' }).click()
  await page.getByText('3 imported').waitFor({ timeout: 5000 })
  check('first import inserts three rows', store.transactions.filter((t) => t.source === 'csv').length === 3,
    `${store.transactions.filter((t) => t.source === 'csv').length} rows`)

  // The same statement again: the dedupe hash should make this a no-op.
  await page.getByRole('button', { name: 'Import another file' }).click()
  await page.locator('input[type=file]').setInputFiles(csvFile)
  await page.getByText(/Review — 3 ready/).waitFor({ timeout: 5000 })
  await page.getByRole('button', { name: 'Import 3' }).click()
  await page.getByText(/already there/).waitFor({ timeout: 5000 })
  check('re-importing the same statement adds nothing',
    store.transactions.filter((t) => t.source === 'csv').length === 3,
    `${store.transactions.filter((t) => t.source === 'csv').length} rows after second import`)
  check('user is told rows were skipped', await page.getByText('0 imported, 3 already there').isVisible())

  console.log('\nDark mode')
  const darkContext = await browser.newContext({ viewport: { width: 1280, height: 1000 }, colorScheme: 'dark' })
  await darkContext.addInitScript(
    ([ref, userId]) => {
      window.localStorage.setItem(`sb-${ref}-auth-token`, JSON.stringify({
        access_token: 'stub', refresh_token: 'stub', token_type: 'bearer', expires_in: 3600,
        expires_at: 4102444800,
        user: { id: userId, aud: 'authenticated', role: 'authenticated', email: 'smoke@test.local' },
      }))
    },
    [PROJECT_REF, USER_ID],
  )
  const darkPage = await darkContext.newPage()
  await installBackend(darkPage, store)
  await darkPage.goto(BASE)
  await darkPage.getByText("This month's budgets").waitFor()
  const bodyBg = await darkPage.evaluate(() => getComputedStyle(document.body).backgroundColor)
  check('dark mode paints the dark plane', bodyBg === 'rgb(13, 13, 13)', bodyBg)
  await darkPage.screenshot({ path: `${SHOTS}/dashboard-dark.png`, fullPage: true })
  await darkPage.getByRole('button', { name: 'Charts' }).click()
  await darkPage.locator('svg .recharts-pie').first().waitFor({ timeout: 5000 })
  await darkPage.screenshot({ path: `${SHOTS}/charts-dark.png`, fullPage: true })

  console.log('\nConsole')
  check('no console or page errors', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '))

  console.log(
    failures.length === 0
      ? `\nAll checks passed. Screenshots in ${SHOTS}/.`
      : `\n${failures.length} check(s) failed: ${failures.join(', ')}`,
  )
} catch (err) {
  console.error(`\n  FAIL  harness error — ${err.message}`)
  failures.push('harness error')
} finally {
  await browser?.close()
  server.kill()
}

process.exit(failures.length === 0 ? 0 : 1)
