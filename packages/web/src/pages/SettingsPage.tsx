import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { useCurrentUser } from '../hooks/useCurrentUser.js'
import {
  type ApiKeyRecord,
  type CreatedApiKey,
  type UserRecord,
  createApiKey,
  createUser,
  deleteApiKey,
  deleteUser,
  fetchApiKeys,
  fetchSettings,
  fetchUsers,
  updateMe,
  updateSettings,
  updateUserRole,
} from '../lib/api.js'
import { applyTheme } from '../lib/theme.js'
import type { Theme } from '../lib/theme.js'

type Tab = 'account' | 'admin'

export default function SettingsPage() {
  const { user, isAdmin } = useCurrentUser()
  const [tab, setTab] = useState<Tab>('account')

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-6 text-xl font-bold text-tn-fg">Settings</h1>

      {/* Tab bar */}
      <div className="mb-6 flex gap-2 border-b border-tn-border">
        <TabBtn label="Account" active={tab === 'account'} onClick={() => setTab('account')} />
        {isAdmin && (
          <TabBtn label="Admin" active={tab === 'admin'} onClick={() => setTab('admin')} />
        )}
      </div>

      {tab === 'account' && user && <AccountTab user={user} />}
      {tab === 'admin' && isAdmin && <AdminTab currentUserId={user?.id ?? -1} />}
    </div>
  )
}

function TabBtn({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'px-4 py-2 text-sm font-medium transition-colors',
        active ? 'border-b-2 border-tn-purple text-tn-purple' : 'text-tn-muted hover:text-tn-fg',
      ].join(' ')}
    >
      {label}
    </button>
  )
}

// ── Account Tab ───────────────────────────────────────────────────────────────

function AccountTab({ user }: { user: { id: number; username: string; theme: Theme } }) {
  const queryClient = useQueryClient()

  return (
    <div className="space-y-8">
      <ChangeUsernameForm
        initialUsername={user.username}
        onSuccess={() => queryClient.invalidateQueries({ queryKey: ['me'] })}
      />
      <ChangePasswordForm />
      <ThemeSelector
        currentTheme={user.theme}
        onThemeChange={() => queryClient.invalidateQueries({ queryKey: ['me'] })}
      />
    </div>
  )
}

function ChangeUsernameForm({
  initialUsername,
  onSuccess,
}: {
  initialUsername: string
  onSuccess: () => void
}) {
  const [username, setUsername] = useState(initialUsername)
  const [status, setStatus] = useState<'idle' | 'saving' | 'ok' | 'err'>('idle')
  const [errMsg, setErrMsg] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('saving')
    setErrMsg('')
    try {
      await updateMe({ username })
      setStatus('ok')
      onSuccess()
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : 'Failed to update username')
      setStatus('err')
    }
  }

  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-tn-muted">
        Change Username
      </h2>
      <form onSubmit={handleSubmit} className="flex max-w-sm gap-2">
        <input
          type="text"
          value={username}
          onChange={(e) => {
            setUsername(e.target.value)
            setStatus('idle')
          }}
          required
          className="flex-1 rounded border border-tn-border bg-tn-bg px-3 py-2 text-sm text-tn-fg focus:outline-none focus:ring-1 focus:ring-tn-purple"
        />
        <button
          type="submit"
          disabled={status === 'saving'}
          className="rounded border border-tn-border px-4 py-2 text-sm text-tn-fg transition-colors hover:bg-tn-highlight disabled:opacity-50"
        >
          {status === 'saving' ? 'Saving…' : 'Save'}
        </button>
      </form>
      {status === 'ok' && <p className="mt-2 text-sm text-tn-green">Username updated.</p>}
      {status === 'err' && <p className="mt-2 text-sm text-tn-red">{errMsg}</p>}
    </section>
  )
}

function ChangePasswordForm() {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [status, setStatus] = useState<'idle' | 'saving' | 'ok' | 'err'>('idle')
  const [errMsg, setErrMsg] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (next !== confirm) {
      setErrMsg('New passwords do not match.')
      setStatus('err')
      return
    }
    setStatus('saving')
    setErrMsg('')
    try {
      await updateMe({ password: next, currentPassword: current })
      setStatus('ok')
      setCurrent('')
      setNext('')
      setConfirm('')
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : 'Failed to update password')
      setStatus('err')
    }
  }

  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-tn-muted">
        Change Password
      </h2>
      <form onSubmit={handleSubmit} className="max-w-sm space-y-3">
        <input
          type="password"
          placeholder="Current password"
          autoComplete="current-password"
          value={current}
          onChange={(e) => {
            setCurrent(e.target.value)
            setStatus('idle')
          }}
          required
          className="w-full rounded border border-tn-border bg-tn-bg px-3 py-2 text-sm text-tn-fg placeholder-tn-muted focus:outline-none focus:ring-1 focus:ring-tn-purple"
        />
        <input
          type="password"
          placeholder="New password"
          autoComplete="new-password"
          value={next}
          onChange={(e) => {
            setNext(e.target.value)
            setStatus('idle')
          }}
          required
          className="w-full rounded border border-tn-border bg-tn-bg px-3 py-2 text-sm text-tn-fg placeholder-tn-muted focus:outline-none focus:ring-1 focus:ring-tn-purple"
        />
        <input
          type="password"
          placeholder="Confirm new password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => {
            setConfirm(e.target.value)
            setStatus('idle')
          }}
          required
          className="w-full rounded border border-tn-border bg-tn-bg px-3 py-2 text-sm text-tn-fg placeholder-tn-muted focus:outline-none focus:ring-1 focus:ring-tn-purple"
        />
        <button
          type="submit"
          disabled={status === 'saving'}
          className="rounded border border-tn-border px-4 py-2 text-sm text-tn-fg transition-colors hover:bg-tn-highlight disabled:opacity-50"
        >
          {status === 'saving' ? 'Saving…' : 'Update password'}
        </button>
        {status === 'ok' && <p className="text-sm text-tn-green">Password updated.</p>}
        {status === 'err' && <p className="text-sm text-tn-red">{errMsg}</p>}
      </form>
    </section>
  )
}

function ThemeSelector({
  currentTheme,
  onThemeChange,
}: {
  currentTheme: Theme
  onThemeChange: () => void
}) {
  const themes: { value: Theme; label: string }[] = [
    { value: 'dark', label: 'Dark' },
    { value: 'light', label: 'Light' },
    { value: 'system', label: 'System' },
  ]

  async function handleTheme(theme: Theme) {
    applyTheme(theme)
    try {
      await updateMe({ theme })
      onThemeChange()
    } catch {
      // best-effort — theme is already applied locally
    }
  }

  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-tn-muted">Theme</h2>
      <div className="flex gap-2">
        {themes.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            onClick={() => handleTheme(value)}
            className={[
              'rounded border px-4 py-2 text-sm transition-colors',
              currentTheme === value
                ? 'border-tn-purple bg-tn-highlight text-tn-purple'
                : 'border-tn-border text-tn-muted hover:bg-tn-highlight hover:text-tn-fg',
            ].join(' ')}
          >
            {label}
          </button>
        ))}
      </div>
    </section>
  )
}

// ── Admin Tab ─────────────────────────────────────────────────────────────────

function AdminTab({ currentUserId }: { currentUserId: number }) {
  return (
    <div className="space-y-10">
      <UsersSection currentUserId={currentUserId} />
      <ApiKeysSection />
      <DataRetentionSection />
    </div>
  )
}

function UsersSection({ currentUserId }: { currentUserId: number }) {
  const [users, setUsers] = useState<UserRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [errMsg, setErrMsg] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [newUsername, setNewUsername] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newRole, setNewRole] = useState<'admin' | 'user'>('user')
  const [creating, setCreating] = useState(false)
  const [createErr, setCreateErr] = useState('')

  useEffect(() => {
    fetchUsers()
      .then((data) => {
        setUsers(data)
      })
      .catch((err) => {
        setErrMsg(err instanceof Error ? err.message : 'Failed to load users')
      })
      .finally(() => setLoading(false))
  }, [])

  async function handleDelete(id: number) {
    try {
      await deleteUser(id)
      setUsers((prev) => prev.filter((u) => u.id !== id))
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : 'Failed to delete user')
    }
  }

  async function handleRoleToggle(user: UserRecord) {
    const next = user.role === 'admin' ? 'user' : 'admin'
    try {
      const updated = await updateUserRole(user.id, next)
      setUsers((prev) => prev.map((u) => (u.id === user.id ? updated : u)))
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : 'Failed to update role')
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setCreating(true)
    setCreateErr('')
    try {
      const created = await createUser(newUsername, newPassword, newRole)
      setUsers((prev) => [...prev, created])
      setShowForm(false)
      setNewUsername('')
      setNewPassword('')
      setNewRole('user')
    } catch (err) {
      setCreateErr(err instanceof Error ? err.message : 'Failed to create user')
    } finally {
      setCreating(false)
    }
  }

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-tn-muted">Users</h2>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="rounded border border-tn-border px-3 py-1 text-xs text-tn-fg transition-colors hover:bg-tn-highlight"
        >
          {showForm ? 'Cancel' : '+ Create User'}
        </button>
      </div>

      {errMsg && <p className="mb-2 text-sm text-tn-red">{errMsg}</p>}

      {showForm && (
        <form
          onSubmit={handleCreate}
          className="mb-4 flex flex-wrap items-end gap-2 rounded border border-tn-border bg-tn-panel p-3"
        >
          <div className="flex flex-col gap-1">
            <label htmlFor="new-username" className="text-xs text-tn-muted">
              Username
            </label>
            <input
              id="new-username"
              type="text"
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              required
              className="rounded border border-tn-border bg-tn-bg px-2 py-1 text-sm text-tn-fg focus:outline-none focus:ring-1 focus:ring-tn-purple"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="new-password" className="text-xs text-tn-muted">
              Password
            </label>
            <input
              id="new-password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              autoComplete="new-password"
              className="rounded border border-tn-border bg-tn-bg px-2 py-1 text-sm text-tn-fg focus:outline-none focus:ring-1 focus:ring-tn-purple"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="new-role" className="text-xs text-tn-muted">
              Role
            </label>
            <select
              id="new-role"
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as 'admin' | 'user')}
              className="rounded border border-tn-border bg-tn-bg px-2 py-1 text-sm text-tn-fg focus:outline-none focus:ring-1 focus:ring-tn-purple"
            >
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={creating}
            className="rounded bg-tn-purple px-3 py-1 text-sm text-white transition-opacity hover:opacity-80 disabled:opacity-50"
          >
            {creating ? 'Creating…' : 'Create'}
          </button>
          {createErr && <p className="w-full text-sm text-tn-red">{createErr}</p>}
        </form>
      )}

      {loading ? (
        <div className="animate-pulse space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-10 rounded bg-tn-highlight" />
          ))}
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-tn-border text-left text-xs text-tn-muted">
              <th className="pb-2 pr-4 font-medium">Username</th>
              <th className="pb-2 pr-4 font-medium">Role</th>
              <th className="pb-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-tn-border">
            {users.map((u) => (
              <tr key={u.id}>
                <td className="py-2 pr-4 text-tn-fg">{u.username}</td>
                <td className="py-2 pr-4">
                  <button
                    type="button"
                    onClick={() => handleRoleToggle(u)}
                    className={[
                      'rounded px-2 py-0.5 text-xs font-medium transition-colors',
                      u.role === 'admin'
                        ? 'bg-tn-purple/20 text-tn-purple hover:bg-tn-purple/30'
                        : 'bg-tn-highlight text-tn-muted hover:bg-tn-highlight/80',
                    ].join(' ')}
                  >
                    {u.role}
                  </button>
                </td>
                <td className="py-2">
                  <button
                    type="button"
                    onClick={() => handleDelete(u.id)}
                    disabled={u.id === currentUserId}
                    className="rounded border border-tn-border px-3 py-1 text-xs text-tn-red transition-colors hover:bg-tn-highlight disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}

function ApiKeysSection() {
  const [keys, setKeys] = useState<ApiKeyRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [errMsg, setErrMsg] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [label, setLabel] = useState('')
  const [creating, setCreating] = useState(false)
  const [createErr, setCreateErr] = useState('')
  const [newKey, setNewKey] = useState<CreatedApiKey | null>(null)
  const [copied, setCopied] = useState(false)
  const copyTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    fetchApiKeys()
      .then((data) => {
        setKeys(data)
      })
      .catch((err) => {
        setErrMsg(err instanceof Error ? err.message : 'Failed to load API keys')
      })
      .finally(() => setLoading(false))
    return () => {
      if (copyTimeout.current) clearTimeout(copyTimeout.current)
    }
  }, [])

  async function handleRevoke(id: number) {
    try {
      await deleteApiKey(id)
      setKeys((prev) => prev.filter((k) => k.id !== id))
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : 'Failed to revoke key')
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setCreating(true)
    setCreateErr('')
    try {
      const created = await createApiKey(label)
      setKeys((prev) => [...prev, created])
      setNewKey(created)
      setShowForm(false)
      setLabel('')
    } catch (err) {
      setCreateErr(err instanceof Error ? err.message : 'Failed to create key')
    } finally {
      setCreating(false)
    }
  }

  function handleCopy() {
    if (!newKey) return
    navigator.clipboard.writeText(newKey.key).then(() => {
      setCopied(true)
      copyTimeout.current = setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-tn-muted">API Keys</h2>
        <button
          type="button"
          onClick={() => {
            setShowForm((v) => !v)
            setNewKey(null)
          }}
          className="rounded border border-tn-border px-3 py-1 text-xs text-tn-fg transition-colors hover:bg-tn-highlight"
        >
          {showForm ? 'Cancel' : '+ Generate Key'}
        </button>
      </div>

      {errMsg && <p className="mb-2 text-sm text-tn-red">{errMsg}</p>}

      {newKey && (
        <div className="mb-4 rounded border border-tn-green bg-tn-panel p-3">
          <p className="mb-2 text-xs text-tn-green">
            Key created — copy it now. It will not be shown again.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 break-all rounded bg-tn-bg px-2 py-1 text-xs text-tn-fg">
              {newKey.key}
            </code>
            <button
              type="button"
              onClick={handleCopy}
              className="shrink-0 rounded border border-tn-border px-3 py-1 text-xs text-tn-fg transition-colors hover:bg-tn-highlight"
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <button
            type="button"
            onClick={() => setNewKey(null)}
            className="mt-2 text-xs text-tn-muted hover:text-tn-fg"
          >
            Dismiss
          </button>
        </div>
      )}

      {showForm && (
        <form
          onSubmit={handleCreate}
          className="mb-4 flex items-end gap-2 rounded border border-tn-border bg-tn-panel p-3"
        >
          <div className="flex flex-col gap-1">
            <label htmlFor="key-label" className="text-xs text-tn-muted">
              Label
            </label>
            <input
              id="key-label"
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              required
              placeholder="e.g. CI pipeline"
              className="rounded border border-tn-border bg-tn-bg px-2 py-1 text-sm text-tn-fg placeholder-tn-muted focus:outline-none focus:ring-1 focus:ring-tn-purple"
            />
          </div>
          <button
            type="submit"
            disabled={creating}
            className="rounded bg-tn-purple px-3 py-1 text-sm text-white transition-opacity hover:opacity-80 disabled:opacity-50"
          >
            {creating ? 'Generating…' : 'Generate'}
          </button>
          {createErr && <p className="w-full text-sm text-tn-red">{createErr}</p>}
        </form>
      )}

      {loading ? (
        <div className="animate-pulse space-y-2">
          {[0, 1].map((i) => (
            <div key={i} className="h-10 rounded bg-tn-highlight" />
          ))}
        </div>
      ) : keys.length === 0 ? (
        <p className="text-sm text-tn-muted">No API keys yet.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-tn-border text-left text-xs text-tn-muted">
              <th className="pb-2 pr-4 font-medium">Label</th>
              <th className="pb-2 pr-4 font-medium">Key</th>
              <th className="pb-2 pr-4 font-medium">Created</th>
              <th className="pb-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-tn-border">
            {keys.map((k) => (
              <tr key={k.id}>
                <td className="py-2 pr-4 text-tn-fg">{k.label}</td>
                <td className="py-2 pr-4 font-mono text-xs text-tn-muted">{k.maskedKey}</td>
                <td className="py-2 pr-4 text-tn-muted">
                  {new Date(k.createdAt).toLocaleDateString()}
                </td>
                <td className="py-2">
                  <button
                    type="button"
                    onClick={() => handleRevoke(k.id)}
                    className="rounded border border-tn-border px-3 py-1 text-xs text-tn-red transition-colors hover:bg-tn-highlight"
                  >
                    Revoke
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}

function DataRetentionSection() {
  const [days, setDays] = useState<number>(30)
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState<'idle' | 'saving' | 'ok' | 'err'>('idle')
  const [errMsg, setErrMsg] = useState('')

  useEffect(() => {
    fetchSettings()
      .then((s) => {
        setDays(s.data_retention_days)
      })
      .catch((err) => {
        setErrMsg(err instanceof Error ? err.message : 'Failed to load settings')
      })
      .finally(() => setLoading(false))
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('saving')
    setErrMsg('')
    try {
      const updated = await updateSettings({ data_retention_days: days })
      setDays(updated.data_retention_days)
      setStatus('ok')
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : 'Failed to save settings')
      setStatus('err')
    }
  }

  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-tn-muted">
        Data Retention
      </h2>
      {loading ? (
        <div className="h-10 w-48 animate-pulse rounded bg-tn-highlight" />
      ) : (
        <form onSubmit={handleSubmit} className="flex max-w-xs items-end gap-3">
          <div className="flex flex-1 flex-col gap-1">
            <label htmlFor="retention-days" className="text-xs text-tn-muted">
              Runs data persistence (days)
            </label>
            <input
              id="retention-days"
              type="number"
              min={1}
              max={180}
              value={days}
              onChange={(e) => {
                setDays(Number(e.target.value))
                setStatus('idle')
              }}
              required
              className="w-full rounded border border-tn-border bg-tn-bg px-3 py-2 text-sm text-tn-fg focus:outline-none focus:ring-1 focus:ring-tn-purple"
            />
          </div>
          <button
            type="submit"
            disabled={status === 'saving'}
            className="rounded border border-tn-border px-4 py-2 text-sm text-tn-fg transition-colors hover:bg-tn-highlight disabled:opacity-50"
          >
            {status === 'saving' ? 'Saving…' : 'Save'}
          </button>
        </form>
      )}
      {status === 'ok' && <p className="mt-2 text-sm text-tn-green">Settings saved.</p>}
      {status === 'err' && <p className="mt-2 text-sm text-tn-red">{errMsg}</p>}
    </section>
  )
}
