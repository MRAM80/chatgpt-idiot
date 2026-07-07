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

// Recharts loaded client-side only (no SSR)
const BarChart = dynamic_(() => import('recharts').then(m => m.BarChart), { ssr: false })
const Bar = dynamic_(() => import('recharts').then(m => m.Bar), { ssr: false })
const LineChart = dynamic_(() => import('recharts').then(m => m.LineChart), { ssr: false })
const Line = dynamic_(() => import('recharts').then(m => m.Line), { ssr: false })
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

const TABLE_NAME = 'order'

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

const PIE_COLORS = ['#3b82f6', '#ef4444', '#f59e0b', '#8b5cf6', '#10b981', '#ec4899']

function formatStatus(s: string | null | undefined) {
  if (!s) return 'Unassigned'
  return s.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

function formatDate(d: string | null) {
  if (!d) return '—'
  return new Date(d + 'T12:00:00').toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })
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
  const summary = Object.entries(byType).map(([k, v]) => `<td>${k}</td><td>${v}</td>`).join('</tr><tr>')
  const tableRows = rows.map(o => `
    <tr>
      <td>${o.ticket_number || '—'}</td><td>${o.scheduled_date || '—'}</td>
      <td>${o.order_type || '—'}</td><td>${o.bin_size ? o.bin_size + 'Y' : '—'}</td>
      <td>${o.bin_type || '—'}</td>
      <td>${o.service_address || o.pickup_address || '—'}</td>
      <td>${formatStatus(o.status)}</td>
      <td>${driverMap[o.driver_id || ''] || '—'}</td>
    </tr>`).join('')
  win.document.write(`<html><head><title>Statement — ${customerName}</title>
    <style>
      body{font-family:Arial,sans-serif;font-size:12px;padding:24px;color:#1e293b}
      h1{font-size:20px;margin:0}h2{font-size:14px;margin:16px 0 8px;color:#475569}
      p{margin:4px 0;color:#64748b}.meta{display:flex;gap:24px;margin:12px 0 20px;font-size:13px}
      .meta span{background:#f1f5f9;padding:4px 12px;border-radius:6px}
      table{width:100%;border-collapse:collapse;margin-bottom:20px}
      th{background:#f1f5f9;text-align:left;padding:8px;font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:#64748b}
      td{padding:8px;border-bottom:1px solid #e2e8f0;vertical-align:top}
      .summary td{padding:6px 10px;background:#f8fafc}
      @media print{body{padding:0}}
    </style></head><body>
    <h1>${CLIENT_CONFIG.name} — Customer Statement</h1>
    <div class="meta">
      <span><strong>Customer:</strong> ${customerName}</span>
      <span><strong>Period:</strong> ${dateFrom} to ${dateTo}</span>
      <span><strong>Total Orders:</strong> ${rows.length}</span>
    </div>
    <h2>Order Summary</h2>
    <table class="summary"><thead><tr><th>Order Type</th><th>Count</th></tr></thead>
    <tbody><tr>${summary}</tr></tbody></table>
    <h2>Order Detail</h2>
    <table><thead><tr><th>Ticket</th><th>Date</th><th>Type</th><th>Size</th><th>Material</th><th>Address</th><th>Status</th><th>Driver</th></tr></thead>
    <tbody>${tableRows}</tbody></table>
    </body></html>`)
  win.document.close(); win.print()
}

// ─── STATEMENTS TAB ────────────────────────────────────────────────────────────
function StatementsTab({ customers, drivers, driverMap }: {
  customers: Customer[]
  drivers: Driver[]
  driverMap: Record<string, string>
}) {
  const supabase = createClient()
  const [customerId, setCustomerId] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [orderTypeFilter, setOrderTypeFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [rows, setRows] = useState<Order[]>([])
  const [loading, setLoading] = useState(false)
  const [customerName, setCustomerName] = useState('')
  const [hasRun, setHasRun] = useState(false)

  const filteredRows = useMemo(() => rows.filter(o => {
    if (orderTypeFilter !== 'all' && o.order_type !== orderTypeFilter) return false
    if (statusFilter !== 'all' && o.status !== statusFilter) return false
    return true
  }), [rows, orderTypeFilter, statusFilter])

  const summary = useMemo(() => {
    const byType: Record<string, number> = {}
    const byStatus: Record<string, number> = {}
    filteredRows.forEach(o => {
      const t = o.order_type || 'Unknown'
      byType[t] = (byType[t] || 0) + 1
      const s = o.status || 'unassigned'
      byStatus[s] = (byStatus[s] || 0) + 1
    })
    return { byType, byStatus }
  }, [filteredRows])

  async function runReport() {
    if (!customerId || !dateFrom || !dateTo) return
    setLoading(true)
    const c = customers.find(c => c.id === customerId)
    setCustomerName(c?.name || '')
    const { data, error } = await supabase
      .from(TABLE_NAME)
      .select('id,ticket_number,customer_name,customer_id,service_address,pickup_address,order_type,bin_size,bin_type,status,scheduled_date,driver_id,driver_notes,service_time')
      .eq('customer_id', customerId)
      .gte('scheduled_date', dateFrom)
      .lte('scheduled_date', dateTo)
      .order('scheduled_date', { ascending: false })
    if (!error) setRows((data as Order[]) || [])
    setHasRun(true)
    setLoading(false)
  }

  const typeChartData = Object.entries(summary.byType).map(([name, value]) => ({ name, value }))
  const statusChartData = Object.entries(summary.byStatus).map(([name, value]) => ({
    name: formatStatus(name), value, fill: STATUS_COLORS[name] || '#64748b'
  }))

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="rounded-3xl bg-slate-800 p-6 ring-1 ring-slate-700">
        <h2 className="mb-5 text-base font-bold text-white">Generate Statement</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-2">
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-400">Customer</label>
            <select value={customerId} onChange={e => setCustomerId(e.target.value)}
              className="w-full rounded-xl border border-slate-600 bg-slate-900 px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">Select a customer...</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-400">From</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              className="w-full rounded-xl border border-slate-600 bg-slate-900 px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-400">To</label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              className="w-full rounded-xl border border-slate-600 bg-slate-900 px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <select value={orderTypeFilter} onChange={e => setOrderTypeFilter(e.target.value)}
            className="rounded-xl border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white focus:outline-none">
            <option value="all">All Order Types</option>
            {['DELIVERY','REMOVAL','EXCHANGE','DUMP RETURN'].map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="rounded-xl border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white focus:outline-none">
            <option value="all">All Statuses</option>
            {['completed','assigned','in_progress','unassigned','issue','cancelled'].map(s => (
              <option key={s} value={s}>{formatStatus(s)}</option>
            ))}
          </select>
          <button onClick={runReport} disabled={!customerId || !dateFrom || !dateTo || loading}
            className="rounded-xl bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition">
            {loading ? 'Loading...' : 'Generate'}
          </button>
        </div>
      </div>

      {/* Results */}
      {hasRun && !loading && (
        <>
          {/* Summary cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl bg-slate-800 p-4 ring-1 ring-slate-700">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Total Orders</div>
              <div className="mt-2 text-3xl font-black text-white">{filteredRows.length}</div>
              <div className="mt-1 text-xs text-slate-500">{customerName}</div>
            </div>
            {Object.entries(summary.byType).map(([type, count]) => (
              <div key={type} className="rounded-2xl bg-slate-800 p-4 ring-1 ring-slate-700">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">{type}</div>
                <div className="mt-2 text-3xl font-black" style={{ color: ORDER_TYPE_COLORS[type] || '#94a3b8' }}>{count}</div>
                <div className="mt-1 text-xs text-slate-500">{Math.round(count / filteredRows.length * 100)}% of total</div>
              </div>
            ))}
          </div>

          {/* Charts row */}
          {filteredRows.length > 0 && (
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-3xl bg-slate-800 p-5 ring-1 ring-slate-700">
                <h3 className="mb-4 text-sm font-bold text-white">Orders by Type</h3>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={typeChartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, value }) => `${name}: ${value}`}>
                      {typeChartData.map((entry, i) => (
                        <Cell key={i} fill={ORDER_TYPE_COLORS[entry.name] || PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#f1f5f9' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="rounded-3xl bg-slate-800 p-5 ring-1 ring-slate-700">
                <h3 className="mb-4 text-sm font-bold text-white">Orders by Status</h3>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={statusChartData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                    <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
                    <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#f1f5f9' }} />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                      {statusChartData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Export buttons */}
          {filteredRows.length > 0 && (
            <div className="flex flex-wrap gap-3">
              <button onClick={() => exportToCSV(filteredRows, driverMap, `statement-${customerName}-${dateFrom}-${dateTo}.csv`)}
                className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-600 transition">
                Export CSV / Excel
              </button>
              <button onClick={() => printStatement(filteredRows, driverMap, customerName, dateFrom, dateTo)}
                className="rounded-xl bg-slate-700 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-600 transition">
                Print / PDF
              </button>
            </div>
          )}

          {/* Table */}
          {filteredRows.length === 0 ? (
            <div className="rounded-3xl bg-slate-800 p-10 text-center text-sm text-slate-400 ring-1 ring-slate-700">
              No orders found for the selected filters.
            </div>
          ) : (
            <div className="overflow-hidden rounded-3xl bg-slate-900 ring-1 ring-slate-700">
              <div className="flex items-center justify-between border-b border-slate-700 px-6 py-4">
                <p className="text-sm text-slate-400">
                  <span className="font-bold text-white">{filteredRows.length}</span> orders · <span className="font-semibold text-white">{customerName}</span> · {dateFrom} → {dateTo}
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] divide-y divide-slate-700">
                  <thead className="bg-slate-800">
                    <tr>
                      {['Ticket','Date','Type','Bin','Material','Address','Status','Driver'].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-400">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {filteredRows.map(o => (
                      <tr key={o.id} className="hover:bg-slate-700/50 transition-colors">
                        <td className="px-4 py-3 text-xs font-semibold text-white">{o.ticket_number || '—'}</td>
                        <td className="px-4 py-3 text-xs text-slate-300 whitespace-nowrap">{o.scheduled_date || '—'}</td>
                        <td className="px-4 py-3 text-xs">
                          <span className="rounded-full px-2 py-0.5 text-xs font-bold" style={{ background: (ORDER_TYPE_COLORS[o.order_type || ''] || '#334155') + '33', color: ORDER_TYPE_COLORS[o.order_type || ''] || '#94a3b8' }}>
                            {o.order_type || '—'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-300">{o.bin_size ? `${o.bin_size}Y` : '—'}</td>
                        <td className="px-4 py-3 text-xs text-slate-300">{o.bin_type || '—'}</td>
                        <td className="px-4 py-3 text-xs text-slate-300 max-w-[200px] truncate">{o.service_address || o.pickup_address || '—'}</td>
                        <td className="px-4 py-3 text-xs">
                          <span className="rounded-full px-2 py-0.5 text-xs font-semibold" style={{ background: (STATUS_COLORS[o.status || 'unassigned'] || '#334155') + '33', color: STATUS_COLORS[o.status || 'unassigned'] || '#94a3b8' }}>
                            {formatStatus(o.status)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-300">{driverMap[o.driver_id || ''] || '—'}</td>
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
  )
}

// ─── PERFORMANCE TAB ────────────────────────────────────────────────────────────
function PerformanceTab({ drivers, driverMap }: { drivers: Driver[]; driverMap: Record<string, string> }) {
  const supabase = createClient()
  const [driverId, setDriverId] = useState('all')
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().slice(0, 10)
  })
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10))
  const [rows, setRows] = useState<Order[]>([])
  const [loading, setLoading] = useState(false)
  const [hasRun, setHasRun] = useState(false)

  async function runReport() {
    setLoading(true)
    let q = supabase
      .from(TABLE_NAME)
      .select('id,ticket_number,customer_name,customer_id,order_type,bin_size,bin_type,status,scheduled_date,driver_id,service_time')
      .gte('scheduled_date', dateFrom)
      .lte('scheduled_date', dateTo)
      .not('status', 'in', '("cancelled")')
      .order('scheduled_date', { ascending: true })
    if (driverId !== 'all') q = q.eq('driver_id', driverId)
    const { data } = await q
    setRows((data as Order[]) || [])
    setHasRun(true)
    setLoading(false)
  }

  // Per-driver stats
  const driverStats = useMemo(() => {
    const map: Record<string, { name: string; total: number; completed: number; byType: Record<string, number> }> = {}
    rows.forEach(o => {
      const id = o.driver_id || 'unassigned'
      const name = driverMap[id] || 'Unassigned'
      if (!map[id]) map[id] = { name, total: 0, completed: 0, byType: {} }
      map[id].total++
      if (o.status === 'completed') map[id].completed++
      const t = o.order_type || 'Unknown'
      map[id].byType[t] = (map[id].byType[t] || 0) + 1
    })
    return Object.values(map).sort((a, b) => b.total - a.total)
  }, [rows, driverMap])

  // Orders per day (for line chart)
  const dailyData = useMemo(() => {
    const map: Record<string, { date: string; total: number; completed: number }> = {}
    rows.forEach(o => {
      const d = o.scheduled_date || 'unknown'
      if (!map[d]) map[d] = { date: d, total: 0, completed: 0 }
      map[d].total++
      if (o.status === 'completed') map[d].completed++
    })
    return Object.values(map).sort((a, b) => a.date.localeCompare(b.date)).map(d => ({
      ...d,
      date: new Date(d.date + 'T12:00:00').toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })
    }))
  }, [rows])

  // Order type breakdown for bar chart
  const typeByDriver = useMemo(() => {
    return driverStats.map(d => ({
      name: d.name.split(' ')[0],
      ...d.byType,
    }))
  }, [driverStats])

  const allTypes = useMemo(() => {
    const set = new Set<string>()
    rows.forEach(o => { if (o.order_type) set.add(o.order_type) })
    return Array.from(set)
  }, [rows])

  function exportPerformanceCSV() {
    const headers = ['Driver', 'Total Orders', 'Completed', 'Completion Rate', ...allTypes.map(t => `${t} Count`)]
    const data = driverStats.map(d => [
      d.name,
      d.total,
      d.completed,
      d.total > 0 ? `${Math.round(d.completed / d.total * 100)}%` : '0%',
      ...allTypes.map(t => d.byType[t] || 0),
    ])
    const csv = [headers, ...data].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `performance-${dateFrom}-${dateTo}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="rounded-3xl bg-slate-800 p-6 ring-1 ring-slate-700">
        <h2 className="mb-5 text-base font-bold text-white">Driver Performance Report</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-400">Driver</label>
            <select value={driverId} onChange={e => setDriverId(e.target.value)}
              className="w-full rounded-xl border border-slate-600 bg-slate-900 px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="all">All Drivers</option>
              {drivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-400">From</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              className="w-full rounded-xl border border-slate-600 bg-slate-900 px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-400">To</label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              className="w-full rounded-xl border border-slate-600 bg-slate-900 px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>
        <div className="mt-4">
          <button onClick={runReport} disabled={loading}
            className="rounded-xl bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition">
            {loading ? 'Loading...' : 'Run Report'}
          </button>
        </div>
      </div>

      {hasRun && !loading && (
        <>
          {/* Driver stat cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {driverStats.map(d => (
              <div key={d.name} className="rounded-2xl bg-slate-800 p-4 ring-1 ring-slate-700">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-sm font-bold text-white">{d.name}</div>
                  <div className="text-xs font-semibold text-emerald-400">{d.total > 0 ? Math.round(d.completed / d.total * 100) : 0}%</div>
                </div>
                <div className="mb-2 h-1.5 w-full rounded-full bg-slate-700">
                  <div className="h-1.5 rounded-full bg-emerald-500 transition-all" style={{ width: `${d.total > 0 ? Math.round(d.completed / d.total * 100) : 0}%` }} />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-lg bg-slate-900 px-2 py-1.5 text-center">
                    <div className="text-lg font-black text-white">{d.total}</div>
                    <div className="text-slate-500">Total</div>
                  </div>
                  <div className="rounded-lg bg-slate-900 px-2 py-1.5 text-center">
                    <div className="text-lg font-black text-emerald-400">{d.completed}</div>
                    <div className="text-slate-500">Completed</div>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {Object.entries(d.byType).map(([type, count]) => (
                    <span key={type} className="rounded px-1.5 py-0.5 text-[10px] font-bold" style={{ background: (ORDER_TYPE_COLORS[type] || '#334155') + '33', color: ORDER_TYPE_COLORS[type] || '#94a3b8' }}>
                      {type} {count}
                    </span>
                  ))}
                </div>
              </div>
            ))}
            {driverStats.length === 0 && (
              <div className="col-span-full rounded-2xl bg-slate-800 p-6 text-center text-sm text-slate-400 ring-1 ring-slate-700">
                No data found for the selected period.
              </div>
            )}
          </div>

          {rows.length > 0 && (
            <>
              {/* Charts */}
              <div className="grid gap-4 lg:grid-cols-2">
                {/* Daily trend */}
                <div className="rounded-3xl bg-slate-800 p-5 ring-1 ring-slate-700">
                  <h3 className="mb-4 text-sm font-bold text-white">Daily Order Volume</h3>
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={dailyData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                      <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                      <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} allowDecimals={false} />
                      <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#f1f5f9' }} />
                      <Legend wrapperStyle={{ color: '#94a3b8', fontSize: 12 }} />
                      <Line type="monotone" dataKey="total" stroke="#3b82f6" strokeWidth={2} dot={false} name="Total" />
                      <Line type="monotone" dataKey="completed" stroke="#10b981" strokeWidth={2} dot={false} name="Completed" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                {/* Orders by type per driver */}
                <div className="rounded-3xl bg-slate-800 p-5 ring-1 ring-slate-700">
                  <h3 className="mb-4 text-sm font-bold text-white">Order Types by Driver</h3>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={typeByDriver} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                      <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                      <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} allowDecimals={false} />
                      <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#f1f5f9' }} />
                      <Legend wrapperStyle={{ color: '#94a3b8', fontSize: 12 }} />
                      {allTypes.map(t => (
                        <Bar key={t} dataKey={t} stackId="a" fill={ORDER_TYPE_COLORS[t] || '#64748b'} radius={allTypes.indexOf(t) === allTypes.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]} />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Export */}
              <div className="flex gap-3">
                <button onClick={exportPerformanceCSV}
                  className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-600 transition">
                  Export CSV / Excel
                </button>
              </div>

              {/* Detail table */}
              <div className="overflow-hidden rounded-3xl bg-slate-900 ring-1 ring-slate-700">
                <div className="border-b border-slate-700 px-6 py-4">
                  <h3 className="text-sm font-bold text-white">Driver Summary Table</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full divide-y divide-slate-700">
                    <thead className="bg-slate-800">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-400">Driver</th>
                        <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-400">Total</th>
                        <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-400">Completed</th>
                        <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-400">Completion</th>
                        {allTypes.map(t => (
                          <th key={t} className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-400">{t}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {driverStats.map(d => (
                        <tr key={d.name} className="hover:bg-slate-700/50 transition-colors">
                          <td className="px-4 py-3 text-sm font-semibold text-white">{d.name}</td>
                          <td className="px-4 py-3 text-sm text-slate-300">{d.total}</td>
                          <td className="px-4 py-3 text-sm text-emerald-400">{d.completed}</td>
                          <td className="px-4 py-3 text-sm">
                            <div className="flex items-center gap-2">
                              <div className="h-1.5 w-16 rounded-full bg-slate-700">
                                <div className="h-1.5 rounded-full bg-emerald-500" style={{ width: `${d.total > 0 ? Math.round(d.completed / d.total * 100) : 0}%` }} />
                              </div>
                              <span className="text-xs font-semibold text-emerald-400">{d.total > 0 ? Math.round(d.completed / d.total * 100) : 0}%</span>
                            </div>
                          </td>
                          {allTypes.map(t => (
                            <td key={t} className="px-4 py-3 text-sm text-slate-300">{d.byType[t] || 0}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}

// ─── MAIN PAGE ─────────────────────────────────────────────────────────────────
export default function ReportsPage() {
  const router = useRouter()
  const supabase = createClient()
  const { role, loading: roleLoading } = useRole()
  const [tab, setTab] = useState<'statements' | 'performance'>('statements')
  const [customers, setCustomers] = useState<Customer[]>([])
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [pageLoading, setPageLoading] = useState(true)

  useEffect(() => {
    if (!roleLoading && role !== null && !can(role, 'canViewReports')) {
      router.push(role === 'driver' ? '/driver' : '/dispatch')
    }
  }, [roleLoading, role])

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

  return (
    <div className="min-h-screen bg-slate-950">
      <div className="mx-auto max-w-7xl p-4 md:p-6">

        {/* Header */}
        <div className="mb-6 rounded-3xl bg-gradient-to-r from-slate-950 via-slate-900 to-slate-800 p-6 text-white shadow-sm ring-1 ring-slate-700">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <AppLogo className="h-9 w-auto" />
              <div>
                <h1 className="text-2xl font-bold tracking-tight">Statements & Performance</h1>
                <p className="mt-0.5 text-sm text-slate-400">Generate statements, invoices, and analyze driver performance</p>
              </div>
            </div>
            <Link href="/dashboard" className="self-start inline-flex items-center gap-2 rounded-2xl border border-slate-600 bg-slate-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 sm:self-auto">
              ← Dashboard
            </Link>
          </div>
        </div>

        {/* Tabs */}
        <div className="mb-6 flex gap-2 rounded-2xl bg-slate-800 p-1.5 ring-1 ring-slate-700 w-fit">
          <button
            onClick={() => setTab('statements')}
            className={`rounded-xl px-5 py-2.5 text-sm font-semibold transition ${tab === 'statements' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
          >
            Statements & Invoices
          </button>
          <button
            onClick={() => setTab('performance')}
            className={`rounded-xl px-5 py-2.5 text-sm font-semibold transition ${tab === 'performance' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
          >
            Driver Performance
          </button>
        </div>

        {pageLoading ? (
          <div className="rounded-3xl bg-slate-800 p-10 text-center text-sm text-slate-400">Loading...</div>
        ) : tab === 'statements' ? (
          <StatementsTab customers={customers} drivers={drivers} driverMap={driverMap} />
        ) : (
          <PerformanceTab drivers={drivers} driverMap={driverMap} />
        )}

      </div>
    </div>
  )
}
