'use client'

export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import AppLogo from '@/components/AppLogo'
import { useRole } from '@/hooks/useRole'
import { can } from '@/lib/roles'

const sections = [
  {
    href: '/drivers',
    title: 'Drivers & Trucks',
    description: 'Add or remove drivers, assign trucks, and manage fleet status.',
    accent: 'bg-blue-50 ring-blue-200 text-blue-900',
  },
  {
    href: '/bins',
    title: 'Bins',
    description: 'Manage bin inventory, sizes, and yard availability.',
    accent: 'bg-amber-50 ring-amber-200 text-amber-900',
  },
  {
    href: '/customers',
    title: 'Customers',
    description: 'Maintain active customer records.',
    accent: 'bg-emerald-50 ring-emerald-200 text-emerald-900',
  },
  {
    href: '/users',
    title: 'Team & Roles',
    description: 'Invite team members and control system access by role.',
    accent: 'bg-violet-50 ring-violet-200 text-violet-900',
    permission: 'canManageUsers' as const,
  },
]

export default function SettingsPage() {
  const router = useRouter()
  const { role, loading } = useRole()

  useEffect(() => {
    if (!loading && !can(role, 'canViewDashboard')) {
      router.push('/dashboard')
    }
  }, [loading, role, router])

  const visibleSections = sections.filter(
    (s) => !s.permission || can(role, s.permission)
  )

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="mx-auto max-w-5xl p-4 md:p-6">
        <div className="mb-6 rounded-3xl bg-gradient-to-r from-slate-950 via-slate-900 to-slate-800 p-6 text-white shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-4">
              <AppLogo className="h-9 w-auto" />
              <div>
                <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
                <p className="mt-1 text-sm text-slate-400">System configuration and management</p>
              </div>
            </div>
            <Link href="/dashboard" className="rounded-2xl border border-slate-600 bg-slate-800 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-700">
              ← Dashboard
            </Link>
          </div>
        </div>

        {loading ? (
          <div className="rounded-3xl bg-white p-10 text-center text-sm text-slate-500 shadow-sm ring-1 ring-slate-200">
            Loading...
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {visibleSections.map((s) => (
              <Link
                key={s.href}
                href={s.href}
                className={`rounded-3xl p-6 shadow-sm ring-1 transition hover:-translate-y-0.5 hover:shadow-md ${s.accent}`}
              >
                <div className="text-lg font-bold">{s.title}</div>
                <div className="mt-2 text-sm opacity-80">{s.description}</div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
