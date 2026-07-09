'use client'

export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import AppLogo from '@/components/AppLogo'
import { useRole } from '@/hooks/useRole'
import { can } from '@/lib/roles'

export default function ReportsPage() {
  const router = useRouter()
  const { role, loading: roleLoading } = useRole()

  useEffect(() => {
    if (!roleLoading && role !== null && !can(role, 'canViewReports')) {
      router.push(role === 'driver' ? '/driver' : '/dispatch')
    }
  }, [roleLoading, role])

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="mx-auto max-w-5xl p-4 md:p-6">

        {/* Header */}
        <div className="mb-8 rounded-3xl bg-gradient-to-r from-slate-950 via-slate-900 to-slate-800 p-6 text-white shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <AppLogo className="h-9 w-auto" />
              <div>
                <h1 className="text-2xl font-bold tracking-tight">Statements & Performance</h1>
                <p className="mt-0.5 text-sm text-slate-400">Billing, invoicing, and operational analytics</p>
              </div>
            </div>
            <Link href="/dashboard" className="self-start inline-flex items-center gap-2 rounded-2xl border border-slate-600 bg-slate-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 sm:self-auto">
              ← Dashboard
            </Link>
          </div>
        </div>

        {/* Sub-page cards */}
        <div className="grid gap-6 sm:grid-cols-2">

          <Link href="/reports/statements"
            className="group rounded-3xl bg-white p-8 shadow-sm ring-1 ring-slate-200 transition hover:-translate-y-1 hover:ring-blue-400 hover:shadow-xl cursor-pointer">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 ring-1 ring-blue-200 group-hover:bg-blue-100">
              <svg className="h-7 w-7 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-slate-900 group-hover:text-blue-700">Statements & Invoices</h2>
            <p className="mt-2 text-sm text-slate-600 leading-relaxed">
              Generate detailed customer statements by order type, date range, and status. Export to Excel or print a professional PDF invoice.
            </p>
            <div className="mt-6 flex items-center text-sm font-semibold text-blue-600 group-hover:text-blue-700">
              Open →
            </div>
          </Link>

          <Link href="/reports/performance"
            className="group rounded-3xl bg-white p-8 shadow-sm ring-1 ring-slate-200 transition hover:-translate-y-1 hover:ring-emerald-400 hover:shadow-xl cursor-pointer">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 ring-1 ring-emerald-200 group-hover:bg-emerald-100">
              <svg className="h-7 w-7 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-slate-900 group-hover:text-emerald-700">Driver Performance</h2>
            <p className="mt-2 text-sm text-slate-600 leading-relaxed">
              Analyze driver output, completion rates, order type breakdown, and daily volume trends. Generate visual charts and export reports.
            </p>
            <div className="mt-6 flex items-center text-sm font-semibold text-emerald-600 group-hover:text-emerald-700">
              Open →
            </div>
          </Link>

        </div>
      </div>
    </div>
  )
}
