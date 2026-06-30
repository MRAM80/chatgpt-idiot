'use client'

import { useEffect } from 'react'
import { CLIENT_CONFIG } from '@/lib/client-config'

export default function ThemeWatcher() {
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')

    function apply(dark: boolean) {
      document.documentElement.classList.toggle('dark', dark)
    }

    apply(mq.matches)

    function onChange(e: MediaQueryListEvent) {
      apply(e.matches)
    }

    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  return null
}
