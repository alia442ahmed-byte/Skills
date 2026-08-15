# Budget

A personal budgeting app: log what you spend, set a limit per category, and see
at a glance how much is left this month and where the money actually went.

Data lives in Supabase behind an email + password sign-in, so it syncs across
devices and survives clearing your browser.

## What it does

- **Dashboard** — money in, money out, net, and left-to-spend for the month, with
  a progress bar per category that warns as you near a limit and flags overspend.
- **Transactions** — searchable, filterable log of every entry, editable inline.
- **Charts** — spending by category, and income vs. spending over the last 12 months.
- **Goals** — savings targets with progress, contribute or withdraw.
- **Bills** — recurring bills you post with one click each month; never posted
  behind your back, and never posted twice.
- **Import** — drop a bank CSV, map its columns, review, import. Re-importing an
  overlapping statement adds nothing.
- **Settings** — currency, and a budget month that can start on your payday
  instead of the 1st.

## Running it

```bash
npm install
cp .env.example .env.local   # fill in your Supabase URL and publishable key
npm run dev                  # http://localhost:5173
```

The two values come from your Supabase project under **Settings → API**. The
publishable key is meant to be shipped in the browser; row-level security, not
key secrecy, is what keeps one account's data out of another's.

## Database

Schema and policies are in `supabase/migrations/`. Apply them to a fresh project
with the Supabase CLI (`supabase db push`) or by pasting them into the SQL editor
in order. Every table carries `user_id`, has RLS enabled, and has one policy per
operation scoped to `auth.uid()`.

Two details worth knowing:

- **Money is integer cents in JS**, `numeric(12,2)` in Postgres. No balance ever
  touches a float.
- **`import_hash` with a unique index on `(user_id, import_hash)`** is what makes
  repeat imports and repeat bill postings no-ops. The hash covers date, amount,
  direction, and normalised description, so the same statement row always hashes
  the same way.

## Tests

```bash
npm test     # logic: money, dates, rollups, CSV parsing and dedupe hashing
npm run build && npm run smoke   # drives the built app in Chromium
```

`npm run smoke` runs the UI against a stubbed PostgREST backend held in memory,
so it needs no network and no live database. It checks the arithmetic on screen,
quick-add, search, chart rendering, goal progress, one-click bill posting, and a
CSV import followed by a re-import that must add nothing. Screenshots land in
`screenshots/`.

## Deploying

The build output is static, so any static host works:

```bash
npm run build          # -> dist/
npx netlify deploy --prod --dir dist
# or: npx vercel deploy --prod
```

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` as environment
variables in the host's project settings, and add the deployed origin to
**Authentication → URL Configuration** in Supabase so sign-in works there.
