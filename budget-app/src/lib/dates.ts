/** Month keys are the first day of a budget month, "YYYY-MM-DD". */

export function todayISO(): string {
  return isoDate(new Date())
}

export function isoDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Parse "YYYY-MM-DD" as a local date, never UTC — otherwise a date can slip a day. */
export function parseISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1)
}

/**
 * The budget month containing `date`. With monthStartDay = 1 this is the calendar
 * month; with 25 (a payday cycle) the month starting on the 25th.
 */
export function monthKeyFor(date: Date, monthStartDay = 1): string {
  const d = new Date(date.getFullYear(), date.getMonth(), 1)
  if (date.getDate() < monthStartDay) d.setMonth(d.getMonth() - 1)
  d.setDate(monthStartDay)
  return isoDate(d)
}

export function monthRange(monthKey: string): { start: string; endExclusive: string } {
  const start = parseISO(monthKey)
  const end = new Date(start)
  end.setMonth(end.getMonth() + 1)
  return { start: isoDate(start), endExclusive: isoDate(end) }
}

export function shiftMonth(monthKey: string, delta: number): string {
  const d = parseISO(monthKey)
  d.setMonth(d.getMonth() + delta)
  return isoDate(d)
}

export function monthLabel(monthKey: string, monthStartDay = 1): string {
  const d = parseISO(monthKey)
  const base = d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
  if (monthStartDay === 1) return base
  const end = new Date(d)
  end.setMonth(end.getMonth() + 1)
  end.setDate(end.getDate() - 1)
  const short = (x: Date) => x.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  return `${short(d)} – ${short(end)}`
}

export function shortMonthLabel(monthKey: string): string {
  return parseISO(monthKey).toLocaleDateString(undefined, { month: 'short' })
}

export function formatDay(iso: string): string {
  return parseISO(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

/** Clamp a day-of-month to a month that may be shorter (31st in February -> 28th/29th). */
export function dayInMonth(monthKey: string, day: number): string {
  const d = parseISO(monthKey)
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  d.setDate(Math.min(day, lastDay))
  return isoDate(d)
}
