'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import dynamic_ from 'next/dynamic'
import { createClient } from '@/lib/supabase/client'
import AppShell from '@/components/AppShell'
import Icon from '@/components/Icon'
import { useRole } from '@/hooks/useRole'
import { can } from '@/lib/roles'

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
const RadarChart = dynamic_(() => import('recharts').then(m => m.RadarChart), { ssr: false })
const Radar = dynamic_(() => import('recharts').then(m => m.Radar), { ssr: false })
const PolarGrid = dynamic_(() => import('recharts').then(m => m.PolarGrid), { ssr: false })
const PolarAngleAxis = dynamic_(() => import('recharts').then(m => m.PolarAngleAxis), { ssr: false })

type Order = {
  id: string
  ticket_number: string | null
  customer_name: string | null
  customer_id?: string | null
  order_type: string | null
  bin_size: string | null
  bin_type: string | null
  status: string | null
  scheduled_date: string | null
  driver_id: string | null
  service_time?: string | null
}

type Driver = { id: string; name: string | null }

const ORDER_TYPE_COLORS: Record<string, string> = {
  DELIVERY: '#3b82f6',
  REMOVAL: '#ef4444',
  EXCHANGE: '#f59e0b',
  'DUMP RETURN': '#8b5cf6',
}

const DRIVER_PALETTE = ['#3b82f6','#10b981','#f59e0b','#8b5cf6','#ef4444','#ec4899','#06b6d4','#84cc16']

function formatStatus(s: string | null | undefined) {
  if (!s) return 'Unassigned'
  return s.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

function exportCSV(driverStats: DriverStat[], allTypes: string[], dateFrom: string, dateTo: string) {
  const headers = ['Driver', 'Total Orders', 'Completed', 'Completion %', 'Issues', ...allTypes]
  const data = driverStats.map(d => [
    d.name, d.total, d.completed,
    d.total > 0 ? `${Math.round(d.completed / d.total * 100)}%` : '0%',
    d.issues,
    ...allTypes.map(t => d.byType[t] || 0),
  ])
  const csv = [headers, ...data].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = `performance-${dateFrom}-${dateTo}.csv`; a.click()
  URL.revokeObjectURL(url)
}

type DriverStat = {
  id: string
  name: string
  total: number
  completed: number
  issues: number
  byType: Record<string, number>
  byStatus: Record<string, number>
}

export default function PerformancePage() {
  const router = useRouter()
  const supabase = createClient()
  const { role, loading: roleLoading } = useRole()

  useEffect(() => {
    if (!roleLoading && role !== null && !can(role, 'canViewReports')) {
      router.push(role === 'driver' ? '/driver' : '/dispatch')
    }
  }, [roleLoading, role])

  const [drivers, setDrivers] = useState<Driver[]>([])
  const [pageLoading, setPageLoading] = useState(true)

  // Filters
  const [driverId, setDriverId] = useState('all')
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().slice(0, 10)
  })
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10))
  const [orderTypeFilter, setOrderTypeFilter] = useState('all')

  // Results
  const [rows, setRows] = useState<Order[]>([])
  const [loading, setLoading] = useState(false)
  const [hasRun, setHasRun] = useState(false)
  const [showCharts, setShowCharts] = useState(false)

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data } = await supabase.from('drivers').select('id,name').order('name')
      setDrivers((data as Driver[]) || [])
      setPageLoading(false)
    }
    void init()
  }, [])

  const driverMap = useMemo(() =>
    drivers.reduce<Record<string, string>>((acc, d) => { acc[d.id] = d.name || '—'; return acc }, {}),
    [drivers]
  )

  const filteredRows = useMemo(() => {
    if (orderTypeFilter === 'all') return rows
    return rows.filter(o => o.order_type === orderTypeFilter)
  }, [rows, orderTypeFilter])

  async function runReport() {
    setLoading(true)
    setShowCharts(false)
    let q = supabase
      .from('order')
      .select('id,ticket_number,customer_name,customer_id,order_type,bin_size,bin_type,status,scheduled_date,driver_id,service_time')
      .gte('scheduled_date', dateFrom)
      .lte('scheduled_date', dateTo)
      .order('scheduled_date', { ascending: true })
    if (driverId !== 'all') q = q.eq('driver_id', driverId)
    const { data } = await q
    setRows((data as Order[]) || [])
    setHasRun(true)
    setLoading(false)
  }

  // Per-driver aggregation
  const driverStats: DriverStat[] = useMemo(() => {
    const map: Record<string, DriverStat> = {}
    filteredRows.forEach(o => {
      const id = o.driver_id || 'unassigned'
      const name = driverMap[id] || 'Unassigned'
      if (!map[id]) map[id] = { id, name, total: 0, completed: 0, issues: 0, byType: {}, byStatus: {} }
      map[id].total++
      if (o.status === 'completed') map[id].completed++
      if (o.status === 'issue') map[id].issues++
      const t = o.order_type || 'Unknown'
      map[id].byType[t] = (map[id].byType[t] || 0) + 1
      const s = o.status || 'unassigned'
      map[id].byStatus[s] = (map[id].byStatus[s] || 0) + 1
    })
    return Object.values(map).sort((a, b) => b.total - a.total)
  }, [filteredRows, driverMap])

  const allTypes = useMemo(() => {
    const set = new Set<string>()
    filteredRows.forEach(o => { if (o.order_type) set.add(o.order_type) })
    return Array.from(set)
  }, [filteredRows])

  // Daily volume
  const dailyData = useMemo(() => {
    const map: Record<string, { date: string; total: number; completed: number; [key: string]: number | string }> = {}
    filteredRows.forEach(o => {
      const d = o.scheduled_date || 'unknown'
      if (!map[d]) map[d] = { date: d, total: 0, completed: 0 }
      map[d].total++
      if (o.status === 'completed') map[d].completed++
      const dName = driverMap[o.driver_id || ''] || 'Unassigned'
      map[d][dName] = ((map[d][dName] as number) || 0) + 1
    })
    return Object.values(map).sort((a, b) => a.date.localeCompare(b.date)).map(d => ({
      ...d,
      date: new Date(d.date + 'T12:00:00').toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })
    }))
  }, [filteredRows, driverMap])

  // Stacked bar: order types per driver
  const typeByDriver = useMemo(() =>
    driverStats.map(d => ({ name: d.name.split(' ')[0], fullName: d.name, ...d.byType }))
  , [driverStats])

  // Radar: multi-metric per driver (for single driver view)
  const radarData = useMemo(() => {
    if (driverStats.length !== 1) return []
    const d = driverStats[0]
    return [
      { metric: 'Total', value: d.total },
      { metric: 'Completed', value: d.completed },
      { metric: 'Delivery', value: d.byType['DELIVERY'] || 0 },
      { metric: 'Removal', value: d.byType['REMOVAL'] || 0 },
      { metric: 'Exchange', value: d.byType['EXCHANGE'] || 0 },
    ]
  }, [driverStats])

  // Overall KPIs
  const totalOrders = filteredRows.length
  const totalCompleted = filteredRows.filter(o => o.status === 'completed').length
  const totalIssues = filteredRows.filter(o => o.status === 'issue').length
  const completionRate = totalOrders > 0 ? Math.round(totalCompleted / totalOrders * 100) : 0

  const driverNames = useMemo(() => driverStats.map(d => d.name), [driverStats])

  return (
    <AppShell
      title="Driver Performance"
      subtitle="Driver output, completion rates, and order trends"
      actions={
        <Link
          href="/reports"
          className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 ring-1 ring-slate-200 transition hover:bg-slate-50 hover:text-slate-900"
        >
          <Icon name="arrowLeft" className="h-4 w-4" />
          <span className="hidden sm:inline">Reports</span>
        </Link>
      }
    >
      <>
        {pageLoading ? (
          <div className="rounded-xl bg-white p-10 text-center text-sm text-slate-500 ring-1 ring-slate-200">Loading...</div>
        ) : (
          <div className="space-y-6">

            {/* ── FILTERS ─────────────────────────────── */}
            <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
              <h2 className="mb-5 text-base font-bold text-slate-900">Report Filters</h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600">Driver</label>
                  <select value={driverId} onChange={e => setDriverId(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500">
                    <option value="all">All Drivers</option>
                    {drivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600">From</label>
                  <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600">To</label>
                  <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600">Order Type</label>
                  <select value={orderTypeFilter} onChange={e => setOrderTypeFilter(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500">
                    <option value="all">All Types</option>
                    {['DELIVERY','REMOVAL','EXCHANGE','DUMP RETURN'].map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>

              {/* Quick date presets */}
              <div className="mt-4 flex flex-wrap gap-2">
                {[
                  { label: 'Last 7 days', days: 7 },
                  { label: 'Last 30 days', days: 30 },
                  { label: 'Last 90 days', days: 90 },
                  { label: 'This month', days: 0 },
                ].map(({ label, days }) => (
                  <button key={label} type="button"
                    onClick={() => {
                      const to = new Date()
                      if (days === 0) {
                        const from = new Date(to.getFullYear(), to.getMonth(), 1)
                        setDateFrom(from.toISOString().slice(0, 10))
                      } else {
                        const from = new Date(); from.setDate(from.getDate() - days)
                        setDateFrom(from.toISOString().slice(0, 10))
                      }
                      setDateTo(to.toISOString().slice(0, 10))
                    }}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-emerald-500 hover:text-emerald-700 transition">
                    {label}
                  </button>
                ))}
              </div>

              <div className="mt-5 flex flex-wrap gap-3">
                <button onClick={runReport} disabled={loading}
                  className="rounded-xl bg-emerald-600 px-6 py-2.5 text-sm font-bold text-white hover:bg-emerald-500 disabled:opacity-50 transition">
                  {loading ? 'Running...' : 'Run Report'}
                </button>
                {hasRun && (
                  <button onClick={() => { setRows([]); setHasRun(false); setShowCharts(false) }}
                    className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition">
                    Clear
                  </button>
                )}
              </div>
            </div>

            {/* ── RESULTS ─────────────────────────────── */}
            {hasRun && !loading && (
              <>
                {/* Overall KPI strip */}
                <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
                  <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 text-center">
                    <div className="text-3xl font-black text-slate-900">{totalOrders}</div>
                    <div className="mt-1 text-xs font-semibold text-slate-500">Total Orders</div>
                  </div>
                  <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-emerald-300 text-center">
                    <div className="text-3xl font-black text-emerald-600">{totalCompleted}</div>
                    <div className="mt-1 text-xs font-semibold text-slate-500">Completed</div>
                  </div>
                  <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 text-center">
                    <div className="text-3xl font-black text-blue-600">{completionRate}%</div>
                    <div className="mt-1 text-xs font-semibold text-slate-500">Completion Rate</div>
                  </div>
                  <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-rose-300 text-center">
                    <div className="text-3xl font-black text-rose-600">{totalIssues}</div>
                    <div className="mt-1 text-xs font-semibold text-slate-500">Issues Reported</div>
                  </div>
                </div>

                {/* Action bar */}
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-sm text-slate-500">
                    <span className="font-bold text-slate-900">{totalOrders}</span> orders · {dateFrom} → {dateTo}
                    {driverId !== 'all' && <> · <span className="text-slate-900">{driverMap[driverId]}</span></>}
                  </span>
                  <div className="ml-auto flex flex-wrap gap-2">
                    {!showCharts ? (
                      <button onClick={() => setShowCharts(true)}
                        className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-600 hover:text-white transition">
                        Generate Charts
                      </button>
                    ) : (
                      <button onClick={() => setShowCharts(false)}
                        className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition">
                        Hide Charts
                      </button>
                    )}
                    {driverStats.length > 0 && (
                      <button onClick={() => exportCSV(driverStats, allTypes, dateFrom, dateTo)}
                        className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-600 transition">
                        Export CSV
                      </button>
                    )}
                  </div>
                </div>

                {/* ── DRIVER STAT CARDS ────────────────── */}
                {driverStats.length === 0 ? (
                  <div className="rounded-3xl bg-white p-10 text-center text-sm text-slate-500 shadow-sm ring-1 ring-slate-200">
                    No orders found for the selected period and filters.
                  </div>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {driverStats.map((d, i) => {
                      const rate = d.total > 0 ? Math.round(d.completed / d.total * 100) : 0
                      const color = DRIVER_PALETTE[i % DRIVER_PALETTE.length]
                      return (
                        <div key={d.id} className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
                          {/* Name + rate */}
                          <div className="flex items-center justify-between mb-1">
                            <div className="text-sm font-bold text-slate-900">{d.name}</div>
                            <div className="text-xs font-bold" style={{ color }}>{rate}%</div>
                          </div>
                          {/* Progress bar */}
                          <div className="mb-4 h-1.5 w-full rounded-full bg-slate-200">
                            <div className="h-1.5 rounded-full transition-all" style={{ width: `${rate}%`, background: color }} />
                          </div>
                          {/* Main stats */}
                          <div className="grid grid-cols-3 gap-2 mb-3">
                            <div className="rounded-lg bg-slate-100 py-2 text-center">
                              <div className="text-lg font-black text-slate-900">{d.total}</div>
                              <div className="text-[10px] text-slate-500">Total</div>
                            </div>
                            <div className="rounded-lg bg-slate-100 py-2 text-center">
                              <div className="text-lg font-black text-emerald-600">{d.completed}</div>
                              <div className="text-[10px] text-slate-500">Done</div>
                            </div>
                            <div className="rounded-lg bg-slate-100 py-2 text-center">
                              <div className="text-lg font-black text-rose-600">{d.issues}</div>
                              <div className="text-[10px] text-slate-500">Issues</div>
                            </div>
                          </div>
                          {/* Type breakdown */}
                          <div className="flex flex-wrap gap-1">
                            {Object.entries(d.byType).map(([type, count]) => (
                              <span key={type} className="rounded-md px-2 py-0.5 text-[10px] font-bold"
                                style={{ background: (ORDER_TYPE_COLORS[type] || '#334155') + '30', color: ORDER_TYPE_COLORS[type] || '#94a3b8' }}>
                                {type} {count}
                              </span>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* ── CHARTS (on demand) ─────────────────── */}
                {showCharts && filteredRows.length > 0 && (
                  <div className="space-y-4">
                    {/* Row 1: Daily volume + Type stacked */}
                    <div className="grid gap-4 lg:grid-cols-2">
                      <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
                        <h3 className="mb-1 text-sm font-bold text-slate-900">Daily Order Volume</h3>
                        <p className="mb-4 text-xs text-slate-500">Total vs completed orders per day</p>
                        <ResponsiveContainer width="100%" height={240}>
                          <LineChart data={dailyData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                            <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                            <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} allowDecimals={false} />
                            <Tooltip contentStyle={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 8, color: '#0f172a', fontSize: 12 }} />
                            <Legend wrapperStyle={{ color: '#94a3b8', fontSize: 12 }} />
                            <Line type="monotone" dataKey="total" stroke="#3b82f6" strokeWidth={2} dot={false} name="Total" />
                            <Line type="monotone" dataKey="completed" stroke="#10b981" strokeWidth={2} dot={false} name="Completed" />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>

                      <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
                        <h3 className="mb-1 text-sm font-bold text-slate-900">Order Types by Driver</h3>
                        <p className="mb-4 text-xs text-slate-500">Stacked count of each order type</p>
                        <ResponsiveContainer width="100%" height={240}>
                          <BarChart data={typeByDriver} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                            <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                            <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} allowDecimals={false} />
                            <Tooltip contentStyle={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 8, color: '#0f172a', fontSize: 12 }} />
                            <Legend wrapperStyle={{ color: '#94a3b8', fontSize: 12 }} />
                            {allTypes.map((t, i) => (
                              <Bar key={t} dataKey={t} stackId="a" fill={ORDER_TYPE_COLORS[t] || '#64748b'}
                                radius={i === allTypes.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]} />
                            ))}
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    {/* Row 2: Completion rate bar + Daily by driver */}
                    <div className="grid gap-4 lg:grid-cols-2">
                      <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
                        <h3 className="mb-1 text-sm font-bold text-slate-900">Completion Rate by Driver</h3>
                        <p className="mb-4 text-xs text-slate-500">Percentage of orders marked completed</p>
                        <ResponsiveContainer width="100%" height={240}>
                          <BarChart
                            data={driverStats.map((d, i) => ({ name: d.name.split(' ')[0], rate: d.total > 0 ? Math.round(d.completed / d.total * 100) : 0, fill: DRIVER_PALETTE[i % DRIVER_PALETTE.length] }))}
                            margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                            <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                            <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} domain={[0, 100]} unit="%" />
                            <Tooltip formatter={(v) => `${v}%`} contentStyle={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 8, color: '#0f172a', fontSize: 12 }} />
                            <Bar dataKey="rate" radius={[4, 4, 0, 0]}>
                              {driverStats.map((_, i) => <Cell key={i} fill={DRIVER_PALETTE[i % DRIVER_PALETTE.length]} />)}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>

                      {/* Radar (single driver) or daily-by-driver (multi) */}
                      {driverStats.length === 1 && radarData.length > 0 ? (
                        <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
                          <h3 className="mb-1 text-sm font-bold text-slate-900">Driver Profile — {driverStats[0].name}</h3>
                          <p className="mb-4 text-xs text-slate-500">Multi-metric breakdown</p>
                          <ResponsiveContainer width="100%" height={240}>
                            <RadarChart data={radarData} cx="50%" cy="50%" outerRadius={80}>
                              <PolarGrid stroke="#cbd5e1" />
                              <PolarAngleAxis dataKey="metric" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                              <Radar name={driverStats[0].name} dataKey="value" stroke="#10b981" fill="#10b981" fillOpacity={0.25} />
                              <Tooltip contentStyle={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 8, color: '#0f172a', fontSize: 12 }} />
                            </RadarChart>
                          </ResponsiveContainer>
                        </div>
                      ) : (
                        <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
                          <h3 className="mb-1 text-sm font-bold text-slate-900">Daily Output by Driver</h3>
                          <p className="mb-4 text-xs text-slate-500">Orders per day, broken down per driver</p>
                          <ResponsiveContainer width="100%" height={240}>
                            <BarChart data={dailyData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                              <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                              <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} allowDecimals={false} />
                              <Tooltip contentStyle={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 8, color: '#0f172a', fontSize: 12 }} />
                              <Legend wrapperStyle={{ color: '#94a3b8', fontSize: 12 }} />
                              {driverNames.map((name, i) => (
                                <Bar key={name} dataKey={name} stackId="d" fill={DRIVER_PALETTE[i % DRIVER_PALETTE.length]}
                                  radius={i === driverNames.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]} />
                              ))}
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* ── DETAIL TABLE ─────────────────────── */}
                {driverStats.length > 0 && (
                  <div className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-slate-200">
                    <div className="border-b border-slate-200 px-6 py-4">
                      <h3 className="text-sm font-bold text-slate-900">Driver Summary Table</h3>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full divide-y divide-slate-200">
                        <thead className="bg-slate-50">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">Driver</th>
                            <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">Total</th>
                            <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">Completed</th>
                            <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">Issues</th>
                            <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">Completion</th>
                            {allTypes.map(t => (
                              <th key={t} className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">{t}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                          {driverStats.map((d, i) => {
                            const rate = d.total > 0 ? Math.round(d.completed / d.total * 100) : 0
                            const color = DRIVER_PALETTE[i % DRIVER_PALETTE.length]
                            return (
                              <tr key={d.id} className="hover:bg-slate-50/80 transition-colors">
                                <td className="px-4 py-3 text-sm font-semibold text-slate-900">{d.name}</td>
                                <td className="px-4 py-3 text-sm text-slate-700">{d.total}</td>
                                <td className="px-4 py-3 text-sm text-emerald-600">{d.completed}</td>
                                <td className="px-4 py-3 text-sm text-rose-600">{d.issues}</td>
                                <td className="px-4 py-3 text-sm">
                                  <div className="flex items-center gap-2">
                                    <div className="h-1.5 w-20 rounded-full bg-slate-200">
                                      <div className="h-1.5 rounded-full transition-all" style={{ width: `${rate}%`, background: color }} />
                                    </div>
                                    <span className="text-xs font-bold" style={{ color }}>{rate}%</span>
                                  </div>
                                </td>
                                {allTypes.map(t => (
                                  <td key={t} className="px-4 py-3 text-sm text-slate-700">{d.byType[t] || 0}</td>
                                ))}
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </>
    </AppShell>
  )
}
