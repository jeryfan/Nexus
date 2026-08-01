import { ThemeContext } from '@renderer/hooks/useTheme'
import { ThemeMode } from '@shared/data/preference/preferenceTypes'
import type { PropsWithChildren } from 'react'
import { useEffect, useState } from 'react'

function getSystemTheme(): ThemeMode {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? ThemeMode.dark
    : ThemeMode.light
}

/** Minimal theme boundary required by the migrated ProviderSettings tree. */
export function ThemeProvider({ children }: PropsWithChildren): React.JSX.Element {
  const [theme, setThemeState] = useState<ThemeMode>(getSystemTheme)

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const update = (): void => setThemeState(media.matches ? ThemeMode.dark : ThemeMode.light)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === ThemeMode.dark)
    document.documentElement.classList.toggle('light', theme === ThemeMode.light)
    document.body.classList.toggle('dark', theme === ThemeMode.dark)
    document.body.classList.toggle('light', theme === ThemeMode.light)
    document.documentElement.lang = 'zh-CN'
  }, [theme])

  return (
    <ThemeContext.Provider
      value={{
        theme,
        settedTheme: ThemeMode.system,
        toggleTheme: () => {},
        setTheme: setThemeState
      }}
    >
      {children}
    </ThemeContext.Provider>
  )
}
