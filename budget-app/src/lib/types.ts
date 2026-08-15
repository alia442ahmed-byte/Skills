export type TxType = 'expense' | 'income'
export type TxSource = 'manual' | 'csv' | 'recurring'

export interface Category {
  id: string
  name: string
  kind: TxType
  color: string
  monthly_limit: number
  sort_order: number
}

export interface Transaction {
  id: string
  occurred_on: string // YYYY-MM-DD
  amount: number
  type: TxType
  category_id: string | null
  note: string
  source: TxSource
  import_hash: string | null
}

export interface Goal {
  id: string
  name: string
  target_amount: number
  saved_amount: number
  target_date: string | null
}

export interface Recurring {
  id: string
  name: string
  amount: number
  type: TxType
  category_id: string | null
  day_of_month: number
  active: boolean
  last_posted_month: string | null // first day of the month it was last posted for
}

export interface Settings {
  currency: string
  month_start_day: number
}
