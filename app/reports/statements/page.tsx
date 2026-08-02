'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import dynamic_ from 'next/dynamic'
import { createClient } from '@/lib/supabase/client'
import { CLIENT_CONFIG } from '@/lib/client-config'
import AppShell from '@/components/AppShell'
import Icon from '@/components/Icon'
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
  parent_order_id?: string | null
  bin_number?: string | null
  bin_id?: string | null
  old_bin_id?: string | null
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
function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Date(d + 'T12:00:00').toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })
}

// ── CSV export ───────────────────────────────────────────────────────────────
function exportStatementCSV(rows: Order[], driverMap: Record<string, string>, filename: string) {
  const headers = ['Ticket', 'Date', 'Order Type', 'Bin Size', 'Material', 'Address', 'Status', 'Driver', 'Notes']
  const data = rows.map(o => [
    o.ticket_number || '', o.scheduled_date || '', o.order_type || '',
    o.bin_size ? `${o.bin_size}Y` : '', o.bin_type || '',
    o.service_address || o.pickup_address || '', o.status || '',
    driverMap[o.driver_id || ''] || '', o.driver_notes || '',
  ])
  downloadCSV([headers, ...data], filename)
}

function downloadCSV(rows: (string | number)[][], filename: string) {
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

// ── Print helpers ────────────────────────────────────────────────────────────
function printStatement(rows: Order[], driverMap: Record<string, string>, customerName: string, dateFrom: string, dateTo: string) {
  const win = window.open('', '_blank')
  if (!win) return
  const byType: Record<string, number> = {}
  rows.forEach(o => { const t = o.order_type || 'Unknown'; byType[t] = (byType[t] || 0) + 1 })
  const summaryRows = Object.entries(byType).map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('')
  const tableRows = rows.map(o => `<tr>
    <td>${o.ticket_number || '—'}</td><td>${o.scheduled_date || '—'}</td>
    <td>${o.order_type || '—'}</td><td>${o.bin_size ? o.bin_size + 'Y' : '—'} ${o.bin_type || ''}</td>
    <td>${o.service_address || o.pickup_address || '—'}</td>
    <td>${formatStatus(o.status)}</td><td>${driverMap[o.driver_id || ''] || '—'}</td>
  </tr>`).join('')
  win.document.write(printLayout(`${CLIENT_CONFIG.name} — Account Statement`,
    `Customer: <strong>${customerName}</strong> &nbsp;|&nbsp; Period: ${dateFrom} to ${dateTo} &nbsp;|&nbsp; Total Orders: ${rows.length}`,
    `<h2>Order Type Summary</h2>
     <table style="width:280px"><thead><tr><th>Type</th><th>Count</th></tr></thead><tbody>${summaryRows}</tbody></table>
     <h2>Order Detail</h2>
     <table><thead><tr><th>Ticket</th><th>Date</th><th>Type</th><th>Bin</th><th>Address</th><th>Status</th><th>Driver</th></tr></thead><tbody>${tableRows}</tbody></table>`
  ))
  win.document.close(); win.print()
}

function printLayout(title: string, meta: string, body: string) {
  return `<html><head><title>${title}</title>
  <style>
    body{font-family:Arial,sans-serif;font-size:12px;padding:24px;color:#1e293b}
    h1{font-size:18px;margin:0 0 2px}h2{font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:#64748b;margin:18px 0 6px;border-bottom:1px solid #e2e8f0;padding-bottom:3px}
    .meta{font-size:12px;color:#475569;margin-bottom:20px;padding:10px 14px;background:#f8fafc;border-radius:6px}
    table{width:100%;border-collapse:collapse;margin-bottom:16px}
    th{background:#f1f5f9;text-align:left;padding:6px 10px;font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:#64748b}
    td{padding:6px 10px;border-bottom:1px solid #f1f5f9;vertical-align:top;font-size:11px}
    .footer{margin-top:20px;padding-top:10px;border-top:1px solid #e2e8f0;color:#94a3b8;font-size:10px}
    @media print{body{padding:0}}
  </style></head><body>
  <h1>${title}</h1>
  <p style="color:#94a3b8;font-size:11px;margin:2px 0 12px">Generated ${new Date().toLocaleDateString('en-CA',{year:'numeric',month:'long',day:'numeric'})}</p>
  <div class="meta">${meta}</div>
  ${body}
  <div class="footer">${CLIENT_CONFIG.name} · Document generated ${new Date().toISOString().slice(0,10)}</div>
  </body></html>`
}

// ════════════════════════════════════════════════════════════════════════════
// STATEMENT TAB
// ════════════════════════════════════════════════════════════════════════════
function StatementTab({ customers, drivers, driverMap }: {
  customers: Customer[]; drivers: Driver[]; driverMap: Record<string, string>
}) {
  const supabase = createClient()
  const [customerId, setCustomerId] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [orderTypeFilter, setOrderTypeFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [driverFilter, setDriverFilter] = useState('all')
  const [rows, setRows] = useState<Order[]>([])
  const [loading, setLoading] = useState(false)
  const [customerName, setCustomerName] = useState('')
  const [hasRun, setHasRun] = useState(false)
  const [showCharts, setShowCharts] = useState(false)
  const [sortField, setSortField] = useState('scheduled_date')
  const [sortDir, setSortDir] = useState<'asc'|'desc'>('desc')

  const filteredRows = useMemo(() => {
    let r = rows
    if (orderTypeFilter !== 'all') r = r.filter(o => o.order_type === orderTypeFilter)
    if (statusFilter !== 'all') r = r.filter(o => o.status === statusFilter)
    if (driverFilter !== 'all') r = r.filter(o => o.driver_id === driverFilter)
    return [...r].sort((a, b) => {
      const av = (a as Record<string,unknown>)[sortField] as string || ''
      const bv = (b as Record<string,unknown>)[sortField] as string || ''
      return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
    })
  }, [rows, orderTypeFilter, statusFilter, driverFilter, sortField, sortDir])

  const summary = useMemo(() => {
    const byType: Record<string,number> = {}, byStatus: Record<string,number> = {}, byDriver: Record<string,number> = {}
    filteredRows.forEach(o => {
      const t = o.order_type||'Unknown'; byType[t]=(byType[t]||0)+1
      const s = o.status||'unassigned'; byStatus[s]=(byStatus[s]||0)+1
      const d = driverMap[o.driver_id||'']||'Unassigned'; byDriver[d]=(byDriver[d]||0)+1
    })
    return { byType, byStatus, byDriver }
  }, [filteredRows, driverMap])

  async function runReport() {
    if (!customerId || !dateFrom || !dateTo) return
    setLoading(true); setShowCharts(false)
    const c = customers.find(c => c.id === customerId)
    setCustomerName(c?.name || '')
    const { data } = await supabase.from('order')
      .select('id,ticket_number,customer_name,customer_id,service_address,pickup_address,order_type,bin_size,bin_type,status,scheduled_date,driver_id,driver_notes,service_time')
      .eq('customer_id', customerId)
      .gte('scheduled_date', dateFrom).lte('scheduled_date', dateTo)
      .order('scheduled_date', { ascending: false })
    setRows((data as Order[]) || [])
    setHasRun(true); setLoading(false)
  }

  function toggleSort(field: string) {
    if (sortField === field) setSortDir(d => d==='asc'?'desc':'asc')
    else { setSortField(field); setSortDir('asc') }
  }

  const typeChartData = Object.entries(summary.byType).map(([name,value])=>({name,value}))
  const statusChartData = Object.entries(summary.byStatus).map(([name,value])=>({name:formatStatus(name),value,fill:STATUS_COLORS[name]||'#64748b'}))
  const driverChartData = Object.entries(summary.byDriver).map(([name,value])=>({name:name.split(' ')[0],value}))

  const cols = [
    {key:'ticket_number',label:'Ticket'},{key:'scheduled_date',label:'Date'},
    {key:'order_type',label:'Type'},{key:'bin_size',label:'Bin'},
    {key:'bin_type',label:'Material'},{key:'service_address',label:'Address'},
    {key:'status',label:'Status'},{key:'driver_id',label:'Driver'},{key:'driver_notes',label:'Notes'},
  ]

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <h2 className="mb-5 text-base font-bold text-slate-900">Filters</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-2">
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600">Customer *</label>
            <select value={customerId} onChange={e=>setCustomerId(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">Select a customer...</option>
              {customers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600">From *</label>
            <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600">To *</label>
            <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600">Order Type</label>
            <select value={orderTypeFilter} onChange={e=>setOrderTypeFilter(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none">
              <option value="all">All Types</option>
              {['DELIVERY','REMOVAL','EXCHANGE','DUMP RETURN'].map(t=><option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600">Status</label>
            <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none">
              <option value="all">All Statuses</option>
              {['completed','assigned','in_progress','unassigned','issue','cancelled'].map(s=>(
                <option key={s} value={s}>{formatStatus(s)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600">Driver</label>
            <select value={driverFilter} onChange={e=>setDriverFilter(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none">
              <option value="all">All Drivers</option>
              {drivers.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-3">
          <button onClick={runReport} disabled={!customerId||!dateFrom||!dateTo||loading}
            className="rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-bold text-white hover:bg-blue-500 disabled:opacity-50 transition">
            {loading ? 'Generating...' : 'Generate Statement'}
          </button>
          {hasRun && <button onClick={()=>{setRows([]);setHasRun(false);setShowCharts(false)}}
            className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition">Clear</button>}
        </div>
      </div>

      {hasRun && !loading && (
        <>
          {/* KPI strip */}
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
            <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 text-center">
              <div className="text-2xl font-black text-slate-900">{filteredRows.length}</div>
              <div className="mt-1 text-xs font-semibold text-slate-500">Total</div>
            </div>
            <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 text-center">
              <div className="text-2xl font-black text-emerald-600">{filteredRows.filter(o=>o.status==='completed').length}</div>
              <div className="mt-1 text-xs font-semibold text-slate-500">Completed</div>
            </div>
            {Object.entries(summary.byType).map(([type,count])=>(
              <div key={type} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 text-center">
                <div className="text-2xl font-black" style={{color:ORDER_TYPE_COLORS[type]||'#94a3b8'}}>{count}</div>
                <div className="mt-1 text-xs font-semibold text-slate-500">{type}</div>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-slate-500">
              <span className="font-bold text-slate-900">{filteredRows.length}</span> orders · <span className="text-slate-900">{customerName}</span> · {dateFrom} → {dateTo}
            </span>
            <div className="ml-auto flex flex-wrap gap-2">
              {!showCharts
                ? <button onClick={()=>setShowCharts(true)} className="rounded-xl border border-blue-300 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-600 hover:text-white transition">Generate Charts</button>
                : <button onClick={()=>setShowCharts(false)} className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition">Hide Charts</button>
              }
              {filteredRows.length > 0 && <>
                <button onClick={()=>exportStatementCSV(filteredRows,driverMap,`statement-${customerName}-${dateFrom}-${dateTo}.csv`)}
                  className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-600 transition">Export CSV</button>
                <button onClick={()=>printStatement(filteredRows,driverMap,customerName,dateFrom,dateTo)}
                  className="rounded-xl bg-slate-700 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-600 transition">Print / PDF</button>
              </>}
            </div>
          </div>

          {/* Charts */}
          {showCharts && filteredRows.length > 0 && (
            <div className="grid gap-4 lg:grid-cols-3">
              {[
                { title:'Orders by Type', data:typeChartData, type:'pie' as const },
              ].map(()=>null)}
              <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
                <h3 className="mb-4 text-sm font-bold text-slate-900">Orders by Type</h3>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={typeChartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={75} labelLine={false} label={({name,value})=>`${name}: ${value}`}>
                      {typeChartData.map((entry,i)=><Cell key={i} fill={ORDER_TYPE_COLORS[entry.name]||'#64748b'} />)}
                    </Pie>
                    <Tooltip contentStyle={{background:'#ffffff',border:'1px solid #e2e8f0',borderRadius:8,color:'#0f172a',fontSize:12}} />
                    <Legend wrapperStyle={{color:'#94a3b8',fontSize:11}} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
                <h3 className="mb-4 text-sm font-bold text-slate-900">Orders by Status</h3>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={statusChartData} margin={{top:5,right:10,left:-20,bottom:5}}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="name" tick={{fill:'#94a3b8',fontSize:10}} />
                    <YAxis tick={{fill:'#94a3b8',fontSize:11}} allowDecimals={false} />
                    <Tooltip contentStyle={{background:'#ffffff',border:'1px solid #e2e8f0',borderRadius:8,color:'#0f172a',fontSize:12}} />
                    <Bar dataKey="value" radius={[4,4,0,0]}>{statusChartData.map((e,i)=><Cell key={i} fill={e.fill} />)}</Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
                <h3 className="mb-4 text-sm font-bold text-slate-900">Orders by Driver</h3>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={driverChartData} margin={{top:5,right:10,left:-20,bottom:5}}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="name" tick={{fill:'#94a3b8',fontSize:10}} />
                    <YAxis tick={{fill:'#94a3b8',fontSize:11}} allowDecimals={false} />
                    <Tooltip contentStyle={{background:'#ffffff',border:'1px solid #e2e8f0',borderRadius:8,color:'#0f172a',fontSize:12}} />
                    <Bar dataKey="value" fill="#3b82f6" radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Table */}
          {filteredRows.length === 0
            ? <div className="rounded-3xl bg-white p-10 text-center text-sm text-slate-500 shadow-sm ring-1 ring-slate-200">No orders match the selected filters.</div>
            : <div className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-slate-200">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[900px] divide-y divide-slate-200">
                    <thead className="bg-slate-50">
                      <tr>{cols.map(col=>(
                        <th key={col.key} onClick={()=>toggleSort(col.key)}
                          className="cursor-pointer px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500 hover:text-slate-900 select-none transition">
                          {col.label}{sortField===col.key&&<span className="ml-1 text-blue-400">{sortDir==='asc'?'↑':'↓'}</span>}
                        </th>
                      ))}</tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {filteredRows.map(o=>(
                        <tr key={o.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="px-4 py-3 text-xs font-semibold text-slate-900 whitespace-nowrap">{o.ticket_number||'—'}</td>
                          <td className="px-4 py-3 text-xs text-slate-700 whitespace-nowrap">{o.scheduled_date||'—'}</td>
                          <td className="px-4 py-3 text-xs whitespace-nowrap">
                            <span className="rounded-full px-2.5 py-0.5 text-xs font-bold"
                              style={{background:(ORDER_TYPE_COLORS[o.order_type||'']||'#334155')+'30',color:ORDER_TYPE_COLORS[o.order_type||'']||'#94a3b8'}}>
                              {o.order_type||'—'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-700 whitespace-nowrap">{o.bin_size?`${o.bin_size}Y`:'—'}</td>
                          <td className="px-4 py-3 text-xs text-slate-700">{o.bin_type||'—'}</td>
                          <td className="px-4 py-3 text-xs text-slate-700 max-w-[200px] truncate">{o.service_address||o.pickup_address||'—'}</td>
                          <td className="px-4 py-3 text-xs whitespace-nowrap">
                            <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold"
                              style={{background:(STATUS_COLORS[o.status||'unassigned']||'#334155')+'30',color:STATUS_COLORS[o.status||'unassigned']||'#94a3b8'}}>
                              {formatStatus(o.status)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-700 whitespace-nowrap">{driverMap[o.driver_id||'']||'—'}</td>
                          <td className="px-4 py-3 text-xs text-slate-500 max-w-[160px] truncate">{o.driver_notes||'—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
          }
        </>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// INVOICE TAB
// ════════════════════════════════════════════════════════════════════════════
// ════════════════════════════════════════════════════════════════════════════
export default function StatementsPage() {
  const router = useRouter()
  const supabase = createClient()
  const { role, loading: roleLoading } = useRole()
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
    drivers.reduce<Record<string,string>>((acc, d) => { acc[d.id] = d.name || '—'; return acc }, {}),
    [drivers]
  )

  return (
    <AppShell
      title="Account Statement"
      subtitle="What a customer's crew did, job by job — billing lives under Invoices"
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
        <div className="mb-6 rounded-xl bg-slate-50 px-4 py-3 text-xs text-slate-600 ring-1 ring-slate-200">
          This is an activity report — what happened, not what is owed. To bill a customer, go to{' '}
          <Link href="/invoices?tab=new" className="font-semibold underline hover:text-slate-900">
            Invoices → New Invoice
          </Link>.
        </div>

        {pageLoading
          ? <div className="rounded-3xl bg-white p-10 text-center text-sm text-slate-500 shadow-sm ring-1 ring-slate-200">Loading...</div>
          : <StatementTab customers={customers} drivers={drivers} driverMap={driverMap} />
        }
      </>
    </AppShell>
  )
}
