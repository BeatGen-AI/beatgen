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
    // Load saved themes on mount
    const savedHomepageTheme = localStorage.getItem("theme-homepage") as Theme
    const savedStudioTheme = localStorage.getItem("theme-studio") as Theme
    
    if (savedHomepageTheme) setHomepageThemeState(savedHomepageTheme)
    if (savedStudioTheme) setStudioThemeState(savedStudioTheme)
  }, [])

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

// Track the current route globally to determine which theme should take precedence
let currentRoute: 'homepage' | 'studio' | null = null

// Hook to apply theme based on current page with route-based priority
export function usePageTheme(page: 'homepage' | 'studio') {
  const { homepageTheme, studioTheme } = useTheme()
  const theme = page === 'studio' ? studioTheme : homepageTheme

  useEffect(() => {
    // Determine if this is a studio route (studio always takes precedence)
    const isStudioRoute = window.location.pathname === '/studio'
    
    // NEVER apply any global theme when on studio route - studio uses manual styling only
    if (isStudioRoute) {
      return // Don't apply any global theme when on studio route
    }
    
    // If we're not on a studio route, only homepage theme calls should apply
    if (!isStudioRoute && page === 'studio') {
      return // Don't apply studio theme when not on studio route
    }
    
    // Set the current route
    currentRoute = page
    
    // Apply theme to document (only for non-studio routes)
    const root = document.documentElement
    root.classList.remove("light", "dark")
    
    const resolvedTheme = theme === "system" 
      ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
      : theme
    
    root.classList.add(resolvedTheme)
    root.setAttribute('data-page', page)
  }, [theme, page])

  return theme
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