'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
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
  service_time?: string | null
  service_window?: string | null
  bin_type: string | null
  bin_size: string | null
  order_type: string | null
  driver_id: string | null
  driver_notes?: string | null
  scheduled_date: string | null
  status: string | null
  created_at: string | null
}

type Driver = {
  id: string
  name: string | null
  status: string | null
}

type Bin = {
  id: string
  bin_number: string | null
  bin_size: string | null
  status: string | null
  location?: string | null
}

type Customer = {
  id: string
  name: string | null
  status?: string | null
}

const TABLE_NAME = 'order'

const statusClasses: Record<string, string> = {
  unassigned: 'bg-slate-100 text-slate-700 border-slate-200',
  assigned: 'bg-blue-100 text-blue-700 border-blue-200',
  in_progress: 'bg-amber-100 text-amber-700 border-amber-200',
  completed: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  issue: 'bg-rose-100 text-rose-700 border-rose-200',
}

const orderTypeClasses: Record<string, string> = {
  DELIVERY: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  EXCHANGE: 'bg-amber-100 text-amber-700 border-amber-200',
  REMOVAL: 'bg-rose-100 text-rose-700 border-rose-200',
  'DUMP RETURN': 'bg-sky-100 text-sky-700 border-sky-200',
}

function formatStatus(status: string | null | undefined) {
  if (!status) return 'Unassigned'
  return status
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

function formatDate(date: string | null) {
  if (!date) return '—'
  const parsed = new Date(date)
  if (Number.isNaN(parsed.getTime())) return date
  return parsed.toLocaleDateString()
}

function formatOrderType(orderType: string | null | undefined) {
  return orderType || 'DELIVERY'
}

function isToday(date: string | null) {
  if (!date) return false

  const value = new Date(date)
  const today = new Date()

  return (
    value.getFullYear() === today.getFullYear() &&
    value.getMonth() === today.getMonth() &&
    value.getDate() === today.getDate()
  )
}

function formatServiceTime(value: string | null | undefined) {
  if (!value) return '—'
  const [hourStr, minuteStr] = value.split(':')
  const hour = Number(hourStr)
  const minute = Number(minuteStr)
  if (Number.isNaN(hour) || Number.isNaN(minute)) return value

  const date = new Date()
  date.setHours(hour, minute, 0, 0)

  return date.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  })
}

export default function DashboardPage() {
  const supabase = createClient()
  const router = useRouter()
  const { role, loading: roleLoading } = useRole()

  useEffect(() => {
    if (!roleLoading && role !== null && !can(role, 'canViewDashboard')) {
      router.push(role === 'driver' ? '/driver' : '/dispatch')
    }
  }, [roleLoading, role])

  const [orders, setOrders] = useState<Order[]>([])
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [bins, setBins] = useState<Bin[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [pageError, setPageError] = useState('')

  // Report state
  const [reportOpen, setReportOpen] = useState(false)
  const [reportCustomerId, setReportCustomerId] = useState('')
  const [reportDateFrom, setReportDateFrom] = useState('')
  const [reportDateTo, setReportDateTo] = useState('')
  const [reportRows, setReportRows] = useState<Order[]>([])
  const [reportLoading, setReportLoading] = useState(false)
  const [reportCustomerName, setReportCustomerName] = useState('')

  async function loadDashboard() {
    setLoading(true)
    setPageError('')

    const [ordersRes, driversRes, binsRes, customersRes] = await Promise.all([
      supabase
        .from(TABLE_NAME)
        .select(
          'id,ticket_number,customer_name,pickup_address,service_address,service_time,service_window,bin_type,bin_size,order_type,driver_id,scheduled_date,status,created_at'
        )
        .order('created_at', { ascending: false }),

      supabase
        .from('drivers')
        .select('id,name,status')
        .order('name', { ascending: true }),

      supabase
        .from('bins')
        .select('id,bin_number,bin_size,status,location')
        .order('bin_number', { ascending: true }),

      supabase
        .from('customers')
        .select('id,name,status')
        .eq('status', 'active')
        .order('name', { ascending: true }),
    ])

    if (ordersRes.error) setPageError(ordersRes.error.message)
    if (driversRes.error) setPageError((prev) => prev || driversRes.error!.message)
    if (binsRes.error) setPageError((prev) => prev || binsRes.error!.message)
    if (customersRes.error) setPageError((prev) => prev || customersRes.error!.message)

    setOrders((ordersRes.data as Order[]) || [])
    setDrivers((driversRes.data as Driver[]) || [])
    setBins((binsRes.data as Bin[]) || [])
    setCustomers((customersRes.data as Customer[]) || [])
    setLoading(false)
  }

  async function handleLogOff() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  async function runReport() {
    if (!reportCustomerId || !reportDateFrom || !reportDateTo) return
    setReportLoading(true)
    const customer = customers.find(c => c.id === reportCustomerId)
    setReportCustomerName(customer?.name || '')
    const { data, error } = await supabase
      .from(TABLE_NAME)
      .select('id,ticket_number,customer_name,customer_id,service_address,pickup_address,order_type,bin_size,bin_type,status,scheduled_date,driver_id,driver_notes')
      .eq('customer_id', reportCustomerId)
      .gte('scheduled_date', reportDateFrom)
      .lte('scheduled_date', reportDateTo)
      .order('scheduled_date', { ascending: true })
    if (!error) setReportRows((data as Order[]) || [])
    setReportLoading(false)
  }

  function exportCSV() {
    if (!reportRows.length) return
    const headers = ['Ticket','Date','Type','Bin Size','Bin Type','Address','Status','Driver','Driver Notes']
    const rows = reportRows.map(o => [
      o.ticket_number || '',
      o.scheduled_date || '',
      o.order_type || '',
      o.bin_size || '',
      o.bin_type || '',
      o.service_address || o.pickup_address || '',
      o.status || '',
      driverMap[o.driver_id || '']?.name || '',
      o.driver_notes || '',
    ])
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `report-${reportCustomerName}-${reportDateFrom}-${reportDateTo}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  function printReport() {
    const win = window.open('', '_blank')
    if (!win) return
    const rows = reportRows.map(o => `
      <tr>
        <td>${o.ticket_number || '—'}</td>
        <td>${o.scheduled_date || '—'}</td>
        <td>${o.order_type || '—'}</td>
        <td>${o.bin_size || '—'} ${o.bin_type || ''}</td>
        <td>${o.service_address || o.pickup_address || '—'}</td>
        <td>${o.status || '—'}</td>
        <td>${driverMap[o.driver_id || '']?.name || '—'}</td>
        <td>${o.driver_notes || '—'}</td>
      </tr>`).join('')
    win.document.write(`
      <html><head><title>Report — ${reportCustomerName}</title>
      <style>
        body { font-family: Arial, sans-serif; font-size: 12px; padding: 20px; }
        h2 { margin-bottom: 4px; }
        p { margin: 0 0 16px; color: #666; }
        table { width: 100%; border-collapse: collapse; }
        th { background: #f1f5f9; text-align: left; padding: 8px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; }
        td { padding: 8px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
        @media print { body { padding: 0; } }
      </style></head>
      <body>
        <h2>${CLIENT_CONFIG.name} — Customer Report</h2>
        <p>${reportCustomerName} &nbsp;|&nbsp; ${reportDateFrom} to ${reportDateTo} &nbsp;|&nbsp; ${reportRows.length} orders</p>
        <table>
          <thead><tr>
            <th>Ticket</th><th>Date</th><th>Type</th><th>Bin</th>
            <th>Address</th><th>Status</th><th>Driver</th><th>Notes</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </body></html>`)
    win.document.close()
    win.print()
  }

  useEffect(() => {
    void loadDashboard()

    const channel = supabase
      .channel('dashboard-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: TABLE_NAME },
        async () => {
          await loadDashboard()
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'drivers' },
        async () => {
          await loadDashboard()
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bins' },
        async () => {
          await loadDashboard()
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'customers' },
        async () => {
          await loadDashboard()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  const driverMap = useMemo(() => {
    return drivers.reduce<Record<string, Driver>>((acc, driver) => {
      acc[driver.id] = driver
      return acc
    }, {})
  }, [drivers])

  const metrics = useMemo(() => {
    const ordersToday = orders.filter((order) => isToday(order.scheduled_date)).length
    const completedToday = orders.filter(
      (order) => isToday(order.scheduled_date) && order.status === 'completed'
    ).length
    const activeDrivers = drivers.filter(
      (driver) => driver.status === 'available' || driver.status === 'busy'
    ).length
    const pendingOrders = orders.filter(
      (order) =>
        (order.status || 'unassigned') === 'unassigned' ||
        order.status === 'assigned' ||
        order.status === 'in_progress'
    ).length

    return {
      ordersToday,
      completedToday,
      activeDrivers,
      pendingOrders,
      totalCustomers: customers.length,
      totalBins: bins.length,
      totalDrivers: drivers.length,
    }
  }, [orders, drivers, customers, bins])

  const recentOrders = useMemo(() => {
    return [...orders].slice(0, 8)
  }, [orders])

  const orderTypeSummary = useMemo(() => {
    return {
      delivery: orders.filter((o) => (o.order_type || 'DELIVERY') === 'DELIVERY').length,
      exchange: orders.filter((o) => o.order_type === 'EXCHANGE').length,
      removal: orders.filter((o) => o.order_type === 'REMOVAL').length,
      dumpReturn: orders.filter((o) => o.order_type === 'DUMP RETURN').length,
    }
  }, [orders])

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="mx-auto max-w-7xl p-4 md:p-6">
        <div className="mb-6 rounded-3xl bg-gradient-to-r from-slate-950 via-slate-900 to-slate-800 p-6 text-white shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-4">
              <AppLogo className="h-12 w-auto" />
              <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/dispatch"
                className="rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-100"
              >
                Dispatch Board
              </Link>

              <button
                onClick={loadDashboard}
                className="rounded-2xl border border-slate-600 bg-slate-800 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-700"
              >
                Refresh
              </button>
              
              <button
                onClick={handleLogOff}
                className="rounded-2xl border border-rose-400 bg-rose-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-rose-600"
              >
                Log Off
              </button>
            </div>
          </div>
        </div>

        {pageError ? (
          <div className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {pageError}
          </div>
        ) : null}

        <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Orders Today
            </div>
            <div className="mt-3 text-3xl font-bold text-slate-900">{metrics.ordersToday}</div>
            <div className="mt-2 text-sm text-slate-500">Scheduled for today</div>
          </div>

          <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Completed Today
            </div>
            <div className="mt-3 text-3xl font-bold text-emerald-600">
              {metrics.completedToday}
            </div>
            <div className="mt-2 text-sm text-slate-500">Finished successfully</div>
          </div>

          <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Active Drivers
            </div>
            <div className="mt-3 text-3xl font-bold text-blue-600">
              {metrics.activeDrivers}
            </div>
            <div className="mt-2 text-sm text-slate-500">Available or busy</div>
          </div>

          <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Pending Orders
            </div>
            <div className="mt-3 text-3xl font-bold text-amber-600">
              {metrics.pendingOrders}
            </div>
            <div className="mt-2 text-sm text-slate-500">Open operational workload</div>
          </div>
        </div>

        <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <Link
            href="/order"
            className="group rounded-3xl bg-slate-900 p-5 shadow-sm ring-1 ring-slate-700 transition hover:-translate-y-1 hover:bg-blue-900 hover:ring-blue-600 hover:shadow-lg cursor-pointer"
          >
            <div className="text-lg font-bold text-white group-hover:text-blue-200">Orders</div>
            <div className="mt-2 text-sm text-slate-400 group-hover:text-blue-300">
              Create, edit, filter, and manage all operational orders
            </div>
          </Link>

          <Link
            href="/dispatch"
            className="group rounded-3xl bg-slate-900 p-5 shadow-sm ring-1 ring-slate-700 transition hover:-translate-y-1 hover:bg-emerald-900 hover:ring-emerald-600 hover:shadow-lg cursor-pointer"
          >
            <div className="text-lg font-bold text-white group-hover:text-emerald-200">Dispatch</div>
            <div className="mt-2 text-sm text-slate-400 group-hover:text-emerald-300">
              Assign drivers and manage today's live board
            </div>
          </Link>

          <Link
            href="/sale"
            className="group rounded-3xl bg-slate-900 p-5 shadow-sm ring-1 ring-slate-700 transition hover:-translate-y-1 hover:bg-teal-900 hover:ring-teal-600 hover:shadow-lg cursor-pointer"
          >
            <div className="text-lg font-bold text-white group-hover:text-teal-200">🧾 Quick Sale</div>
            <div className="mt-2 text-sm text-slate-400 group-hover:text-teal-300">
              Counter sales for walk-in customers with printed receipt
            </div>
          </Link>

          <Link
            href="/settings"
            className="group rounded-3xl bg-slate-900 p-5 shadow-sm ring-1 ring-slate-700 transition hover:-translate-y-1 hover:bg-violet-900 hover:ring-violet-600 hover:shadow-lg cursor-pointer"
          >
            <div className="text-lg font-bold text-white group-hover:text-violet-200">⚙ Settings</div>
            <div className="mt-2 text-sm text-slate-400 group-hover:text-violet-300">
              Manage drivers, trucks, bins, customers, and team members
            </div>
          </Link>

          <Link
            href="/reports"
            className="group rounded-3xl bg-slate-900 p-5 shadow-sm ring-1 ring-slate-700 transition hover:-translate-y-1 hover:bg-amber-900 hover:ring-amber-600 hover:shadow-lg cursor-pointer"
          >
            <div className="text-lg font-bold text-white group-hover:text-amber-200">📄 Statements & Performance</div>
            <div className="mt-2 text-sm text-slate-400 group-hover:text-amber-300">
              Generate customer statements and export billing history
            </div>
          </Link>
        </div>

        <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
              Delivery
            </div>
            <div className="mt-2 text-2xl font-bold text-emerald-900">
              {orderTypeSummary.delivery}
            </div>
          </div>

          <div className="rounded-3xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-amber-700">
              Exchange
            </div>
            <div className="mt-2 text-2xl font-bold text-amber-900">
              {orderTypeSummary.exchange}
            </div>
          </div>

          <div className="rounded-3xl border border-rose-200 bg-rose-50 p-5 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-rose-700">
              Removal
            </div>
            <div className="mt-2 text-2xl font-bold text-rose-900">
              {orderTypeSummary.removal}
            </div>
          </div>

          <div className="rounded-3xl border border-sky-200 bg-sky-50 p-5 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-sky-700">
              Dump Return
            </div>
            <div className="mt-2 text-2xl font-bold text-sky-900">
              {orderTypeSummary.dumpReturn}
            </div>
          </div>
        </div>

        <div className="grid gap-6">
          <div className="rounded-3xl bg-white shadow-sm ring-1 ring-slate-200">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
              <div>
                <h2 className="text-2xl font-bold text-slate-900">Recent Orders</h2>
                <p className="mt-1 text-sm text-slate-500">Latest activity across your operation</p>
              </div>
              <Link
                href="/order"
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                View All
              </Link>
            </div>

            {loading ? (
              <div className="p-10 text-center text-sm text-slate-500">Loading dashboard...</div>
            ) : recentOrders.length === 0 ? (
              <div className="p-10 text-center text-sm text-slate-500">No orders found.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                        Customer
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                        Job Site Address
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                        Service Time
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                        Driver
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                        Date
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {recentOrders.map((order) => {
                      const badgeClass =
                        statusClasses[order.status || 'unassigned'] || statusClasses.unassigned

                      const typeClass =
                        orderTypeClasses[order.order_type || 'DELIVERY'] ||
                        'bg-slate-100 text-slate-700 border-slate-200'

                      return (
                        <tr key={order.id} className="hover:bg-slate-50/80">
                          <td className="px-6 py-4">
                            <div className="font-semibold text-slate-900">
                              {order.customer_name || 'No customer'}
                            </div>
                            <div className="mt-1 flex flex-wrap gap-2">
                              <span
                                className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${typeClass}`}
                              >
                                {formatOrderType(order.order_type)}
                              </span>
                              <span className="text-xs text-slate-500">
                                {order.ticket_number || 'No ticket'}
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-700">
                            {order.service_address || order.pickup_address || '—'}
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-700">
                            {formatServiceTime(order.service_time)}
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-700">
                            {order.driver_id
                              ? driverMap[order.driver_id]?.name || 'Assigned'
                              : 'Unassigned'}
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-700">
                            {formatDate(order.scheduled_date)}
                          </td>
                          <td className="px-6 py-4">
                            <span
                              className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${badgeClass}`}
                            >
                              {formatStatus(order.status || 'unassigned')}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Report Modal */}
      {reportOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 pt-16">
          <div className="w-full max-w-4xl rounded-3xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
              <h2 className="text-xl font-bold text-slate-900">Customer Report</h2>
              <button
                onClick={() => setReportOpen(false)}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Close
              </button>
            </div>

            <div className="p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
                <div className="flex-1">
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Customer</label>
                  <select
                    value={reportCustomerId}
                    onChange={e => setReportCustomerId(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-500"
                  >
                    <option value="">Select a customer...</option>
                    {customers.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">From</label>
                  <input
                    type="date"
                    value={reportDateFrom}
                    onChange={e => setReportDateFrom(e.target.value)}
                    className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">To</label>
                  <input
                    type="date"
                    value={reportDateTo}
                    onChange={e => setReportDateTo(e.target.value)}
                    className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </div>
                <button
                  onClick={runReport}
                  disabled={!reportCustomerId || !reportDateFrom || !reportDateTo || reportLoading}
                  className="rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
                >
                  {reportLoading ? 'Loading...' : 'Generate'}
                </button>
              </div>

              {reportRows.length > 0 && (
                <div className="mt-6">
                  <div className="mb-4 flex items-center justify-between">
                    <p className="text-sm text-slate-600">
                      <span className="font-semibold">{reportRows.length}</span> orders for <span className="font-semibold">{reportCustomerName}</span> — {reportDateFrom} to {reportDateTo}
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={exportCSV}
                        className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-100"
                      >
                        Export Excel / CSV
                      </button>
                      <button
                        onClick={printReport}
                        className="rounded-xl border border-slate-300 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                      >
                        Print / PDF
                      </button>
                    </div>
                  </div>

                  <div className="overflow-x-auto rounded-2xl border border-slate-200">
                    <table className="min-w-full divide-y divide-slate-200">
                      <thead className="bg-slate-50">
                        <tr>
                          {['Ticket','Date','Type','Bin','Address','Status','Driver','Notes'].map(h => (
                            <th key={h} className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {reportRows.map(o => (
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
                            <td className="px-4 py-3 text-xs text-slate-600">{driverMap[o.driver_id || '']?.name || '—'}</td>
                            <td className="px-4 py-3 text-xs text-slate-600 max-w-xs truncate">{o.driver_notes || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {!reportLoading && reportRows.length === 0 && reportCustomerId && reportDateFrom && reportDateTo && (
                <p className="mt-6 text-center text-sm text-slate-500">No orders found for this customer in the selected date range.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}