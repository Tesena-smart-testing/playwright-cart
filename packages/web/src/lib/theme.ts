export type Theme = 'dark' | 'light' | 'system'

const CYCLE_ORDER: Theme[] = ['system', 'dark', 'light']

export function getStoredTheme(): Theme {
  const stored = localStorage.getItem('theme')
  return stored === 'dark' || stored === 'light' ? stored : 'system'
}

export function applyTheme(theme: Theme): void {
  const root = document.documentElement
  if (theme === 'system') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    root.setAttribute('data-theme', prefersDark ? 'dark' : 'light')
    localStorage.removeItem('theme')
  } else {
    root.setAttribute('data-theme', theme)
    localStorage.setItem('theme', theme)
  }
  window.dispatchEvent(new CustomEvent('theme-changed', { detail: theme }))
}

export function cycleTheme(current: Theme): Theme {
  return CYCLE_ORDER[(CYCLE_ORDER.indexOf(current) + 1) % CYCLE_ORDER.length]
}
