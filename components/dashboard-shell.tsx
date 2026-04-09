'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { ReactNode } from 'react'
import { supabase } from '@/lib/supabase'

type NavItem = {
  href: string
  label: string
}

type DashboardShellProps = {
  title: string
  subtitle?: string
  roleLabel?: string
  userName?: string
  navItems: NavItem[]
  children: ReactNode
}

export default function DashboardShell({
  title,
  subtitle,
  roleLabel,
  userName,
  navItems,
  children,
}: DashboardShellProps) {
  const pathname = usePathname()
  const router = useRouter()

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="border-b bg-slate-900 text-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
          <div>
            <h1 className="text-2xl font-bold">{title}</h1>
            <p className="text-sm text-slate-300">
              {subtitle || 'SIMPLIITRASH Operations'}
            </p>
          </div>

          <div className="text-right">
            <div className="text-sm font-medium">{userName || 'User'}</div>
            <div className="text-xs text-slate-300">{roleLabel || 'Role'}</div>
            <button
              onClick={handleLogout}
              className="mt-2 rounded bg-red-500 px-3 py-1 text-sm font-medium text-white hover:bg-red-600"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-6 px-4 py-6 md:grid-cols-[220px_1fr]">
        <aside className="rounded-xl bg-white p-4 shadow">
          <nav className="space-y-2">
            {navItems.map((item) => {
              const active = pathname === item.href
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`block rounded-lg px-3 py-2 text-sm font-medium ${
                    active
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {item.label}
                </Link>
              )
            })}
          </nav>
        </aside>

        <main className="rounded-xl bg-white p-6 shadow">{children}</main>
      </div>
    </div>
  )
}