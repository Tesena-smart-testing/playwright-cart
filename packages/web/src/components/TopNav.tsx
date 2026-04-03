import { useTheme } from '../hooks/useTheme.js'
import type { Theme } from '../lib/theme.js'

const THEME_ICONS: Record<Theme, string> = {
  system: '💻',
  dark: '🌙',
  light: '☀️',
}

const THEME_LABELS: Record<Theme, string> = {
  system: 'System',
  dark: 'Dark',
  light: 'Light',
}

export default function TopNav() {
  const { theme, toggle } = useTheme()

  return (
    <nav className="border-b border-tn-border bg-tn-panel px-4 py-3">
      <div className="mx-auto flex max-w-6xl items-center">
        <a href="/" className="text-lg font-bold text-tn-purple hover:opacity-80 transition-opacity">
          🎭 Playwright Cart
        </a>
        <div className="ml-auto">
          <button
            type="button"
            onClick={toggle}
            title={`Theme: ${THEME_LABELS[theme]} — click to cycle`}
            className="flex items-center gap-1.5 rounded px-3 py-1.5 text-sm text-tn-muted hover:bg-tn-highlight hover:text-tn-fg transition-colors"
          >
            <span>{THEME_ICONS[theme]}</span>
            <span>{THEME_LABELS[theme]}</span>
          </button>
        </div>
      </div>
    </nav>
  )
}
