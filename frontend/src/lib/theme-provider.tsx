import { createContext, useContext, useEffect, useState } from "react"

type Theme = "dark" | "light" | "system"
type ThemeContext = "homepage" | "studio"

interface ThemeProviderState {
  themes: Record<ThemeContext, Theme>
  setTheme: (context: ThemeContext, theme: Theme) => void
  currentContext: ThemeContext
  setCurrentContext: (context: ThemeContext) => void
}

const ThemeProviderContext = createContext<ThemeProviderState | undefined>(undefined)

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themes, setThemes] = useState<Record<ThemeContext, Theme>>({
    homepage: "system",
    studio: "system"
  })
  const [currentContext, setCurrentContext] = useState<ThemeContext>("homepage")

  const setTheme = (context: ThemeContext, theme: Theme) => {
    setThemes(prev => ({ ...prev, [context]: theme }))
    localStorage.setItem(`theme-${context}`, theme)
  }

  useEffect(() => {
    // Load saved themes
    const homepageTheme = localStorage.getItem("theme-homepage") as Theme
    const studioTheme = localStorage.getItem("theme-studio") as Theme
    
    setThemes({
      homepage: homepageTheme || "system",
      studio: studioTheme || "system"
    })
  }, [])

  useEffect(() => {
    // Apply current context theme
    const root = window.document.documentElement
    const theme = themes[currentContext]
    
    root.classList.remove("light", "dark")
    
    if (theme === "system") {
      const systemTheme = window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      root.classList.add(systemTheme)
    } else {
      root.classList.add(theme)
    }
  }, [currentContext, themes])

  return (
    <ThemeProviderContext.Provider value={{ themes, setTheme, currentContext, setCurrentContext }}>
      {children}
    </ThemeProviderContext.Provider>
  )
}

export const useTheme = () => {
  const context = useContext(ThemeProviderContext)
  if (!context) throw new Error("useTheme must be used within ThemeProvider")
  return context
}

// Compatibility hook for components that were already converted to use studioMode
export const useAppTheme = () => {
  const { themes, setTheme, currentContext } = useTheme()
  
  const currentTheme = themes[currentContext]
  const resolvedTheme = currentTheme === 'system' 
    ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? 'dark' : 'light')
    : currentTheme
  
  return {
    mode: themes.homepage === 'system' 
      ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? 'dark' : 'light')
      : themes.homepage,
    studioMode: themes.studio === 'system'
      ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? 'dark' : 'light') 
      : themes.studio,
    toggleUITheme: () => {
      const newTheme = themes.homepage === 'dark' ? 'light' : 'dark'
      setTheme('homepage', newTheme)
    },
    toggleStudioTheme: () => {
      const newTheme = themes.studio === 'dark' ? 'light' : 'dark'
      setTheme('studio', newTheme)
    }
  }
}