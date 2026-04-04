import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useCurrentUser } from '../hooks/useCurrentUser.js'
import { login } from '../lib/api.js'

export default function LoginPage() {
  const { user, isLoading } = useCurrentUser()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (!isLoading && user) return <Navigate to="/" replace />

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await login(username, password)
      await queryClient.invalidateQueries({ queryKey: ['me'] })
      navigate('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-tn-bg px-4">
      <div className="w-full max-w-sm rounded-lg border border-tn-border bg-tn-panel p-8">
        <h1 className="mb-6 text-center text-xl font-bold text-tn-fg">🎭 Playwright Cart</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="username" className="mb-1 block text-sm text-tn-muted">
              Username
            </label>
            <input
              id="username"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              className="w-full rounded border border-tn-border bg-tn-bg px-3 py-2 text-sm text-tn-fg placeholder-tn-muted focus:outline-none focus:ring-1 focus:ring-tn-purple"
            />
          </div>
          <div>
            <label htmlFor="password" className="mb-1 block text-sm text-tn-muted">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full rounded border border-tn-border bg-tn-bg px-3 py-2 text-sm text-tn-fg placeholder-tn-muted focus:outline-none focus:ring-1 focus:ring-tn-purple"
            />
          </div>
          {error && <p className="text-sm text-tn-red">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded bg-tn-purple px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-80 disabled:opacity-50"
          >
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}
