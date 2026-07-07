'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { CLIENT_CONFIG } from '@/lib/client-config'
import AppLogo from '@/components/AppLogo'
import { useRole } from '@/hooks/useRole'
import { can } from '@/lib/roles'

type Order = {
  id: string
  ticket_number: string | null
  customer_name: string | null
  customer_id?: string | null
  pickup_address: string | null
  service_address?: string | null
  bin_type: string | null
  bin_size: string | null
  order_type: string | null
  driver_id: string | null
  driver_notes?: string | null
  scheduled_date: string | null
  status: string | null
}

type Driver = { id: string; name: string | null }
type Customer = { id: string; name: string | null }

const TABLE_NAME = 'order'

const statusClasses: Record<string, string> = {
  unassigned: 'bg-slate-100 text-slate-700 border-slate-200',
  assigned: 'bg-blue-100 text-blue-700 border-blue-200',
  in_progress: 'bg-amber-100 text-amber-700 border-amber-200',
  completed: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  issue: 'bg-rose-100 text-rose-700 border-rose-200',
}

function formatStatus(s: string | null | undefined) {
  if (!s) return 'Unassigned'
  return s.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

export default function ReportsPage() {
  const router = useRouter()
  const supabase = createClient()
  const { role, loading: roleLoading } = useRole()

  useEffect(() => {
    if (!roleLoading && role !== null && !can(role, 'canViewReports')) {
      router.push(role === 'driver' ? '/driver' : '/dispatch')
    }
  }, [roleLoading, role])

  const [customers, setCustomers] = useState<Customer[]>([])
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [customerId, setCustomerId] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [rows, setRows] = useState<Order[]>([])
  const [loading, setLoading] = useState(false)
  const [customerName, setCustomerName] = useState('')
  const [pageLoading, setPageLoading] = useState(true)

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const [custRes, drvRes] = await Promise.all([
        supabase.from('customers').select('id,name').order('name'),
        supabase.from('drivers').select('id,name').order('name'),
      ])
      setCustomers((custRes.data as Customer[]) || [])
      setDrivers((drvRes.data as Driver[]) || [])
      setPageLoading(false)
    }
    void init()
  }, [])

  const driverMap = useMemo(() =>
    drivers.reduce<Record<string, string>>((acc, d) => { acc[d.id] = d.name || '—'; return acc }, {}),
    [drivers]
  )

  async function runReport() {
    if (!customerId || !dateFrom || !dateTo) return
    setLoading(true)
    const c = customers.find(c => c.id === customerId)
    setCustomerName(c?.name || '')
    const { data, error } = await supabase
      .from(TABLE_NAME)
      .select('id,ticket_number,customer_name,customer_id,service_address,pickup_address,order_type,bin_size,bin_type,status,scheduled_date,driver_id,driver_notes')
      .eq('customer_id', customerId)
      .gte('scheduled_date', dateFrom)
      .lte('scheduled_date', dateTo)
      .order('scheduled_date', { ascending: true })
    if (!error) setRows((data as Order[]) || [])
    setLoading(false)
  }

  function exportCSV() {
    if (!rows.length) return
    const headers = ['Ticket', 'Date', 'Type', 'Bin Size', 'Bin Type', 'Address', 'Status', 'Driver', 'Notes']
    const data = rows.map(o => [
      o.ticket_number || '',
      o.scheduled_date || '',
      o.order_type || '',
      o.bin_size || '',
      o.bin_type || '',
      o.service_address || o.pickup_address || '',
      o.status || '',
      driverMap[o.driver_id || ''] || '',
      o.driver_notes || '',
    ])
    const csv = [headers, ...data].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `report-${customerName}-${dateFrom}-${dateTo}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  function printReport() {
    const win = window.open('', '_blank')
    if (!win) return
    const tableRows = rows.map(o => `
      <tr>
        <td>${o.ticket_number || '—'}</td><td>${o.scheduled_date || '—'}</td>
        <td>${o.order_type || '—'}</td><td>${[o.bin_size, o.bin_type].filter(Boolean).join(' ') || '—'}</td>
        <td>${o.service_address || o.pickup_address || '—'}</td><td>${o.status || '—'}</td>
        <td>${driverMap[o.driver_id || ''] || '—'}</td><td>${o.driver_notes || '—'}</td>
      </tr>`).join('')
    win.document.write(`<html><head><title>Report — ${customerName}</title>
      <style>body{font-family:Arial,sans-serif;font-size:12px;padding:20px}h2{margin-bottom:4px}p{margin:0 0 16px;color:#666}table{width:100%;border-collapse:collapse}th{background:#f1f5f9;text-align:left;padding:8px;font-size:11px;text-transform:uppercase;letter-spacing:.05em}td{padding:8px;border-bottom:1px solid #e2e8f0;vertical-align:top}@media print{body{padding:0}}</style>
      </head><body>
      <h2>${CLIENT_CONFIG.name} — Customer Statement</h2>
      <p>${customerName} &nbsp;|&nbsp; ${dateFrom} to ${dateTo} &nbsp;|&nbsp; ${rows.length} orders</p>
      <table><thead><tr><th>Ticket</th><th>Date</th><th>Type</th><th>Bin</th><th>Address</th><th>Status</th><th>Driver</th><th>Notes</th></tr></thead>
      <tbody>${tableRows}</tbody></table></body></html>`)
    win.document.close()
    win.print()
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="mx-auto max-w-5xl p-4 md:p-6">

        {/* Header */}
        <div className="mb-6 rounded-3xl bg-gradient-to-r from-slate-950 via-slate-900 to-slate-800 p-6 text-white shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <AppLogo className="h-9 w-auto" />
              <div>
                <h1 className="text-2xl font-bold tracking-tight">Statements & Performance</h1>
                <p className="mt-0.5 text-sm text-slate-400">Generate statements and export customer billing history</p>
              </div>
            </div>
            <Link href="/dashboard" className="self-start inline-flex items-center gap-2 rounded-2xl border border-slate-600 bg-slate-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 sm:self-auto">
              ← Dashboard
            </Link>
          </div>
        </div>

        {/* Filters */}
        <div className="mb-6 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <h2 className="mb-4 text-base font-bold text-slate-900">Generate Statement</h2>
          {pageLoading ? (
            <p className="text-sm text-slate-500">Loading...</p>
          ) : (
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
              <div className="flex-1">
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Customer</label>
                <select
                  value={customerId}
                  onChange={e => setCustomerId(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-500"
                >
                  <option value="">Select a customer...</option>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">From</label>
                <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                  className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-500" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">To</label>
                <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                  className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-500" />
              </div>
              <button
                onClick={runReport}
                disabled={!customerId || !dateFrom || !dateTo || loading}
                className="rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
              >
                {loading ? 'Loading...' : 'Generate'}
              </button>
            </div>
          )}
        </div>

        {/* Results */}
        {rows.length > 0 && (
          <div className="rounded-3xl bg-white shadow-sm ring-1 ring-slate-200">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <p className="text-sm text-slate-600">
                <span className="font-bold text-slate-900">{rows.length}</span> orders for{' '}
                <span className="font-bold text-slate-900">{customerName}</span>
                {' '}— {dateFrom} to {dateTo}
              </p>
              <div className="flex gap-2">
                <button onClick={exportCSV}
                  className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-100">
                  Export CSV
                </button>
                <button onClick={printReport}
                  className="rounded-xl border border-slate-300 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">
                  Print / PDF
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    {['Ticket', 'Date', 'Type', 'Bin', 'Address', 'Status', 'Driver', 'Notes'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map(o => (
                    <tr key={o.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-xs font-medium text-slate-700">{o.ticket_number || '—'}</td>
                      <td className="px-4 py-3 text-xs text-slate-600">{o.scheduled_date || '—'}</td>
                      <td className="px-4 py-3 text-xs text-slate-600">{o.order_type || '—'}</td>
                      <td className="px-4 py-3 text-xs text-slate-600">{[o.bin_size, o.bin_type].filter(Boolean).join(' ') || '—'}</td>
                      <td className="px-4 py-3 text-xs text-slate-600">{o.service_address || o.pickup_address || '—'}</td>
                      <td className="px-4 py-3 text-xs">
                        <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${statusClasses[o.status || 'unassigned'] || statusClasses.unassigned}`}>
                          {formatStatus(o.status)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600">{driverMap[o.driver_id || ''] || '—'}</td>
                      <td className="px-4 py-3 text-xs text-slate-600 max-w-xs truncate">{o.driver_notes || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {!loading && rows.length === 0 && customerId && dateFrom && dateTo && (
          <div className="rounded-3xl bg-white p-10 text-center text-sm text-slate-500 shadow-sm ring-1 ring-slate-200">
            No orders found for this customer in the selected date range.
          </div>
        )}
      </div>
    </div>
  )
}
