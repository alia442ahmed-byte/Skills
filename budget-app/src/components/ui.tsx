import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react'

export function Card({
  title,
  action,
  children,
  className = '',
}: {
  title?: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section
      className={`rounded-xl bg-surface ring-1 ring-hairline p-4 sm:p-5 ${className}`}
    >
      {(title || action) && (
        <header className="flex items-center justify-between gap-3 mb-4">
          {title && <h2 className="text-sm font-semibold text-ink">{title}</h2>}
          {action}
        </header>
      )}
      {children}
    </section>
  )
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost' | 'danger'
}

export function Button({ variant = 'ghost', className = '', ...props }: ButtonProps) {
  const styles = {
    primary: 'bg-accent text-white hover:opacity-90',
    ghost: 'bg-surface-2 text-ink hover:ring-1 hover:ring-hairline',
    danger: 'bg-transparent text-critical hover:bg-surface-2',
  }[variant]
  return (
    <button
      {...props}
      className={`rounded-lg px-3 py-2 text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed ${styles} ${className}`}
    />
  )
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-xs font-medium text-ink-secondary">
      {label}
      {children}
    </label>
  )
}

const controlClass =
  'rounded-lg bg-surface-2 px-3 py-2 text-sm text-ink ring-1 ring-hairline outline-none focus:ring-2 focus:ring-accent placeholder:text-ink-muted'

export function Input({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${controlClass} ${className}`} />
}

export function Select({ className = '', ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${controlClass} ${className}`} />
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="text-sm text-ink-muted py-6 text-center">{children}</p>
}

export function Dot({ color }: { color: string }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block size-2.5 rounded-full shrink-0"
      style={{ background: color }}
    />
  )
}
