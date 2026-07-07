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
  parent_order_id?: string | null
  bin_number?: string | null
}

type BillingCycle = {
  id: string
  ticket_number: string | null
  order_type: string | null
  address: string | null
  bin_size: string | null
  bin_type: string | null
  bin_number: string | null
  status: string | null
  cycle_end_date: string | null   // scheduled_date of this order (the billing trigger)
  cycle_start_date: string | null // scheduled_date of the parent DELIVERY, if linked
  days_on_site: number | null
  driver_id: string | null
  driver_notes: string | null
  parent_ticket: string | null
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

const BILLING_TYPES = ['REMOVAL', 'EXCHANGE', 'DUMP RETURN']

function formatStatus(s: string | null | undefined) {
  if (!s) return 'Unassigned'
  return s.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

function daysBetween(from: string | null, to: string | null): number | null {
  if (!from || !to) return null
  const a = new Date(from + 'T12:00:00')
  const b = new Date(to + 'T12:00:00')
  const diff = Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24))
  return diff >= 0 ? diff : null
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

function exportInvoiceCSV(cycles: BillingCycle[], driverMap: Record<string, string>, customerName: string, dateFrom: string, dateTo: string) {
  const headers = ['Ticket', 'Order Type', 'Delivery Date', 'Completion Date', 'Days on Site', 'Bin Size', 'Material', 'Bin #', 'Address', 'Status', 'Driver', 'Notes']
  const data = cycles.map(c => [
    c.ticket_number || '', c.order_type || '',
    c.cycle_start_date || 'N/A', c.cycle_end_date || '',
    c.days_on_site != null ? `${c.days_on_site}` : 'N/A',
    c.bin_size ? `${c.bin_size}Y` : '', c.bin_type || '', c.bin_number || '',
    c.address || '', c.status || '',
    driverMap[c.driver_id || ''] || '', c.driver_notes || '',
  ])
  downloadCSV([headers, ...data], `invoice-${customerName}-${dateFrom}-${dateTo}.csv`)
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

function printInvoice(cycles: BillingCycle[], driverMap: Record<string, string>, customerName: string, dateFrom: string, dateTo: string) {
  const win = window.open('', '_blank')
  if (!win) return
  const byType: Record<string, number> = {}
  cycles.forEach(c => { const t = c.order_type || 'Unknown'; byType[t] = (byType[t] || 0) + 1 })
  const summaryRows = Object.entries(byType).map(([k, v]) => `<tr><td>${k}</td><td>${v} service(s)</td></tr>`).join('')
  const tableRows = cycles.map(c => `<tr>
    <td>${c.ticket_number || '—'}</td>
    <td><strong>${c.order_type || '—'}</strong></td>
    <td>${c.cycle_start_date ? fmtDate(c.cycle_start_date) : '<em style="color:#94a3b8">N/A</em>'}</td>
    <td>${fmtDate(c.cycle_end_date)}</td>
    <td>${c.days_on_site != null ? `<strong>${c.days_on_site} days</strong>` : '<em style="color:#94a3b8">N/A</em>'}</td>
    <td>${c.bin_size ? c.bin_size + 'Y' : '—'} ${c.bin_type || ''}</td>
    <td>${c.address || '—'}</td>
    <td>${formatStatus(c.status)}</td>
    <td>${driverMap[c.driver_id || ''] || '—'}</td>
  </tr>`).join('')
  win.document.write(printLayout(`${CLIENT_CONFIG.name} — Invoice Report`,
    `Customer: <strong>${customerName}</strong> &nbsp;|&nbsp; Period: ${dateFrom} to ${dateTo} &nbsp;|&nbsp; Billable Events: ${cycles.length}`,
    `<div style="background:#fff8ed;border:1px solid #fed7aa;border-radius:6px;padding:10px 14px;margin-bottom:16px;font-size:11px;color:#92400e">
      <strong>Note:</strong> This report shows completed billing cycles (Removal, Exchange, Dump Return). Each line represents one chargeable service event. Dollar amounts are not included — use this to generate your invoice.
     </div>
     <h2>Billing Summary</h2>
     <table style="width:320px"><thead><tr><th>Service Type</th><th>Quantity</th></tr></thead><tbody>${summaryRows}</tbody></table>
     <h2>Billable Events</h2>
     <table><thead><tr><th>Ticket</th><th>Service</th><th>Delivery Date</th><th>Completion Date</th><th>Days on Site</th><th>Bin</th><th>Address</th><th>Status</th><th>Driver</th></tr></thead><tbody>${tableRows}</tbody></table>`
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
      <div className="rounded-3xl bg-slate-900 p-6 ring-1 ring-slate-700">
        <h2 className="mb-5 text-base font-bold text-white">Filters</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-2">
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-400">Customer *</label>
            <select value={customerId} onChange={e=>setCustomerId(e.target.value)}
              className="w-full rounded-xl border border-slate-600 bg-slate-800 px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">Select a customer...</option>
              {customers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-400">From *</label>
            <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)}
              className="w-full rounded-xl border border-slate-600 bg-slate-800 px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-400">To *</label>
            <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)}
              className="w-full rounded-xl border border-slate-600 bg-slate-800 px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-400">Order Type</label>
            <select value={orderTypeFilter} onChange={e=>setOrderTypeFilter(e.target.value)}
              className="w-full rounded-xl border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white focus:outline-none">
              <option value="all">All Types</option>
              {['DELIVERY','REMOVAL','EXCHANGE','DUMP RETURN'].map(t=><option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-400">Status</label>
            <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}
              className="w-full rounded-xl border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white focus:outline-none">
              <option value="all">All Statuses</option>
              {['completed','assigned','in_progress','unassigned','issue','cancelled'].map(s=>(
                <option key={s} value={s}>{formatStatus(s)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-400">Driver</label>
            <select value={driverFilter} onChange={e=>setDriverFilter(e.target.value)}
              className="w-full rounded-xl border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white focus:outline-none">
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
            className="rounded-xl border border-slate-600 bg-slate-800 px-4 py-2.5 text-sm font-semibold text-slate-300 hover:bg-slate-700 transition">Clear</button>}
        </div>
      </div>

      {hasRun && !loading && (
        <>
          {/* KPI strip */}
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
            <div className="rounded-2xl bg-slate-900 p-4 ring-1 ring-slate-700 text-center">
              <div className="text-2xl font-black text-white">{filteredRows.length}</div>
              <div className="mt-1 text-xs font-semibold text-slate-400">Total</div>
            </div>
            <div className="rounded-2xl bg-slate-900 p-4 ring-1 ring-slate-700 text-center">
              <div className="text-2xl font-black text-emerald-400">{filteredRows.filter(o=>o.status==='completed').length}</div>
              <div className="mt-1 text-xs font-semibold text-slate-400">Completed</div>
            </div>
            {Object.entries(summary.byType).map(([type,count])=>(
              <div key={type} className="rounded-2xl bg-slate-900 p-4 ring-1 ring-slate-700 text-center">
                <div className="text-2xl font-black" style={{color:ORDER_TYPE_COLORS[type]||'#94a3b8'}}>{count}</div>
                <div className="mt-1 text-xs font-semibold text-slate-400">{type}</div>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-slate-400">
              <span className="font-bold text-white">{filteredRows.length}</span> orders · <span className="text-white">{customerName}</span> · {dateFrom} → {dateTo}
            </span>
            <div className="ml-auto flex flex-wrap gap-2">
              {!showCharts
                ? <button onClick={()=>setShowCharts(true)} className="rounded-xl border border-blue-600 bg-blue-600/10 px-4 py-2 text-sm font-semibold text-blue-400 hover:bg-blue-600 hover:text-white transition">Generate Charts</button>
                : <button onClick={()=>setShowCharts(false)} className="rounded-xl border border-slate-600 bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-300 hover:bg-slate-700 transition">Hide Charts</button>
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
              <div className="rounded-3xl bg-slate-900 p-5 ring-1 ring-slate-700">
                <h3 className="mb-4 text-sm font-bold text-white">Orders by Type</h3>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={typeChartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={75} labelLine={false} label={({name,value})=>`${name}: ${value}`}>
                      {typeChartData.map((entry,i)=><Cell key={i} fill={ORDER_TYPE_COLORS[entry.name]||'#64748b'} />)}
                    </Pie>
                    <Tooltip contentStyle={{background:'#1e293b',border:'1px solid #334155',borderRadius:8,color:'#f1f5f9',fontSize:12}} />
                    <Legend wrapperStyle={{color:'#94a3b8',fontSize:11}} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="rounded-3xl bg-slate-900 p-5 ring-1 ring-slate-700">
                <h3 className="mb-4 text-sm font-bold text-white">Orders by Status</h3>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={statusChartData} margin={{top:5,right:10,left:-20,bottom:5}}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="name" tick={{fill:'#94a3b8',fontSize:10}} />
                    <YAxis tick={{fill:'#94a3b8',fontSize:11}} allowDecimals={false} />
                    <Tooltip contentStyle={{background:'#1e293b',border:'1px solid #334155',borderRadius:8,color:'#f1f5f9',fontSize:12}} />
                    <Bar dataKey="value" radius={[4,4,0,0]}>{statusChartData.map((e,i)=><Cell key={i} fill={e.fill} />)}</Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="rounded-3xl bg-slate-900 p-5 ring-1 ring-slate-700">
                <h3 className="mb-4 text-sm font-bold text-white">Orders by Driver</h3>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={driverChartData} margin={{top:5,right:10,left:-20,bottom:5}}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="name" tick={{fill:'#94a3b8',fontSize:10}} />
                    <YAxis tick={{fill:'#94a3b8',fontSize:11}} allowDecimals={false} />
                    <Tooltip contentStyle={{background:'#1e293b',border:'1px solid #334155',borderRadius:8,color:'#f1f5f9',fontSize:12}} />
                    <Bar dataKey="value" fill="#3b82f6" radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Table */}
          {filteredRows.length === 0
            ? <div className="rounded-3xl bg-slate-900 p-10 text-center text-sm text-slate-400 ring-1 ring-slate-700">No orders match the selected filters.</div>
            : <div className="overflow-hidden rounded-3xl bg-slate-900 ring-1 ring-slate-700">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[900px] divide-y divide-slate-800">
                    <thead className="bg-slate-800">
                      <tr>{cols.map(col=>(
                        <th key={col.key} onClick={()=>toggleSort(col.key)}
                          className="cursor-pointer px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-400 hover:text-white select-none transition">
                          {col.label}{sortField===col.key&&<span className="ml-1 text-blue-400">{sortDir==='asc'?'↑':'↓'}</span>}
                        </th>
                      ))}</tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {filteredRows.map(o=>(
                        <tr key={o.id} className="hover:bg-slate-800/60 transition-colors">
                          <td className="px-4 py-3 text-xs font-semibold text-white whitespace-nowrap">{o.ticket_number||'—'}</td>
                          <td className="px-4 py-3 text-xs text-slate-300 whitespace-nowrap">{o.scheduled_date||'—'}</td>
                          <td className="px-4 py-3 text-xs whitespace-nowrap">
                            <span className="rounded-full px-2.5 py-0.5 text-xs font-bold"
                              style={{background:(ORDER_TYPE_COLORS[o.order_type||'']||'#334155')+'30',color:ORDER_TYPE_COLORS[o.order_type||'']||'#94a3b8'}}>
                              {o.order_type||'—'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-300 whitespace-nowrap">{o.bin_size?`${o.bin_size}Y`:'—'}</td>
                          <td className="px-4 py-3 text-xs text-slate-300">{o.bin_type||'—'}</td>
                          <td className="px-4 py-3 text-xs text-slate-300 max-w-[200px] truncate">{o.service_address||o.pickup_address||'—'}</td>
                          <td className="px-4 py-3 text-xs whitespace-nowrap">
                            <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold"
                              style={{background:(STATUS_COLORS[o.status||'unassigned']||'#334155')+'30',color:STATUS_COLORS[o.status||'unassigned']||'#94a3b8'}}>
                              {formatStatus(o.status)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-300 whitespace-nowrap">{driverMap[o.driver_id||'']||'—'}</td>
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
function InvoiceTab({ customers, drivers, driverMap }: {
  customers: Customer[]; drivers: Driver[]; driverMap: Record<string, string>
}) {
  const supabase = createClient()
  const [customerId, setCustomerId] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')

  const [cycles, setCycles] = useState<BillingCycle[]>([])
  const [loading, setLoading] = useState(false)
  const [customerName, setCustomerName] = useState('')
  const [hasRun, setHasRun] = useState(false)
  const [showCharts, setShowCharts] = useState(false)
  const [sortField, setSortField] = useState('cycle_end_date')
  const [sortDir, setSortDir] = useState<'asc'|'desc'>('desc')

  const filteredCycles = useMemo(() => {
    let r = cycles
    if (typeFilter !== 'all') r = r.filter(c => c.order_type === typeFilter)
    if (statusFilter !== 'all') r = r.filter(c => c.status === statusFilter)
    return [...r].sort((a, b) => {
      const av = (a as Record<string,unknown>)[sortField] as string || ''
      const bv = (b as Record<string,unknown>)[sortField] as string || ''
      return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
    })
  }, [cycles, typeFilter, statusFilter, sortField, sortDir])

  async function runReport() {
    if (!customerId || !dateFrom || !dateTo) return
    setLoading(true); setShowCharts(false)
    const c = customers.find(c => c.id === customerId)
    setCustomerName(c?.name || '')

    // Fetch billing trigger orders (REMOVAL, EXCHANGE, DUMP RETURN)
    const { data: billingOrders } = await supabase
      .from('order')
      .select('id,ticket_number,order_type,service_address,pickup_address,bin_size,bin_type,bin_number,status,scheduled_date,driver_id,driver_notes,parent_order_id')
      .eq('customer_id', customerId)
      .in('order_type', BILLING_TYPES)
      .gte('scheduled_date', dateFrom)
      .lte('scheduled_date', dateTo)
      .order('scheduled_date', { ascending: false })

    const orders = (billingOrders as Order[]) || []

    // Collect parent IDs to fetch delivery dates
    const parentIds = orders.map(o => o.parent_order_id).filter(Boolean) as string[]
    let parentMap: Record<string, { scheduled_date: string | null; ticket_number: string | null }> = {}

    if (parentIds.length > 0) {
      const { data: parents } = await supabase
        .from('order')
        .select('id,scheduled_date,ticket_number')
        .in('id', parentIds)
      if (parents) {
        parents.forEach((p: { id: string; scheduled_date: string | null; ticket_number: string | null }) => {
          parentMap[p.id] = { scheduled_date: p.scheduled_date, ticket_number: p.ticket_number }
        })
      }
    }

    const result: BillingCycle[] = orders.map(o => {
      const parent = o.parent_order_id ? parentMap[o.parent_order_id] : null
      const startDate = parent?.scheduled_date || null
      const endDate = o.scheduled_date
      return {
        id: o.id,
        ticket_number: o.ticket_number,
        order_type: o.order_type,
        address: o.service_address || o.pickup_address,
        bin_size: o.bin_size,
        bin_type: o.bin_type,
        bin_number: o.bin_number || null,
        status: o.status,
        cycle_end_date: endDate,
        cycle_start_date: startDate,
        days_on_site: daysBetween(startDate, endDate),
        driver_id: o.driver_id,
        driver_notes: o.driver_notes || null,
        parent_ticket: parent?.ticket_number || null,
      }
    })

    setCycles(result)
    setHasRun(true)
    setLoading(false)
  }

  function toggleSort(field: string) {
    if (sortField === field) setSortDir(d => d==='asc'?'desc':'asc')
    else { setSortField(field); setSortDir('asc') }
  }

  // Summary stats
  const byType = useMemo(() => {
    const m: Record<string,number> = {}
    filteredCycles.forEach(c => { const t = c.order_type||'Unknown'; m[t]=(m[t]||0)+1 })
    return m
  }, [filteredCycles])

  const avgDays = useMemo(() => {
    const withDays = filteredCycles.filter(c => c.days_on_site != null)
    if (!withDays.length) return null
    return Math.round(withDays.reduce((s,c) => s + (c.days_on_site||0), 0) / withDays.length)
  }, [filteredCycles])

  const maxDays = useMemo(() => {
    const vals = filteredCycles.map(c => c.days_on_site).filter((v): v is number => v != null)
    return vals.length ? Math.max(...vals) : null
  }, [filteredCycles])

  const typeChartData = Object.entries(byType).map(([name,value])=>({name,value}))
  const daysChartData = useMemo(() => {
    const buckets: Record<string,number> = {'0–7':0,'8–14':0,'15–30':0,'31–60':0,'60+':0}
    filteredCycles.forEach(c => {
      const d = c.days_on_site
      if (d == null) return
      if (d <= 7) buckets['0–7']++
      else if (d <= 14) buckets['8–14']++
      else if (d <= 30) buckets['15–30']++
      else if (d <= 60) buckets['31–60']++
      else buckets['60+']++
    })
    return Object.entries(buckets).map(([name,value])=>({name,value}))
  }, [filteredCycles])

  const cols = [
    {key:'ticket_number',label:'Ticket'},
    {key:'order_type',label:'Service'},
    {key:'cycle_start_date',label:'Delivery Date'},
    {key:'cycle_end_date',label:'Completion Date'},
    {key:'days_on_site',label:'Days on Site'},
    {key:'bin_size',label:'Bin Size'},
    {key:'bin_type',label:'Material'},
    {key:'bin_number',label:'Bin #'},
    {key:'address',label:'Address'},
    {key:'status',label:'Status'},
    {key:'driver_id',label:'Driver'},
  ]

  return (
    <div className="space-y-6">

      {/* Info banner */}
      <div className="rounded-2xl border border-amber-700/50 bg-amber-900/20 px-5 py-4">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 text-lg">💡</span>
          <div>
            <p className="text-sm font-semibold text-amber-300">How Invoice Reports work</p>
            <p className="mt-1 text-xs text-amber-400/80 leading-relaxed">
              This report shows <strong className="text-amber-300">completed billing cycles</strong> — orders of type <strong className="text-amber-300">Removal</strong>, <strong className="text-amber-300">Exchange</strong>, or <strong className="text-amber-300">Dump Return</strong>. Each row is one chargeable event. Where a linked delivery exists, the bin's time on site is calculated automatically. No dollar amounts — use this to build your invoice.
            </p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="rounded-3xl bg-slate-900 p-6 ring-1 ring-slate-700">
        <h2 className="mb-5 text-base font-bold text-white">Filters</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-2">
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-400">Customer *</label>
            <select value={customerId} onChange={e=>setCustomerId(e.target.value)}
              className="w-full rounded-xl border border-slate-600 bg-slate-800 px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500">
              <option value="">Select a customer...</option>
              {customers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-400">From *</label>
            <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)}
              className="w-full rounded-xl border border-slate-600 bg-slate-800 px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-400">To *</label>
            <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)}
              className="w-full rounded-xl border border-slate-600 bg-slate-800 px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500" />
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-400">Service Type</label>
            <select value={typeFilter} onChange={e=>setTypeFilter(e.target.value)}
              className="w-full rounded-xl border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white focus:outline-none">
              <option value="all">All Billing Types</option>
              {BILLING_TYPES.map(t=><option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-400">Status</label>
            <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}
              className="w-full rounded-xl border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white focus:outline-none">
              <option value="all">All Statuses</option>
              {['completed','assigned','in_progress','unassigned','issue'].map(s=>(
                <option key={s} value={s}>{formatStatus(s)}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-3">
          <button onClick={runReport} disabled={!customerId||!dateFrom||!dateTo||loading}
            className="rounded-xl bg-amber-600 px-6 py-2.5 text-sm font-bold text-white hover:bg-amber-500 disabled:opacity-50 transition">
            {loading ? 'Generating...' : 'Generate Invoice Report'}
          </button>
          {hasRun && <button onClick={()=>{setCycles([]);setHasRun(false);setShowCharts(false)}}
            className="rounded-xl border border-slate-600 bg-slate-800 px-4 py-2.5 text-sm font-semibold text-slate-300 hover:bg-slate-700 transition">Clear</button>}
        </div>
      </div>

      {hasRun && !loading && (
        <>
          {/* KPI strip */}
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
            <div className="rounded-2xl bg-slate-900 p-4 ring-1 ring-slate-700 text-center">
              <div className="text-2xl font-black text-white">{filteredCycles.length}</div>
              <div className="mt-1 text-xs font-semibold text-slate-400">Billable Events</div>
            </div>
            <div className="rounded-2xl bg-slate-900 p-4 ring-1 ring-slate-700 text-center">
              <div className="text-2xl font-black text-emerald-400">{filteredCycles.filter(c=>c.status==='completed').length}</div>
              <div className="mt-1 text-xs font-semibold text-slate-400">Completed</div>
            </div>
            <div className="rounded-2xl bg-slate-900 p-4 ring-1 ring-amber-800/40 text-center">
              <div className="text-2xl font-black text-amber-400">{avgDays != null ? avgDays : '—'}</div>
              <div className="mt-1 text-xs font-semibold text-slate-400">Avg Days on Site</div>
            </div>
            <div className="rounded-2xl bg-slate-900 p-4 ring-1 ring-slate-700 text-center">
              <div className="text-2xl font-black text-slate-200">{maxDays != null ? maxDays : '—'}</div>
              <div className="mt-1 text-xs font-semibold text-slate-400">Max Days on Site</div>
            </div>
            <div className="rounded-2xl bg-slate-900 p-4 ring-1 ring-slate-700 text-center">
              <div className="text-2xl font-black text-slate-400">{filteredCycles.filter(c=>c.cycle_start_date==null).length}</div>
              <div className="mt-1 text-xs font-semibold text-slate-400">No Delivery Linked</div>
            </div>
          </div>

          {/* By type chips */}
          {Object.entries(byType).length > 0 && (
            <div className="flex flex-wrap gap-3">
              {Object.entries(byType).map(([type,count])=>(
                <div key={type} className="flex items-center gap-2 rounded-xl px-4 py-2 ring-1"
                  style={{background:(ORDER_TYPE_COLORS[type]||'#334155')+'15',borderColor:(ORDER_TYPE_COLORS[type]||'#334155')+'50'}}>
                  <span className="text-sm font-black" style={{color:ORDER_TYPE_COLORS[type]||'#94a3b8'}}>{count}</span>
                  <span className="text-xs font-semibold text-slate-400">{type}</span>
                </div>
              ))}
            </div>
          )}

          {/* Action bar */}
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-slate-400">
              <span className="font-bold text-white">{filteredCycles.length}</span> billing events · <span className="text-white">{customerName}</span> · {dateFrom} → {dateTo}
            </span>
            <div className="ml-auto flex flex-wrap gap-2">
              {!showCharts
                ? <button onClick={()=>setShowCharts(true)} className="rounded-xl border border-amber-600 bg-amber-600/10 px-4 py-2 text-sm font-semibold text-amber-400 hover:bg-amber-600 hover:text-white transition">Generate Charts</button>
                : <button onClick={()=>setShowCharts(false)} className="rounded-xl border border-slate-600 bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-300 hover:bg-slate-700 transition">Hide Charts</button>
              }
              {filteredCycles.length > 0 && <>
                <button onClick={()=>exportInvoiceCSV(filteredCycles,driverMap,customerName,dateFrom,dateTo)}
                  className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-600 transition">Export CSV</button>
                <button onClick={()=>printInvoice(filteredCycles,driverMap,customerName,dateFrom,dateTo)}
                  className="rounded-xl bg-amber-700 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600 transition">Print Invoice PDF</button>
              </>}
            </div>
          </div>

          {/* Charts */}
          {showCharts && filteredCycles.length > 0 && (
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-3xl bg-slate-900 p-5 ring-1 ring-slate-700">
                <h3 className="mb-1 text-sm font-bold text-white">Billing Events by Service Type</h3>
                <p className="mb-4 text-xs text-slate-500">Number of chargeable cycles per type</p>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={typeChartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={75} labelLine={false} label={({name,value})=>`${name}: ${value}`}>
                      {typeChartData.map((e,i)=><Cell key={i} fill={ORDER_TYPE_COLORS[e.name]||'#64748b'} />)}
                    </Pie>
                    <Tooltip contentStyle={{background:'#1e293b',border:'1px solid #334155',borderRadius:8,color:'#f1f5f9',fontSize:12}} />
                    <Legend wrapperStyle={{color:'#94a3b8',fontSize:11}} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="rounded-3xl bg-slate-900 p-5 ring-1 ring-slate-700">
                <h3 className="mb-1 text-sm font-bold text-white">Days on Site Distribution</h3>
                <p className="mb-4 text-xs text-slate-500">How long bins stayed before being picked up</p>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={daysChartData} margin={{top:5,right:10,left:-20,bottom:5}}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="name" tick={{fill:'#94a3b8',fontSize:11}} />
                    <YAxis tick={{fill:'#94a3b8',fontSize:11}} allowDecimals={false} />
                    <Tooltip contentStyle={{background:'#1e293b',border:'1px solid #334155',borderRadius:8,color:'#f1f5f9',fontSize:12}} />
                    <Bar dataKey="value" fill="#f59e0b" radius={[4,4,0,0]} name="Bins" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Table */}
          {filteredCycles.length === 0
            ? <div className="rounded-3xl bg-slate-900 p-10 text-center text-sm text-slate-400 ring-1 ring-slate-700">No billing events found for the selected filters.</div>
            : <div className="overflow-hidden rounded-3xl bg-slate-900 ring-1 ring-slate-700">
                <div className="border-b border-slate-700 px-6 py-4 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-white">Billable Events</h3>
                    <p className="mt-0.5 text-xs text-slate-500">Each row = one chargeable service cycle</p>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1000px] divide-y divide-slate-800">
                    <thead className="bg-slate-800">
                      <tr>{cols.map(col=>(
                        <th key={col.key} onClick={()=>toggleSort(col.key)}
                          className="cursor-pointer px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-400 hover:text-white select-none transition">
                          {col.label}{sortField===col.key&&<span className="ml-1 text-amber-400">{sortDir==='asc'?'↑':'↓'}</span>}
                        </th>
                      ))}</tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {filteredCycles.map(c => {
                        const hasDays = c.days_on_site != null
                        const isLong = hasDays && (c.days_on_site||0) > 30
                        return (
                          <tr key={c.id} className="hover:bg-slate-800/60 transition-colors">
                            <td className="px-4 py-3 text-xs font-semibold text-white whitespace-nowrap">
                              {c.ticket_number||'—'}
                              {c.parent_ticket && <div className="text-[10px] text-slate-500 mt-0.5">↳ {c.parent_ticket}</div>}
                            </td>
                            <td className="px-4 py-3 text-xs whitespace-nowrap">
                              <span className="rounded-full px-2.5 py-0.5 text-xs font-bold"
                                style={{background:(ORDER_TYPE_COLORS[c.order_type||'']||'#334155')+'30',color:ORDER_TYPE_COLORS[c.order_type||'']||'#94a3b8'}}>
                                {c.order_type||'—'}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-xs text-slate-300 whitespace-nowrap">
                              {c.cycle_start_date
                                ? <span>{fmtDate(c.cycle_start_date)}</span>
                                : <span className="text-slate-600 italic">No delivery linked</span>
                              }
                            </td>
                            <td className="px-4 py-3 text-xs text-slate-300 whitespace-nowrap">{fmtDate(c.cycle_end_date)}</td>
                            <td className="px-4 py-3 text-xs whitespace-nowrap">
                              {hasDays
                                ? <span className={`font-bold ${isLong ? 'text-rose-400' : 'text-amber-400'}`}>{c.days_on_site} days{isLong&&' ⚠'}</span>
                                : <span className="text-slate-600 italic">—</span>
                              }
                            </td>
                            <td className="px-4 py-3 text-xs text-slate-300 whitespace-nowrap">{c.bin_size?`${c.bin_size}Y`:'—'}</td>
                            <td className="px-4 py-3 text-xs text-slate-300">{c.bin_type||'—'}</td>
                            <td className="px-4 py-3 text-xs text-slate-400">{c.bin_number||'—'}</td>
                            <td className="px-4 py-3 text-xs text-slate-300 max-w-[180px] truncate">{c.address||'—'}</td>
                            <td className="px-4 py-3 text-xs whitespace-nowrap">
                              <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold"
                                style={{background:(STATUS_COLORS[c.status||'unassigned']||'#334155')+'30',color:STATUS_COLORS[c.status||'unassigned']||'#94a3b8'}}>
                                {formatStatus(c.status)}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-xs text-slate-300 whitespace-nowrap">{driverMap[c.driver_id||'']||'—'}</td>
                          </tr>
                        )
                      })}
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
// MAIN PAGE
// ════════════════════════════════════════════════════════════════════════════
export default function StatementsPage() {
  const router = useRouter()
  const supabase = createClient()
  const { role, loading: roleLoading } = useRole()
  const [tab, setTab] = useState<'statement'|'invoice'>('statement')
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
                <p className="mt-0.5 text-sm text-slate-400">Full activity statements and billing cycle invoices</p>
              </div>
            </div>
            <Link href="/reports" className="self-start inline-flex items-center gap-2 rounded-2xl border border-slate-600 bg-slate-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 sm:self-auto">
              ← Back
            </Link>
          </div>
        </div>

        {/* Tabs */}
        <div className="mb-6 flex gap-2 rounded-2xl bg-slate-900 p-1.5 ring-1 ring-slate-700 w-fit">
          <button onClick={()=>setTab('statement')}
            className={`rounded-xl px-5 py-2.5 text-sm font-semibold transition ${tab==='statement'?'bg-blue-600 text-white shadow':'text-slate-400 hover:text-white'}`}>
            Account Statement
          </button>
          <button onClick={()=>setTab('invoice')}
            className={`rounded-xl px-5 py-2.5 text-sm font-semibold transition ${tab==='invoice'?'bg-amber-600 text-white shadow':'text-slate-400 hover:text-white'}`}>
            Invoice Report
          </button>
        </div>

        {pageLoading
          ? <div className="rounded-3xl bg-slate-800 p-10 text-center text-sm text-slate-400">Loading...</div>
          : tab === 'statement'
            ? <StatementTab customers={customers} drivers={drivers} driverMap={driverMap} />
            : <InvoiceTab customers={customers} drivers={drivers} driverMap={driverMap} />
        }
      </div>
    </div>
  )
}
