'use client'

import { useEffect, useState } from 'react'
import { CLIENT_CONFIG } from '@/lib/client-config'

const STORAGE_KEY = CLIENT_CONFIG.themeStorageKey

function applyTheme(dark: boolean) {
  if (dark) {
    document.documentElement.classList.add('dark')
  } else {
    document.documentElement.classList.remove('dark')
  }
}

export default function ThemeToggle() {
  const [dark, setDark] = useState(false)
  const [isManual, setIsManual] = useState(false)

  useEffect(() => {
    // Sync state with current DOM
    const isDark = document.documentElement.classList.contains('dark')
    const stored = localStorage.getItem(STORAGE_KEY)
    setDark(isDark)
    setIsManual(!!stored)

    // Listen for system preference changes — only applies when no manual override
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    function onSystemChange(e: MediaQueryListEvent) {
      const hasManual = !!localStorage.getItem(STORAGE_KEY)
      if (!hasManual) {
        setDark(e.matches)
        applyTheme(e.matches)
      }
    }
    mq.addEventListener('change', onSystemChange)
    return () => mq.removeEventListener('change', onSystemChange)
  }, [])

  function toggle() {
    const next = !dark
    setDark(next)
    setIsManual(true)
    localStorage.setItem(STORAGE_KEY, next ? 'dark' : 'light')
    applyTheme(next)
  }

  function resetToAuto() {
    localStorage.removeItem(STORAGE_KEY)
    setIsManual(false)
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    setDark(prefersDark)
    applyTheme(prefersDark)
  }

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={toggle}
        aria-label="Toggle dark mode"
        className="flex items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-base text-slate-600 hover:bg-slate-50 transition-colors"
        title={dark ? 'Switch to light' : 'Switch to dark'}
      >
        {dark ? '☀️' : '🌙'}
      </button>
      {isManual && (
        <button
          onClick={resetToAuto}
          aria-label="Reset to system theme"
          className="flex items-center justify-center rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-400 hover:bg-slate-50 transition-colors"
          title="Follow system theme"
        >
          Auto
        </button>
      )}
    </div>
  )
}
