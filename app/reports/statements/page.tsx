'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import dynamic_ from 'next/dynamic'
import { createClient } from '@/lib/supabase/client'
import { CLIENT_CONFIG } from '@/lib/client-config'
import AppLogo from '@/components/AppLogo'
import { useRole } from '@/hooks/useRole'
import { can } from '@/lib/roles'

const BarChart = dynamic_(() => import('recharts').then(m => m.BarChart), { ssr: false })
const Bar = dynamic_(() => import('recharts').then(m => m.Bar), { ssr: false })
const PieChart = dynamic_(() => import('recharts').then(m => m.PieChart), { ssr: false })
const Pie = dynamic_(() => import('recharts').then(m => m.Pie), { ssr: false })
const Cell = dynamic_(() => import('recharts').then(m => m.Cell), { ssr: false })
const XAxis = dynamic_(() => import('recharts').then(m => m.XAxis), { ssr: false })
const YAxis = dynamic_(() => import('recharts').then(m => m.YAxis), { ssr: false })
const CartesianGrid = dynamic_(() => import('recharts').then(m => m.CartesianGrid), { ssr: false })
const Tooltip = dynamic_(() => import('recharts').then(m => m.Tooltip), { ssr: false })
const Legend = dynamic_(() => import('recharts').then(m => m.Legend), { ssr: false })
const ResponsiveContainer = dynamic_(() => import('recharts').then(m => m.ResponsiveContainer), { ssr: false })

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
  service_time?: string | null
}

type Driver = { id: string; name: string | null }
type Customer = { id: string; name: string | null }

const ORDER_TYPE_COLORS: Record<string, string> = {
  DELIVERY: '#3b82f6',
  REMOVAL: '#ef4444',
  EXCHANGE: '#f59e0b',
  'DUMP RETURN': '#8b5cf6',
}

const STATUS_COLORS: Record<string, string> = {
  completed: '#10b981',
  assigned: '#3b82f6',
  in_progress: '#f59e0b',
  unassigned: '#64748b',
  issue: '#ef4444',
  cancelled: '#6b7280',
}

function formatStatus(s: string | null | undefined) {
  if (!s) return 'Unassigned'
  return s.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

function exportToCSV(rows: Order[], driverMap: Record<string, string>, filename: string) {
  const headers = ['Ticket', 'Date', 'Order Type', 'Bin Size', 'Material', 'Address', 'Status', 'Driver', 'Notes']
  const data = rows.map(o => [
    o.ticket_number || '',
    o.scheduled_date || '',
    o.order_type || '',
    o.bin_size ? `${o.bin_size}Y` : '',
    o.bin_type || '',
    o.service_address || o.pickup_address || '',
    o.status || '',
    driverMap[o.driver_id || ''] || '',
    o.driver_notes || '',
  ])
  const csv = [headers, ...data].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

function printStatement(rows: Order[], driverMap: Record<string, string>, customerName: string, dateFrom: string, dateTo: string) {
  const win = window.open('', '_blank')
  if (!win) return
  const byType: Record<string, number> = {}
  rows.forEach(o => { const t = o.order_type || 'Unknown'; byType[t] = (byType[t] || 0) + 1 })
  const summaryRows = Object.entries(byType).map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('')
  const tableRows = rows.map(o => `
    <tr>
      <td>${o.ticket_number || '—'}</td>
      <td>${o.scheduled_date || '—'}</td>
      <td>${o.order_type || '—'}</td>
      <td>${o.bin_size ? o.bin_size + 'Y' : '—'}</td>
      <td>${o.bin_type || '—'}</td>
      <td>${o.service_address || o.pickup_address || '—'}</td>
      <td>${formatStatus(o.status)}</td>
      <td>${driverMap[o.driver_id || ''] || '—'}</td>
      <td>${o.driver_notes || '—'}</td>
    </tr>`).join('')
  win.document.write(`<html><head><title>Statement — ${customerName}</title>
    <style>
      body{font-family:Arial,sans-serif;font-size:12px;padding:24px;color:#1e293b}
      h1{font-size:20px;margin:0 0 4px}
      .subtitle{color:#64748b;font-size:13px;margin-bottom:20px}
      .meta{display:flex;flex-wrap:wrap;gap:16px;margin-bottom:24px;padding:12px;background:#f8fafc;border-radius:8px}
      .meta-item{font-size:12px;color:#475569}<br>.meta-item strong{color:#0f172a}
      h2{font-size:13px;text-transform:uppercase;letter-spacing:.05em;color:#64748b;margin:20px 0 8px;border-bottom:1px solid #e2e8f0;padding-bottom:4px}
      table{width:100%;border-collapse:collapse;margin-bottom:20px}
      th{background:#f1f5f9;text-align:left;padding:7px 10px;font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:#64748b}
      td{padding:7px 10px;border-bottom:1px solid #f1f5f9;vertical-align:top;font-size:11px}
      .footer{margin-top:24px;padding-top:12px;border-top:1px solid #e2e8f0;color:#94a3b8;font-size:10px}
      @media print{body{padding:0}}
    </style></head><body>
    <h1>${CLIENT_CONFIG.name} — Customer Statement</h1>
    <p class="subtitle">Generated on ${new Date().toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
    <div class="meta">
      <div class="meta-item"><strong>Customer:</strong> ${customerName}</div>
      <div class="meta-item"><strong>Period:</strong> ${dateFrom} to ${dateTo}</div>
      <div class="meta-item"><strong>Total Orders:</strong> ${rows.length}</div>
      <div class="meta-item"><strong>Completed:</strong> ${rows.filter(o => o.status === 'completed').length}</div>
    </div>
    <h2>Order Type Summary</h2>
    <table style="width:300px"><thead><tr><th>Order Type</th><th>Count</th></tr></thead>
    <tbody>${summaryRows}</tbody></table>
    <h2>Order Detail</h2>
    <table><thead><tr><th>Ticket</th><th>Date</th><th>Type</th><th>Size</th><th>Material</th><th>Address</th><th>Status</th><th>Driver</th><th>Notes</th></tr></thead>
    <tbody>${tableRows}</tbody></table>
    <div class="footer">${CLIENT_CONFIG.name} · Statement generated ${new Date().toISOString().slice(0,10)}</div>
    </body></html>`)
  win.document.close(); win.print()
}

export default function StatementsPage() {
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
  const [pageLoading, setPageLoading] = useState(true)

  // Filters
  const [customerId, setCustomerId] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [orderTypeFilter, setOrderTypeFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [driverFilter, setDriverFilter] = useState('all')

  // Results
  const [rows, setRows] = useState<Order[]>([])
  const [loading, setLoading] = useState(false)
  const [customerName, setCustomerName] = useState('')
  const [hasRun, setHasRun] = useState(false)
  const [showCharts, setShowCharts] = useState(false)
  const [sortField, setSortField] = useState<string>('scheduled_date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

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

  const filteredRows = useMemo(() => {
    let r = rows
    if (orderTypeFilter !== 'all') r = r.filter(o => o.order_type === orderTypeFilter)
    if (statusFilter !== 'all') r = r.filter(o => o.status === statusFilter)
    if (driverFilter !== 'all') r = r.filter(o => o.driver_id === driverFilter)
    return [...r].sort((a, b) => {
      const av = (a as Record<string, unknown>)[sortField] as string || ''
      const bv = (b as Record<string, unknown>)[sortField] as string || ''
      return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
    })
  }, [rows, orderTypeFilter, statusFilter, driverFilter, sortField, sortDir])

  const summary = useMemo(() => {
    const byType: Record<string, number> = {}
    const byStatus: Record<string, number> = {}
    const byDriver: Record<string, number> = {}
    filteredRows.forEach(o => {
      const t = o.order_type || 'Unknown'; byType[t] = (byType[t] || 0) + 1
      const s = o.status || 'unassigned'; byStatus[s] = (byStatus[s] || 0) + 1
      const d = driverMap[o.driver_id || ''] || 'Unassigned'; byDriver[d] = (byDriver[d] || 0) + 1
    })
    return { byType, byStatus, byDriver }
  }, [filteredRows, driverMap])

  async function runReport() {
    if (!customerId || !dateFrom || !dateTo) return
    setLoading(true)
    setShowCharts(false)
    const c = customers.find(c => c.id === customerId)
    setCustomerName(c?.name || '')
    const { data } = await supabase
      .from('order')
      .select('id,ticket_number,customer_name,customer_id,service_address,pickup_address,order_type,bin_size,bin_type,status,scheduled_date,driver_id,driver_notes,service_time')
      .eq('customer_id', customerId)
      .gte('scheduled_date', dateFrom)
      .lte('scheduled_date', dateTo)
      .order('scheduled_date', { ascending: false })
    setRows((data as Order[]) || [])
    setHasRun(true)
    setLoading(false)
  }

  function toggleSort(field: string) {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('asc') }
  }

  const typeChartData = Object.entries(summary.byType).map(([name, value]) => ({ name, value }))
  const statusChartData = Object.entries(summary.byStatus).map(([name, value]) => ({
    name: formatStatus(name), value, fill: STATUS_COLORS[name] || '#64748b'
  }))
  const driverChartData = Object.entries(summary.byDriver).map(([name, value]) => ({ name: name.split(' ')[0], value }))

  const completedCount = filteredRows.filter(o => o.status === 'completed').length

  const cols: { key: string; label: string }[] = [
    { key: 'ticket_number', label: 'Ticket' },
    { key: 'scheduled_date', label: 'Date' },
    { key: 'order_type', label: 'Type' },
    { key: 'bin_size', label: 'Bin' },
    { key: 'bin_type', label: 'Material' },
    { key: 'service_address', label: 'Address' },
    { key: 'status', label: 'Status' },
    { key: 'driver_id', label: 'Driver' },
    { key: 'driver_notes', label: 'Notes' },
  ]

  return (
    <div className="min-h-screen bg-slate-950">
      <div className="mx-auto max-w-7xl p-4 md:p-6">

        {/* Header */}
        <div className="mb-6 rounded-3xl bg-gradient-to-r from-slate-950 via-slate-900 to-slate-800 p-6 text-white shadow-sm ring-1 ring-slate-700">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <AppLogo className="h-9 w-auto" />
              <div>
                <div className="flex items-center gap-2 text-xs text-slate-400 mb-1">
                  <Link href="/reports" className="hover:text-white transition">Statements & Performance</Link>
                  <span>/</span>
                  <span className="text-white">Statements & Invoices</span>
                </div>
                <h1 className="text-2xl font-bold tracking-tight">Statements & Invoices</h1>
                <p className="mt-0.5 text-sm text-slate-400">Generate customer billing statements and export invoices</p>
              </div>
            </div>
            <Link href="/reports" className="self-start inline-flex items-center gap-2 rounded-2xl border border-slate-600 bg-slate-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 sm:self-auto">
              ← Back
            </Link>
          </div>
        </div>

        {pageLoading ? (
          <div className="rounded-3xl bg-slate-800 p-10 text-center text-sm text-slate-400">Loading...</div>
        ) : (
          <div className="space-y-6">

            {/* ── FILTERS ─────────────────────────────── */}
            <div className="rounded-3xl bg-slate-900 p-6 ring-1 ring-slate-700">
              <h2 className="mb-5 text-base font-bold text-white">Statement Filters</h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="lg:col-span-2">
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-400">Customer *</label>
                  <select value={customerId} onChange={e => setCustomerId(e.target.value)}
                    className="w-full rounded-xl border border-slate-600 bg-slate-800 px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">Select a customer...</option>
                    {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-400">From *</label>
                  <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                    className="w-full rounded-xl border border-slate-600 bg-slate-800 px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-400">To *</label>
                  <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                    className="w-full rounded-xl border border-slate-600 bg-slate-800 px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>

              {/* Secondary filters */}
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-400">Order Type</label>
                  <select value={orderTypeFilter} onChange={e => setOrderTypeFilter(e.target.value)}
                    className="w-full rounded-xl border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white focus:outline-none">
                    <option value="all">All Types</option>
                    {['DELIVERY','REMOVAL','EXCHANGE','DUMP RETURN'].map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-400">Status</label>
                  <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                    className="w-full rounded-xl border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white focus:outline-none">
                    <option value="all">All Statuses</option>
                    {['completed','assigned','in_progress','unassigned','issue','cancelled'].map(s => (
                      <option key={s} value={s}>{formatStatus(s)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-400">Driver</label>
                  <select value={driverFilter} onChange={e => setDriverFilter(e.target.value)}
                    className="w-full rounded-xl border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white focus:outline-none">
                    <option value="all">All Drivers</option>
                    {drivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap gap-3">
                <button onClick={runReport} disabled={!customerId || !dateFrom || !dateTo || loading}
                  className="rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-bold text-white hover:bg-blue-500 disabled:opacity-50 transition">
                  {loading ? 'Generating...' : 'Generate Statement'}
                </button>
                {hasRun && (
                  <button onClick={() => { setRows([]); setHasRun(false); setShowCharts(false) }}
                    className="rounded-xl border border-slate-600 bg-slate-800 px-4 py-2.5 text-sm font-semibold text-slate-300 hover:bg-slate-700 transition">
                    Clear
                  </button>
                )}
              </div>
            </div>

            {/* ── RESULTS ─────────────────────────────── */}
            {hasRun && !loading && (
              <>
                {/* KPI strip */}
                <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
                  <div className="rounded-2xl bg-slate-900 p-4 ring-1 ring-slate-700 text-center">
                    <div className="text-2xl font-black text-white">{filteredRows.length}</div>
                    <div className="mt-1 text-xs font-semibold text-slate-400">Total</div>
                  </div>
                  <div className="rounded-2xl bg-slate-900 p-4 ring-1 ring-slate-700 text-center">
                    <div className="text-2xl font-black text-emerald-400">{completedCount}</div>
                    <div className="mt-1 text-xs font-semibold text-slate-400">Completed</div>
                  </div>
                  {Object.entries(summary.byType).map(([type, count]) => (
                    <div key={type} className="rounded-2xl bg-slate-900 p-4 ring-1 ring-slate-700 text-center">
                      <div className="text-2xl font-black" style={{ color: ORDER_TYPE_COLORS[type] || '#94a3b8' }}>{count}</div>
                      <div className="mt-1 text-xs font-semibold text-slate-400">{type}</div>
                    </div>
                  ))}
                </div>

                {/* Action bar */}
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-sm text-slate-400">
                    <span className="font-bold text-white">{filteredRows.length}</span> orders · <span className="text-white">{customerName}</span> · {dateFrom} → {dateTo}
                  </span>
                  <div className="ml-auto flex flex-wrap gap-2">
                    {!showCharts ? (
                      <button onClick={() => setShowCharts(true)}
                        className="rounded-xl border border-blue-600 bg-blue-600/10 px-4 py-2 text-sm font-semibold text-blue-400 hover:bg-blue-600 hover:text-white transition">
                        Generate Charts
                      </button>
                    ) : (
                      <button onClick={() => setShowCharts(false)}
                        className="rounded-xl border border-slate-600 bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-300 hover:bg-slate-700 transition">
                        Hide Charts
                      </button>
                    )}
                    {filteredRows.length > 0 && (
                      <>
                        <button onClick={() => exportToCSV(filteredRows, driverMap, `statement-${customerName}-${dateFrom}-${dateTo}.csv`)}
                          className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-600 transition">
                          Export CSV
                        </button>
                        <button onClick={() => printStatement(filteredRows, driverMap, customerName, dateFrom, dateTo)}
                          className="rounded-xl bg-slate-700 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-600 transition">
                          Print / PDF
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* ── CHARTS (on demand) ─────────────────── */}
                {showCharts && filteredRows.length > 0 && (
                  <div className="grid gap-4 lg:grid-cols-3">
                    <div className="rounded-3xl bg-slate-900 p-5 ring-1 ring-slate-700">
                      <h3 className="mb-4 text-sm font-bold text-white">Orders by Type</h3>
                      <ResponsiveContainer width="100%" height={220}>
                        <PieChart>
                          <Pie data={typeChartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={75}
                            label={({ name, value }) => `${name}: ${value}`} labelLine={false}>
                            {typeChartData.map((entry, i) => (
                              <Cell key={i} fill={ORDER_TYPE_COLORS[entry.name] || '#64748b'} />
                            ))}
                          </Pie>
                          <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#f1f5f9', fontSize: 12 }} />
                          <Legend wrapperStyle={{ color: '#94a3b8', fontSize: 11 }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>

                    <div className="rounded-3xl bg-slate-900 p-5 ring-1 ring-slate-700">
                      <h3 className="mb-4 text-sm font-bold text-white">Orders by Status</h3>
                      <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={statusChartData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                          <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                          <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} allowDecimals={false} />
                          <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#f1f5f9', fontSize: 12 }} />
                          <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                            {statusChartData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>

                    <div className="rounded-3xl bg-slate-900 p-5 ring-1 ring-slate-700">
                      <h3 className="mb-4 text-sm font-bold text-white">Orders by Driver</h3>
                      <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={driverChartData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                          <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                          <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} allowDecimals={false} />
                          <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#f1f5f9', fontSize: 12 }} />
                          <Bar dataKey="value" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}

                {/* ── TABLE ───────────────────────────────── */}
                {filteredRows.length === 0 ? (
                  <div className="rounded-3xl bg-slate-900 p-10 text-center text-sm text-slate-400 ring-1 ring-slate-700">
                    No orders match the selected filters.
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-3xl bg-slate-900 ring-1 ring-slate-700">
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[900px] divide-y divide-slate-800">
                        <thead className="bg-slate-800">
                          <tr>
                            {cols.map(col => (
                              <th key={col.key}
                                className="cursor-pointer px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-400 hover:text-white select-none transition"
                                onClick={() => toggleSort(col.key)}>
                                {col.label}
                                {sortField === col.key && (
                                  <span className="ml-1 text-blue-400">{sortDir === 'asc' ? '↑' : '↓'}</span>
                                )}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800">
                          {filteredRows.map(o => (
                            <tr key={o.id} className="hover:bg-slate-800/60 transition-colors">
                              <td className="px-4 py-3 text-xs font-semibold text-white whitespace-nowrap">{o.ticket_number || '—'}</td>
                              <td className="px-4 py-3 text-xs text-slate-300 whitespace-nowrap">{o.scheduled_date || '—'}</td>
                              <td className="px-4 py-3 text-xs whitespace-nowrap">
                                <span className="rounded-full px-2.5 py-0.5 text-xs font-bold"
                                  style={{ background: (ORDER_TYPE_COLORS[o.order_type || ''] || '#334155') + '30', color: ORDER_TYPE_COLORS[o.order_type || ''] || '#94a3b8' }}>
                                  {o.order_type || '—'}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-xs text-slate-300 whitespace-nowrap">{o.bin_size ? `${o.bin_size}Y` : '—'}</td>
                              <td className="px-4 py-3 text-xs text-slate-300">{o.bin_type || '—'}</td>
                              <td className="px-4 py-3 text-xs text-slate-300 max-w-[200px] truncate">{o.service_address || o.pickup_address || '—'}</td>
                              <td className="px-4 py-3 text-xs whitespace-nowrap">
                                <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold"
                                  style={{ background: (STATUS_COLORS[o.status || 'unassigned'] || '#334155') + '30', color: STATUS_COLORS[o.status || 'unassigned'] || '#94a3b8' }}>
                                  {formatStatus(o.status)}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-xs text-slate-300 whitespace-nowrap">{driverMap[o.driver_id || ''] || '—'}</td>
                              <td className="px-4 py-3 text-xs text-slate-500 max-w-[160px] truncate">{o.driver_notes || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
