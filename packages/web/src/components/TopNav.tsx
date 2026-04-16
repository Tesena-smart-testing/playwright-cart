import { useQueryClient } from '@tanstack/react-query'
import { type ReactElement, useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useCurrentUser } from '../hooks/useCurrentUser.js'
import { useSessionTimer } from '../hooks/useSessionTimer.js'
import { useTheme } from '../hooks/useTheme.js'
import { logout, updateMe } from '../lib/api.js'
import { applyTheme, cycleTheme, getStoredTheme, type Theme } from '../lib/theme.js'
import SessionIndicator from './SessionIndicator.js'
import { MonitorIcon, MoonIcon, SunIcon } from './ThemeIcons.js'

const THEME_ICONS: Record<Theme, ReactElement> = {
  light: <SunIcon />,
  dark: <MoonIcon />,
  system: <MonitorIcon />,
}

const THEME_LABELS: Record<Theme, string> = {
  system: 'System',
  dark: 'Dark',
  light: 'Light',
}

const NAV_LINKS = [
  { to: '/', label: 'Runs' },
  { to: '/charts', label: 'Charts' },
  { to: '/settings', label: 'Settings' },
]

export default function TopNav() {
  const { theme } = useTheme()
  const { user } = useCurrentUser()
  const sessionTimer = useSessionTimer(user?.expiresAt)
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const location = useLocation()
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!user) return
    const localTheme = getStoredTheme()
    if (user.theme !== localTheme) {
      applyTheme(user.theme)
    }
  }, [user])

  useEffect(() => {
    if (!isOpen) return
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [isOpen])

  function handleThemeToggle() {
    const nextTheme = cycleTheme(theme)
    applyTheme(nextTheme) // fires 'theme-changed' event → all useTheme() instances update
    if (user) {
      updateMe({ theme: nextTheme })
        .then(() => queryClient.invalidateQueries({ queryKey: ['me'] }))
        .catch(() => {})
    }
  }

  async function handleLogout() {
    setIsOpen(false)
    await logout()
    queryClient.setQueryData(['me'], null)
    navigate('/login')
  }

  function isActive(to: string) {
    if (to === '/') return location.pathname === '/'
    return location.pathname.startsWith(to)
  }

  return (
    <nav className="border-b border-tn-border px-6 py-2.5">
      <div className="mx-auto flex max-w-7xl items-center gap-8">
        {/* Logo */}
        <a
          href="/"
          className="font-display text-sm font-bold tracking-[0.2em] text-tn-fg transition-opacity hover:opacity-70"
        >
          PLAYWRIGHT CART
        </a>

        {/* Center nav links */}
        <div className="flex items-center gap-1">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className={[
                'font-display rounded px-3 py-1.5 text-sm tracking-wide transition-colors',
                isActive(link.to) ? 'text-tn-fg' : 'text-tn-muted hover:text-tn-fg',
              ].join(' ')}
            >
              {link.label}
            </Link>
          ))}
        </div>

        {/* Right side */}
        <div className="ml-auto flex items-center gap-2">
          {/* Theme toggle */}
          <button
            type="button"
            onClick={handleThemeToggle}
            title={`Theme: ${THEME_LABELS[theme]} — click to cycle`}
            className="flex items-center gap-1 rounded px-2.5 py-1.5 text-sm text-tn-muted transition-colors hover:bg-tn-highlight hover:text-tn-fg"
          >
            {THEME_ICONS[theme]}
          </button>

          {/* Session expiry indicator */}
          {user && sessionTimer && <SessionIndicator timer={sessionTimer} />}

          {/* User dropdown */}
          {user && (
            <div className="relative" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => setIsOpen((o) => !o)}
                className="flex items-center gap-2 rounded border border-tn-border px-3 py-1.5 text-xs transition-colors hover:bg-tn-highlight"
              >
                <span className="flex size-5 items-center justify-center rounded-full bg-tn-highlight font-display text-xs font-semibold text-tn-fg">
                  {user.username[0].toUpperCase()}
                </span>
                <span className="font-mono text-tn-muted">{user.username}</span>
                <span className="text-xs text-tn-muted opacity-60">{isOpen ? '▲' : '▼'}</span>
              </button>

              {isOpen && (
                <div className="absolute right-0 top-full z-50 mt-1 min-w-[120px] overflow-hidden rounded-lg border border-tn-border bg-tn-panel shadow-xl">
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="block w-full px-4 py-2.5 text-left font-display text-xs tracking-wide text-tn-muted transition-colors hover:bg-tn-highlight hover:text-tn-red"
                  >
                    Sign out
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </nav>
  )
}
