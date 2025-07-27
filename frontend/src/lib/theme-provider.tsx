import { createContext, useContext, useEffect, useState } from "react"

type Theme = "dark" | "light" | "system"

interface ThemeProviderState {
  homepageTheme: Theme
  studioTheme: Theme
  setHomepageTheme: (theme: Theme) => void
  setStudioTheme: (theme: Theme) => void
}

const ThemeProviderContext = createContext<ThemeProviderState | undefined>(undefined)

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [homepageTheme, setHomepageThemeState] = useState<Theme>("system")
  const [studioTheme, setStudioThemeState] = useState<Theme>("system")

  const setHomepageTheme = (theme: Theme) => {
    setHomepageThemeState(theme)
    localStorage.setItem("theme-homepage", theme)
  }

  const setStudioTheme = (theme: Theme) => {
    setStudioThemeState(theme)
    localStorage.setItem("theme-studio", theme)
  }

  useEffect(() => {
    // Load saved themes
    const savedHomepageTheme = localStorage.getItem("theme-homepage") as Theme
    const savedStudioTheme = localStorage.getItem("theme-studio") as Theme
    
    if (savedHomepageTheme) setHomepageThemeState(savedHomepageTheme)
    if (savedStudioTheme) setStudioThemeState(savedStudioTheme)
  }, [])

  useEffect(() => {
    // Only apply homepage theme to root element
    const root = window.document.documentElement
    
    root.classList.remove("light", "dark")
    
    if (homepageTheme === "system") {
      const systemTheme = window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      root.classList.add(systemTheme)
    } else {
      root.classList.add(homepageTheme)
    }
  }, [homepageTheme])

  return (
    <ThemeProviderContext.Provider value={{ 
      homepageTheme, 
      studioTheme, 
      setHomepageTheme, 
      setStudioTheme 
    }}>
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
  const { homepageTheme, studioTheme, setHomepageTheme, setStudioTheme } = useTheme()
  
  const resolveTheme = (theme: Theme) => {
    return theme === 'system' 
      ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? 'dark' : 'light')
      : theme
  }
  
  return {
    mode: resolveTheme(homepageTheme),
    studioMode: resolveTheme(studioTheme),
    toggleUITheme: () => {
      const newTheme = resolveTheme(homepageTheme) === 'dark' ? 'light' : 'dark'
      setHomepageTheme(newTheme)
    },
    toggleStudioTheme: () => {
      const newTheme = resolveTheme(studioTheme) === 'dark' ? 'light' : 'dark'
      setStudioTheme(newTheme)
    }
  }
}