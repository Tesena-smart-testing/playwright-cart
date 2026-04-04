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
import { useTheme } from '../hooks/useTheme.js'

type Tab = 'account' | 'admin'

export default function SettingsPage() {
  const { user, isAdmin } = useCurrentUser()
  const [tab, setTab] = useState<Tab>('account')

  const navItems: { id: Tab; label: string }[] = [
    { id: 'account', label: 'Account' },
    ...(isAdmin ? [{ id: 'admin' as Tab, label: 'Admin' }] : []),
  ]

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-8 font-display text-lg font-bold uppercase tracking-[0.15em] text-tn-fg">
        Settings
      </h1>

      <div className="flex flex-col gap-8 sm:flex-row sm:gap-10">
        {/* Sidebar nav */}
        <nav className="flex shrink-0 flex-row gap-1 sm:w-44 sm:flex-col">
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={[
                'rounded-lg px-4 py-2.5 text-left font-display text-sm font-medium transition-colors',
                tab === item.id
                  ? 'border-l-2 border-l-tn-blue bg-tn-panel text-tn-fg'
                  : 'text-tn-muted hover:bg-tn-panel/60 hover:text-tn-fg',
              ].join(' ')}
            >
              {item.label}
            </button>
          ))}
        </nav>

        {/* Content */}
        <div className="min-w-0 flex-1">
          {tab === 'account' && user && <AccountTab user={user} />}
          {tab === 'admin' && isAdmin && <AdminTab currentUserId={user?.id ?? -1} />}
        </div>
      </div>
    </div>
  )
}

// ── Account Tab ───────────────────────────────────────────────────────────────

function AccountTab({ user }: { user: { id: number; username: string; theme: Theme } }) {
  const queryClient = useQueryClient()

  return (
    <div className="space-y-10">
      <ChangeUsernameForm
        initialUsername={user.username}
        onSuccess={() => queryClient.invalidateQueries({ queryKey: ['me'] })}
      />
      <ChangePasswordForm />
      <ThemeSelector
        onThemeChange={() => queryClient.invalidateQueries({ queryKey: ['me'] })}
      />
    </div>
  )
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-4 font-display text-xs font-semibold uppercase tracking-widest text-tn-muted">
      {children}
    </h2>
  )
}

const inputClass =
  'w-full rounded-lg border border-tn-border/60 bg-tn-bg/60 px-4 py-2.5 text-sm text-tn-fg outline-none transition-colors placeholder:text-tn-muted/50 focus:border-tn-blue'

const btnSecondaryClass =
  'rounded-lg border border-tn-border px-4 py-2.5 font-display text-sm text-tn-fg transition-colors hover:bg-tn-highlight disabled:opacity-50'

const btnPrimaryClass =
  'rounded-lg bg-tn-purple px-4 py-2.5 font-display text-sm font-semibold text-white transition-colors hover:bg-tn-blue disabled:opacity-50'

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
      <SectionHeading>Change Username</SectionHeading>
      <form onSubmit={handleSubmit} className="flex max-w-sm gap-2">
        <input
          type="text"
          value={username}
          onChange={(e) => {
            setUsername(e.target.value)
            setStatus('idle')
          }}
          required
          className={`${inputClass} flex-1`}
        />
        <button type="submit" disabled={status === 'saving'} className={btnSecondaryClass}>
          {status === 'saving' ? 'Saving…' : 'Save'}
        </button>
      </form>
      {status === 'ok' && <p className="mt-2 font-mono text-xs text-tn-green">Username updated.</p>}
      {status === 'err' && <p className="mt-2 font-mono text-xs text-tn-red">{errMsg}</p>}
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
      <SectionHeading>Change Password</SectionHeading>
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
          className={inputClass}
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
          className={inputClass}
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
          className={inputClass}
        />
        <button type="submit" disabled={status === 'saving'} className={btnSecondaryClass}>
          {status === 'saving' ? 'Saving…' : 'Update password'}
        </button>
        {status === 'ok' && <p className="font-mono text-xs text-tn-green">Password updated.</p>}
        {status === 'err' && <p className="font-mono text-xs text-tn-red">{errMsg}</p>}
      </form>
    </section>
  )
}

function ThemeSelector({ onThemeChange }: { onThemeChange: () => void }) {
  const { theme: currentTheme } = useTheme()
  const themes: { value: Theme; label: string; glyph: string }[] = [
    { value: 'dark', label: 'Dark', glyph: '◑' },
    { value: 'light', label: 'Light', glyph: '○' },
    { value: 'system', label: 'System', glyph: '◐' },
  ]

  async function handleTheme(theme: Theme) {
    applyTheme(theme)
    try {
      await updateMe({ theme })
      onThemeChange()
    } catch {
      // best-effort
    }
  }

  return (
    <section>
      <SectionHeading>Theme</SectionHeading>
      <div className="flex gap-2">
        {themes.map(({ value, label, glyph }) => (
          <button
            key={value}
            type="button"
            onClick={() => handleTheme(value)}
            className={[
              'flex items-center gap-2 rounded-lg border px-4 py-2 font-display text-sm transition-colors',
              currentTheme === value
                ? 'border-tn-blue bg-tn-highlight text-tn-blue'
                : 'border-tn-border text-tn-muted hover:bg-tn-highlight hover:text-tn-fg',
            ].join(' ')}
          >
            <span className="font-mono">{glyph}</span>
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
    <div className="space-y-12">
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
    if (!window.confirm('Delete this user? This cannot be undone.')) return
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
      <div className="mb-4 flex items-center justify-between">
        <SectionHeading>Users</SectionHeading>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="font-display text-xs text-tn-muted transition-colors hover:text-tn-fg"
        >
          {showForm ? 'Cancel' : '+ Create User'}
        </button>
      </div>

      {errMsg && <p className="mb-3 font-mono text-xs text-tn-red">{errMsg}</p>}

      {showForm && (
        <form
          onSubmit={handleCreate}
          className="mb-5 flex flex-wrap items-end gap-3 rounded-xl border border-tn-border bg-tn-panel p-4"
        >
          <div className="flex flex-col gap-1.5">
            <label htmlFor="new-username" className="font-display text-xs text-tn-muted">
              Username
            </label>
            <input
              id="new-username"
              type="text"
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              required
              className="rounded-lg border border-tn-border/60 bg-tn-bg/60 px-3 py-2 text-sm text-tn-fg outline-none focus:border-tn-blue"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="new-password" className="font-display text-xs text-tn-muted">
              Password
            </label>
            <input
              id="new-password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              autoComplete="new-password"
              className="rounded-lg border border-tn-border/60 bg-tn-bg/60 px-3 py-2 text-sm text-tn-fg outline-none focus:border-tn-blue"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="new-role" className="font-display text-xs text-tn-muted">
              Role
            </label>
            <select
              id="new-role"
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as 'admin' | 'user')}
              className="rounded-lg border border-tn-border/60 bg-tn-bg/60 px-3 py-2 text-sm text-tn-fg outline-none focus:border-tn-blue"
            >
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <button type="submit" disabled={creating} className={btnPrimaryClass}>
            {creating ? 'Creating…' : 'Create'}
          </button>
          {createErr && <p className="w-full font-mono text-xs text-tn-red">{createErr}</p>}
        </form>
      )}

      {loading ? (
        <div className="animate-pulse space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-10 rounded-lg bg-tn-panel" />
          ))}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-tn-border">
          <table className="w-full text-sm">
            <thead className="border-b border-tn-border bg-tn-panel">
              <tr>
                <th className="px-4 py-3 text-left font-display text-xs font-semibold uppercase tracking-widest text-tn-muted">
                  Username
                </th>
                <th className="px-4 py-3 text-left font-display text-xs font-semibold uppercase tracking-widest text-tn-muted">
                  Role
                </th>
                <th className="px-4 py-3 text-left font-display text-xs font-semibold uppercase tracking-widest text-tn-muted">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-tn-border bg-tn-bg/20">
              {users.map((u) => (
                <tr key={u.id} className="transition-colors hover:bg-tn-highlight/30">
                  <td className="px-4 py-3 text-tn-fg">{u.username}</td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => handleRoleToggle(u)}
                      className={[
                        'rounded-full px-2.5 py-0.5 font-display text-xs font-semibold transition-colors',
                        u.role === 'admin'
                          ? 'bg-tn-purple/15 text-tn-purple hover:bg-tn-purple/25'
                          : 'bg-tn-highlight text-tn-muted hover:bg-tn-border',
                      ].join(' ')}
                    >
                      {u.role}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => handleDelete(u.id)}
                      disabled={u.id === currentUserId}
                      className="font-display text-xs text-tn-muted transition-colors hover:text-tn-red disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
    if (!window.confirm('Revoke this API key? This cannot be undone.')) return
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
      <div className="mb-4 flex items-center justify-between">
        <SectionHeading>API Keys</SectionHeading>
        <button
          type="button"
          onClick={() => {
            setShowForm((v) => !v)
            setNewKey(null)
          }}
          className="font-display text-xs text-tn-muted transition-colors hover:text-tn-fg"
        >
          {showForm ? 'Cancel' : '+ Generate Key'}
        </button>
      </div>

      {errMsg && <p className="mb-3 font-mono text-xs text-tn-red">{errMsg}</p>}

      {newKey && (
        <div className="mb-5 rounded-xl border border-tn-green/30 bg-tn-green/5 p-4">
          <p className="mb-3 font-mono text-xs text-tn-green">
            Key created — copy it now. It will not be shown again.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 break-all rounded-lg bg-tn-bg px-3 py-2 font-mono text-xs text-tn-fg">
              {newKey.key}
            </code>
            <button
              type="button"
              onClick={handleCopy}
              className="shrink-0 rounded-lg border border-tn-border px-3 py-2 font-display text-xs text-tn-fg transition-colors hover:bg-tn-highlight"
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <button
            type="button"
            onClick={() => setNewKey(null)}
            className="mt-3 font-display text-xs text-tn-muted hover:text-tn-fg"
          >
            Dismiss
          </button>
        </div>
      )}

      {showForm && (
        <form
          onSubmit={handleCreate}
          className="mb-5 flex items-end gap-3 rounded-xl border border-tn-border bg-tn-panel p-4"
        >
          <div className="flex flex-col gap-1.5">
            <label htmlFor="key-label" className="font-display text-xs text-tn-muted">
              Label
            </label>
            <input
              id="key-label"
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              required
              placeholder="e.g. CI pipeline"
              className="rounded-lg border border-tn-border/60 bg-tn-bg/60 px-3 py-2 text-sm text-tn-fg outline-none placeholder:text-tn-muted/50 focus:border-tn-blue"
            />
          </div>
          <button type="submit" disabled={creating} className={btnPrimaryClass}>
            {creating ? 'Generating…' : 'Generate'}
          </button>
          {createErr && <p className="w-full font-mono text-xs text-tn-red">{createErr}</p>}
        </form>
      )}

      {loading ? (
        <div className="animate-pulse space-y-2">
          {[0, 1].map((i) => (
            <div key={i} className="h-10 rounded-lg bg-tn-panel" />
          ))}
        </div>
      ) : keys.length === 0 ? (
        <p className="font-mono text-xs text-tn-muted">No API keys yet.</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-tn-border">
          <table className="w-full text-sm">
            <thead className="border-b border-tn-border bg-tn-panel">
              <tr>
                {['Label', 'Key', 'Created', 'Actions'].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left font-display text-xs font-semibold uppercase tracking-widest text-tn-muted"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-tn-border bg-tn-bg/20">
              {keys.map((k) => (
                <tr key={k.id} className="transition-colors hover:bg-tn-highlight/30">
                  <td className="px-4 py-3 text-tn-fg">{k.label}</td>
                  <td className="px-4 py-3 font-mono text-xs text-tn-muted">{k.maskedKey}</td>
                  <td className="px-4 py-3 font-mono text-xs text-tn-muted">
                    {new Date(k.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => handleRevoke(k.id)}
                      className="font-display text-xs text-tn-muted transition-colors hover:text-tn-red"
                    >
                      Revoke
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
      <SectionHeading>Data Retention</SectionHeading>
      {loading ? (
        <div className="h-10 w-48 animate-pulse rounded-lg bg-tn-panel" />
      ) : (
        <form onSubmit={handleSubmit} className="flex max-w-xs items-end gap-3">
          <div className="flex flex-1 flex-col gap-1.5">
            <label htmlFor="retention-days" className="font-display text-xs text-tn-muted">
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
              className={inputClass}
            />
          </div>
          <button type="submit" disabled={status === 'saving'} className={btnSecondaryClass}>
            {status === 'saving' ? 'Saving…' : 'Save'}
          </button>
        </form>
      )}
      {status === 'ok' && <p className="mt-2 font-mono text-xs text-tn-green">Settings saved.</p>}
      {status === 'err' && <p className="mt-2 font-mono text-xs text-tn-red">{errMsg}</p>}
    </section>
  )
}
