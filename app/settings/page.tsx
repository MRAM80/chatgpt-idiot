'use client'

export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import AppLogo from '@/components/AppLogo'
import { CLIENT_CONFIG } from '@/lib/client-config'

type Counts = {
  drivers: number
  trucks: number
  bins: number
  customers: number
  users: number
}

const sections = [
  {
    href: '/drivers',
    title: 'Drivers & Fleet',
    description: 'Add, edit, or remove drivers and trucks. Assign trucks and manage fleet status.',
    color: 'bg-blue-50 ring-blue-200',
    titleColor: 'text-blue-900',
    descColor: 'text-blue-700',
    iconBg: 'bg-blue-100',
    icon: (
      <svg className="h-7 w-7 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 0 0-3.213-9.193 2.056 2.056 0 0 0-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 0 0-10.026 0 1.106 1.106 0 0 0-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
      </svg>
    ),
    countKey: 'drivers' as keyof Counts,
    countLabel: 'drivers',
  },
  {
    href: '/bins',
    title: 'Bin Inventory',
    description: 'Manage bin inventory, sizes, statuses, and yard availability for all active locations.',
    color: 'bg-amber-50 ring-amber-200',
    titleColor: 'text-amber-900',
    descColor: 'text-amber-700',
    iconBg: 'bg-amber-100',
    icon: (
      <svg className="h-7 w-7 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="m20.25 7.5-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z" />
      </svg>
    ),
    countKey: 'bins' as keyof Counts,
    countLabel: 'bins',
  },
  {
    href: '/customers',
    title: 'Customers',
    description: 'Keep customer records up to date. Add, edit, or remove customers from the system.',
    color: 'bg-emerald-50 ring-emerald-200',
    titleColor: 'text-emerald-900',
    descColor: 'text-emerald-700',
    iconBg: 'bg-emerald-100',
    icon: (
      <svg className="h-7 w-7 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" />
      </svg>
    ),
    countKey: 'customers' as keyof Counts,
    countLabel: 'customers',
  },
  {
    href: '/users',
    title: 'Personnel',
    description: 'Add staff, assign roles (owner, manager, dispatcher, driver), and control system access.',
    color: 'bg-violet-50 ring-violet-200',
    titleColor: 'text-violet-900',
    descColor: 'text-violet-700',
    iconBg: 'bg-violet-100',
    icon: (
      <svg className="h-7 w-7 text-violet-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" />
      </svg>
    ),
    countKey: 'users' as keyof Counts,
    countLabel: 'members',
  },
  {
    href: '/reports',
    title: 'Reports',
    description: 'Generate, export, and print customer order history for billing and invoicing.',
    color: 'bg-slate-50 ring-slate-200',
    titleColor: 'text-slate-900',
    descColor: 'text-slate-600',
    iconBg: 'bg-slate-100',
    icon: (
      <svg className="h-7 w-7 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
      </svg>
    ),
    countKey: 'users' as keyof Counts,
    countLabel: '',
    noCount: true,
  },
]

export default function SettingsPage() {
  const router = useRouter()
  const [counts, setCounts] = useState<Counts>({ drivers: 0, trucks: 0, bins: 0, customers: 0, users: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const [driversRes, trucksRes, binsRes, customersRes, usersRes] = await Promise.all([
        supabase.from('drivers').select('id', { count: 'exact', head: true }),
        supabase.from('trucks').select('id', { count: 'exact', head: true }),
        supabase.from('bins').select('id', { count: 'exact', head: true }),
        supabase.from('customers').select('id', { count: 'exact', head: true }),
        supabase.from('user_profiles').select('id', { count: 'exact', head: true }),
      ])

      setCounts({
        drivers: driversRes.count ?? 0,
        trucks: trucksRes.count ?? 0,
        bins: binsRes.count ?? 0,
        customers: customersRes.count ?? 0,
        users: usersRes.count ?? 0,
      })
      setLoading(false)
    }
    void load()
  }, [])

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="mx-auto max-w-4xl p-4 md:p-6">

        {/* Header */}
        <div className="mb-6 rounded-3xl bg-gradient-to-r from-slate-950 via-slate-900 to-slate-800 p-6 text-white shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <AppLogo className="h-9 w-auto" />
              <div>
                <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
                <p className="mt-0.5 text-sm text-slate-400">
                  System management for {CLIENT_CONFIG.name}
                </p>
              </div>
            </div>
            <Link
              href="/dashboard"
              className="self-start inline-flex items-center gap-2 rounded-2xl border border-slate-600 bg-slate-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 sm:self-auto"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
              </svg>
              Dashboard
            </Link>
          </div>
        </div>

        {/* Counts summary bar */}
        {!loading && (
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-slate-200 text-center">
              <div className="text-2xl font-bold text-slate-900">{counts.drivers}</div>
              <div className="mt-0.5 text-xs font-medium text-slate-500">Drivers</div>
            </div>
            <div className="rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-slate-200 text-center">
              <div className="text-2xl font-bold text-slate-900">{counts.trucks}</div>
              <div className="mt-0.5 text-xs font-medium text-slate-500">Trucks</div>
            </div>
            <div className="rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-slate-200 text-center">
              <div className="text-2xl font-bold text-slate-900">{counts.bins}</div>
              <div className="mt-0.5 text-xs font-medium text-slate-500">Bins</div>
            </div>
            <div className="rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-slate-200 text-center">
              <div className="text-2xl font-bold text-slate-900">{counts.customers}</div>
              <div className="mt-0.5 text-xs font-medium text-slate-500">Customers</div>
            </div>
          </div>
        )}

        {/* Management sections */}
        <div className="grid gap-4 sm:grid-cols-2">
          {sections.map((s) => (
            <Link
              key={s.href}
              href={s.href}
              className={`group rounded-3xl p-6 shadow-sm ring-1 transition hover:-translate-y-0.5 hover:shadow-md ${s.color}`}
            >
              <div className="flex items-start gap-4">
                <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${s.iconBg}`}>
                  {s.icon}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-lg font-bold ${s.titleColor}`}>{s.title}</span>
                    {!loading && !s.noCount && (
                      <span className={`text-sm font-semibold ${s.titleColor} opacity-60`}>
                        {counts[s.countKey]} {s.countLabel}
                      </span>
                    )}
                  </div>
                  <p className={`mt-1 text-sm ${s.descColor} opacity-80`}>{s.description}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>

      </div>
    </div>
  )
}
