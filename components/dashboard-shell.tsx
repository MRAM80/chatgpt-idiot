'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { ReactNode, useMemo } from 'react'
import { ArrowLeft, Bell, ChevronRight, LogOut, ShieldCheck, Truck } from 'lucide-react'
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
  navItems?: NavItem[]
  children: ReactNode
}

export default function DashboardShell({
  title,
  subtitle,
  roleLabel,
  userName,
  navItems = [],
  children,
}: DashboardShellProps) {
  const pathname = usePathname()
  const router = useRouter()

  const initials = useMemo(() => {
    if (!userName) return 'ST'
    return userName
      .split(' ')
      .map((part) => part[0])
      .slice(0, 2)
      .join('')
      .toUpperCase()
  }, [userName])

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <div className="grid min-h-screen lg:grid-cols-[280px_1fr]">
        <aside className="border-b border-slate-200 bg-slate-950 text-white lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between px-6 py-5 lg:block">
            <div>
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-500/20 text-emerald-300">
                  <Truck className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-lg font-bold tracking-tight">SimpliiTrash</p>
                  <p className="text-xs text-slate-400">Operations Control</p>
                </div>
              </div>
            </div>
          </div>

          <div className="px-4 pb-6">
            <div className="mb-5 rounded-3xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 font-bold text-white">
                  {initials}
                </div>
                <div>
                  <p className="font-semibold text-white">{userName || 'Operations User'}</p>
                  <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-1 text-[11px] font-semibold text-emerald-300">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    {roleLabel || 'Operations'}
                  </div>
                </div>
              </div>
            </div>

            <nav className="space-y-1.5">
              {navItems.map((item) => {
                const active = pathname === item.href
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center justify-between rounded-2xl px-4 py-3 text-sm font-medium transition ${
                      active
                        ? 'bg-white text-slate-950 shadow-sm'
                        : 'text-slate-300 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    <span>{item.label}</span>
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                )
              })}
            </nav>

            <button
              onClick={handleLogout}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              <LogOut className="h-4 w-4" />
              Exit
            </button>
          </div>
        </aside>

        <main className="min-w-0">
          <header className="border-b border-slate-200 bg-white/90 backdrop-blur">
            <div className="flex flex-col gap-4 px-4 py-5 sm:px-6 xl:flex-row xl:items-center xl:justify-between xl:px-8">
              <div>
                <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                  <ArrowLeft className="h-3.5 w-3.5 rotate-180" />
                  SimpliiTrash control center
                </div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-950">{title}</h1>
                {subtitle ? <p className="mt-1 text-sm text-slate-500">{subtitle}</p> : null}
              </div>

              <div className="flex items-center gap-3">
                <div className="hidden rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-600 sm:flex sm:items-center sm:gap-2">
                  <Bell className="h-4 w-4" />
                  Live operations view
                </div>
                <button
                  onClick={() => router.back()}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Go back
                </button>
              </div>
            </div>
          </header>

          <div className="px-4 py-6 sm:px-6 xl:px-8">{children}</div>
        </main>
      </div>
    </div>
  )
}
