import { useEffect, useState } from 'react'
import { type Theme, getStoredTheme } from '../lib/theme.js'

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(getStoredTheme)

  useEffect(() => {
    function handleThemeChanged(e: Event) {
      setTheme((e as CustomEvent<Theme>).detail)
    }
    window.addEventListener('theme-changed', handleThemeChanged)
    return () => window.removeEventListener('theme-changed', handleThemeChanged)
  }, [])

  return { theme }
}
