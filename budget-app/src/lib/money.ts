// All arithmetic on money happens in integer cents. Postgres stores numeric(12,2);
// the moment a balance touches a JS float it starts drifting, so it never does.

export function toCents(amount: number | string): number {
  return Math.round(Number(amount) * 100)
}

export function toAmount(cents: number): number {
  return cents / 100
}

/** Parse free-typed input ("12", "12.5", "$1,234.56") into cents. Null when unusable. */
export function parseAmount(raw: string): number | null {
  const cleaned = raw.replace(/[^0-9.\-]/g, '')
  if (!cleaned || cleaned === '-' || cleaned === '.') return null
  const value = Number(cleaned)
  if (!Number.isFinite(value)) return null
  return Math.round(Math.abs(value) * 100)
}

export function formatMoney(cents: number, currency = 'USD', opts: { sign?: boolean } = {}): string {
  const formatted = new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(cents) / 100)
  if (opts.sign && cents !== 0) return `${cents < 0 ? '−' : '+'}${formatted}`
  return cents < 0 ? `−${formatted}` : formatted
}

/** Compact form for axis ticks: $1.2k, $340. */
export function formatCompact(cents: number, currency = 'USD'): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(cents / 100)
}
