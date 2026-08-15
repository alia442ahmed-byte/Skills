import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { Button, Field, Input } from './ui'

export function AuthGate({ auth }: { auth: ReturnType<typeof useAuth> }) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMessage(null)
    const { error, data } =
      mode === 'signin' ? await auth.signIn(email, password) : await auth.signUp(email, password)
    setBusy(false)
    if (error) {
      setMessage(error.message)
      return
    }
    if (mode === 'signup' && !data.session) {
      setMessage('Account created. Check your email to confirm, then sign in.')
      setMode('signin')
    }
  }

  return (
    <main className="min-h-full grid place-items-center px-4 py-12">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold tracking-tight">Budget</h1>
        <p className="mt-1 text-sm text-ink-secondary">
          Your money, in one place. Signed in and synced across your devices.
        </p>

        <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
          <Field label="Email">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
              placeholder="you@example.com"
            />
          </Field>
          <Field label="Password">
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              minLength={6}
              required
              placeholder="At least 6 characters"
            />
          </Field>

          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? 'Working…' : mode === 'signin' ? 'Sign in' : 'Create account'}
          </Button>
        </form>

        {message && (
          <p role="status" className="mt-4 text-sm text-critical">
            {message}
          </p>
        )}

        <button
          type="button"
          onClick={() => {
            setMode(mode === 'signin' ? 'signup' : 'signin')
            setMessage(null)
          }}
          className="mt-6 text-sm text-ink-secondary underline underline-offset-4 hover:text-ink"
        >
          {mode === 'signin' ? "New here? Create an account" : 'Already have an account? Sign in'}
        </button>
      </div>
    </main>
  )
}
