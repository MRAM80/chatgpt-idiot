'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { ReactNode } from 'react'

type NavItem = {
  href: string
  label: string
}

type DashboardShellProps = {
  title?: string
  subtitle?: string
  roleLabel?: string
  userName?: string
  onLogout?: () => void | Promise<void>
  navItems?: NavItem[]
  children: ReactNode
}

export default function DashboardShell({
  title = 'Dashboard',
  subtitle = 'Welcome back',
  roleLabel,
  userName,
  onLogout,
  navItems = [],
  children,
}: DashboardShellProps) {
  const pathname = usePathname()
  const router = useRouter()

  async function handleLogoutClick() {
    if (onLogout) {
      await onLogout()
      return
    }

    router.push('/login')
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-[1600px]">
        <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-white lg:flex lg:flex-col">
          <div className="border-b border-slate-200 px-6 py-6">
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">
              SimpliiTrash
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Waste Management System
            </p>
          </div>

          <div className="px-4 py-5">
            <div className="rounded-3xl bg-slate-950 px-5 py-4 text-white shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-300">
                Logged in as
              </p>
              <p className="mt-3 text-lg font-semibold">{userName || 'Admin User'}</p>
              <p className="text-sm text-slate-300">{roleLabel || 'Admin'}</p>
            </div>
          </div>

          <nav className="flex-1 space-y-2 px-4">
            {navItems.map((item) => {
              const active = pathname === item.href

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center rounded-2xl px-4 py-3 text-sm font-medium transition ${
                    active
                      ? 'bg-slate-950 text-white shadow-sm'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  {item.label}
                </Link>
              )
            })}
          </nav>

          <div className="border-t border-slate-200 p-4">
            <button
              onClick={handleLogoutClick}
              className="w-full rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600 transition hover:bg-red-100"
            >
              Logout
            </button>
          </div>
        </aside>

        <main className="flex-1 p-4 md:p-6 lg:p-8">
          <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.25em] text-emerald-700">
                  {roleLabel || 'Dashboard'}
                </p>
                <h2 className="mt-3 text-4xl font-bold tracking-tight text-slate-900">
                  {title}
                </h2>
                <p className="mt-2 max-w-2xl text-sm text-slate-500">{subtitle}</p>
              </div>

              <div className="flex gap-3">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    System
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">Active</p>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Today
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">Live Ops</p>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6">{children}</div>
        </main>
      </div>
    </div>
  )
}