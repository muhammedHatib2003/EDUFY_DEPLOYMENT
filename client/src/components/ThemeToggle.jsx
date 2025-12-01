import { useEffect, useState } from 'react'
import { Sun, Moon, Leaf ,MoonStar} from 'lucide-react'

const themes = ['light', 'dark', 'emerald','black']
const icons = {
  light: <Sun size={18} />,
  dark: <Moon size={18} />,
  emerald: <Leaf size={18} />,
  black:<MoonStar size={18} />
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState(localStorage.getItem('theme') || import.meta.env.VITE_DEFAULT_THEME || 'light')

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('theme', theme)
    try {
      window.dispatchEvent(new CustomEvent('app:themechange', { detail: theme }))
    } catch {}
  }, [theme])

  const next = () => {
    const idx = themes.indexOf(theme)
    const nextIdx = (idx + 1) % themes.length
    setTheme(themes[nextIdx])
  }

  return (
    <button 
      className="btn btn-ghost btn-sm rounded-full flex items-center justify-center"
      onClick={next}
      title="Toggle theme"
    >
      {icons[theme]}
    </button>
  )
}
