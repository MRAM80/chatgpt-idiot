'use client'

import { CLIENT_CONFIG } from '@/lib/client-config'

export default function AppLogo({ className = 'h-8 w-auto' }: { className?: string }) {
  if (!CLIENT_CONFIG.logoUrl) return null
  return (
    <img
      src={CLIENT_CONFIG.logoUrl}
      alt={CLIENT_CONFIG.name}
      className={`object-contain shrink-0 ${className}`}
    />
  )
}
