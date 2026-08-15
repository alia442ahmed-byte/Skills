import { useMemo, useState } from 'react'
import {
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { Category, Settings, Transaction } from '../lib/types'
import { monthlyTrend, spendByCategory } from '../lib/budget'
import { formatCompact, formatMoney } from '../lib/money'
import { CATEGORICAL, forMode } from '../lib/palette'
import { shortMonthLabel } from '../lib/dates'
import { useDarkMode } from '../hooks/useDarkMode'
import { Card, Dot, Empty } from './ui'

export function Charts({
  categories,
  transactions,
  monthTxs,
  settings,
}: {
  categories: Category[]
  transactions: Transaction[]
  monthTxs: Transaction[]
  settings: Settings
}) {
  const dark = useDarkMode()
  const currency = settings.currency

  const slices = useMemo(
    () =>
      spendByCategory(monthTxs, categories).map((s) => ({ ...s, color: forMode(s.color, dark) })),
    [monthTxs, categories, dark],
  )
  const trend = useMemo(
    () => monthlyTrend(transactions, 12, settings.month_start_day),
    [transactions, settings.month_start_day],
  )

  const totalSpent = slices.reduce((sum, s) => sum + s.cents, 0)

  return (
    <div className="flex flex-col gap-6">
      <Card title="Where the money went this month">
        {slices.length === 0 ? (
          <Empty>No spending recorded this month.</Empty>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center">
            <SpendDonut slices={slices} totalSpent={totalSpent} currency={currency} dark={dark} />
            {/* The table view: identity never rests on color alone, and it is the
                documented relief for light-mode slots below 3:1 contrast. */}
            <table className="w-full text-sm">
              <caption className="sr-only">Spending by category this month</caption>
              <thead>
                <tr className="text-xs text-ink-muted text-left">
                  <th scope="col" className="font-medium pb-2">Category</th>
                  <th scope="col" className="font-medium pb-2 text-right">Spent</th>
                  <th scope="col" className="font-medium pb-2 text-right">Share</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {slices.map((s) => (
                  <tr key={s.id}>
                    <th scope="row" className="py-2 font-normal text-ink">
                      <span className="flex items-center gap-2">
                        <Dot color={s.color} />
                        {s.name}
                      </span>
                    </th>
                    <td className="py-2 text-right tabular">{formatMoney(s.cents, currency)}</td>
                    <td className="py-2 text-right tabular text-ink-secondary">
                      {totalSpent > 0 ? `${Math.round((s.cents / totalSpent) * 100)}%` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Income vs. spending, last 12 months">
        {trend.length < 2 ? (
          <Empty>Two months of history are needed before a trend means anything.</Empty>
        ) : (
          <TrendChart trend={trend} currency={currency} dark={dark} />
        )}
      </Card>
    </div>
  )
}

function SpendDonut({
  slices,
  totalSpent,
  currency,
  dark,
}: {
  slices: { id: string; name: string; color: string; cents: number }[]
  totalSpent: number
  currency: string
  dark: boolean
}) {
  const [active, setActive] = useState<string | null>(null)
  const surface = dark ? '#1a1a19' : '#fcfcfb'
  const shown = active ? slices.find((s) => s.id === active) : null

  return (
    <figure className="relative m-0">
      <ResponsiveContainer width="100%" height={260}>
        <PieChart>
          <Pie
            data={slices}
            dataKey="cents"
            nameKey="name"
            innerRadius="62%"
            outerRadius="92%"
            paddingAngle={1}
            startAngle={90}
            endAngle={-270}
            isAnimationActive={false}
            onMouseEnter={(_, index) => setActive(slices[index]?.id ?? null)}
            onMouseLeave={() => setActive(null)}
          >
            {slices.map((s) => (
              /* 2px surface gap between adjacent fills. */
              <Cell key={s.id} fill={s.color} stroke={surface} strokeWidth={2} />
            ))}
          </Pie>
          <Tooltip
            content={({ payload }) => {
              const p = payload?.[0]?.payload as { name: string; cents: number } | undefined
              if (!p) return null
              return <TooltipBox label={p.name} value={formatMoney(p.cents, currency)} dark={dark} />
            }}
          />
        </PieChart>
      </ResponsiveContainer>

      {/* Hero figure in the hole: the whole point of the chart, stated in words. */}
      <figcaption className="absolute inset-0 grid place-content-center text-center pointer-events-none">
        <span className="text-xs text-ink-secondary">{shown ? shown.name : 'Total spent'}</span>
        <span className="text-2xl font-semibold tracking-tight">
          {formatMoney(shown ? shown.cents : totalSpent, currency)}
        </span>
      </figcaption>
    </figure>
  )
}

function TrendChart({
  trend,
  currency,
  dark,
}: {
  trend: { monthKey: string; incomeCents: number; expenseCents: number }[]
  currency: string
  dark: boolean
}) {
  const income = forMode(CATEGORICAL[0].light, dark)
  const spending = forMode(CATEGORICAL[1].light, dark)
  const grid = dark ? '#2c2c2a' : '#e1e0d9'
  const axis = dark ? '#383835' : '#c3c2b7'

  return (
    <figure className="m-0">
      {/* Two series, so a legend is always present. */}
      <figcaption className="flex gap-4 mb-3 text-xs text-ink-secondary">
        <span className="flex items-center gap-2">
          <Dot color={income} /> Income
        </span>
        <span className="flex items-center gap-2">
          <Dot color={spending} /> Spending
        </span>
      </figcaption>

      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={trend} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={grid} strokeDasharray="0" vertical={false} />
          <XAxis
            dataKey="monthKey"
            tickFormatter={shortMonthLabel}
            tick={{ fill: '#898781', fontSize: 12 }}
            axisLine={{ stroke: axis }}
            tickLine={false}
          />
          <YAxis
            tickFormatter={(v: number) => formatCompact(v, currency)}
            tick={{ fill: '#898781', fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            width={64}
          />
          <Tooltip
            cursor={{ stroke: axis, strokeWidth: 1 }}
            content={({ payload, label }) => {
              if (!payload?.length) return null
              return (
                <TooltipBox
                  label={new Date(String(label)).toLocaleDateString(undefined, {
                    month: 'long',
                    year: 'numeric',
                  })}
                  dark={dark}
                  rows={[
                    { name: 'Income', color: income, value: formatMoney(Number(payload[0]?.value ?? 0), currency) },
                    { name: 'Spending', color: spending, value: formatMoney(Number(payload[1]?.value ?? 0), currency) },
                  ]}
                />
              )
            }}
          />
          <Line
            type="monotone"
            dataKey="incomeCents"
            stroke={income}
            strokeWidth={2}
            dot={{ r: 4, fill: income, stroke: dark ? '#1a1a19' : '#fcfcfb', strokeWidth: 2 }}
            activeDot={{ r: 5 }}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="expenseCents"
            stroke={spending}
            strokeWidth={2}
            dot={{ r: 4, fill: spending, stroke: dark ? '#1a1a19' : '#fcfcfb', strokeWidth: 2 }}
            activeDot={{ r: 5 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </figure>
  )
}

function TooltipBox({
  label,
  value,
  rows,
  dark,
}: {
  label: string
  value?: string
  rows?: { name: string; color: string; value: string }[]
  dark: boolean
}) {
  return (
    <div
      className="rounded-lg px-3 py-2 text-xs shadow-lg"
      style={{
        background: dark ? '#242422' : '#ffffff',
        color: dark ? '#ffffff' : '#0b0b0b',
        border: `1px solid ${dark ? 'rgba(255,255,255,0.10)' : 'rgba(11,11,11,0.10)'}`,
      }}
    >
      <p className="font-medium">{label}</p>
      {value && <p className="tabular mt-0.5">{value}</p>}
      {rows?.map((r) => (
        <p key={r.name} className="mt-1 flex items-center gap-2">
          <span aria-hidden="true" className="inline-block size-2 rounded-full" style={{ background: r.color }} />
          <span style={{ color: dark ? '#c3c2b7' : '#52514e' }}>{r.name}</span>
          <span className="tabular ml-auto">{r.value}</span>
        </p>
      ))}
    </div>
  )
}
