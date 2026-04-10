'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

type Order = {
  id: string
  ticket_number: string | null
  customer_name: string | null
  pickup_address: string | null
  service_address?: string | null
  service_time?: string | null
  service_window?: string | null
  bin_type: string | null
  bin_size: string | null
  order_type: string | null
  driver_id: string | null
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

function getWindowPriority(windowValue: string | null | undefined) {
  if (!windowValue) return 999

  const normalized = windowValue.trim().toLowerCase()

  if (normalized === '7:00 am - 9:00 am') return 1
  if (normalized === '8:00 am - 12:00 pm') return 2
  if (normalized === '9:00 am - 1:00 pm') return 3
  if (normalized === '12:00 pm - 4:00 pm') return 4
  if (normalized === '1:00 pm - 5:00 pm') return 5
  if (normalized === 'after 5:00 pm') return 6
  if (normalized === 'anytime') return 7

  return 50
}

function getServiceTimeMinutes(value: string | null | undefined) {
  if (!value) return null
  const [hourStr, minuteStr] = value.split(':')
  const hour = Number(hourStr)
  const minute = Number(minuteStr)

  if (Number.isNaN(hour) || Number.isNaN(minute)) return null
  return hour * 60 + minute
}

function compareOperationalOrder(a: Order, b: Order) {
  const aDay = a.scheduled_date ? new Date(a.scheduled_date).getTime() : Number.MAX_SAFE_INTEGER
  const bDay = b.scheduled_date ? new Date(b.scheduled_date).getTime() : Number.MAX_SAFE_INTEGER

  if (aDay !== bDay) return aDay - bDay

  const aTime = getServiceTimeMinutes(a.service_time)
  const bTime = getServiceTimeMinutes(b.service_time)

  if (aTime !== null && bTime !== null && aTime !== bTime) {
    return aTime - bTime
  }

  if (aTime !== null && bTime === null) return -1
  if (aTime === null && bTime !== null) return 1

  const aWindow = getWindowPriority(a.service_window)
  const bWindow = getWindowPriority(b.service_window)

  if (aWindow !== bWindow) return aWindow - bWindow

  const aCreated = a.created_at ? new Date(a.created_at).getTime() : 0
  const bCreated = b.created_at ? new Date(b.created_at).getTime() : 0

  return bCreated - aCreated
}

export default function DashboardPage() {
  const supabase = createClient()

  const [orders, setOrders] = useState<Order[]>([])
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [bins, setBins] = useState<Bin[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [pageError, setPageError] = useState('')

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

  const upcomingOrders = useMemo(() => {
    return orders
      .filter(
        (order) =>
          (order.status || 'unassigned') !== 'completed' &&
          (order.status || 'unassigned') !== 'issue'
      )
      .sort(compareOperationalOrder)
      .slice(0, 6)
  }, [orders])

  const driverOverview = useMemo(() => {
    const assignedCounts: Record<string, number> = {}

    for (const order of orders) {
      if (!order.driver_id) continue
      if (order.status === 'assigned' || order.status === 'in_progress') {
        assignedCounts[order.driver_id] = (assignedCounts[order.driver_id] || 0) + 1
      }
    }

    return drivers.slice(0, 6).map((driver) => ({
      ...driver,
      activeOrders: assignedCounts[driver.id] || 0,
    }))
  }, [drivers, orders])

  const binOverview = useMemo(() => {
    const available = bins.filter((bin) => (bin.status || 'available') === 'available').length
    const inUse = bins.filter((bin) => bin.status === 'in_use').length
    const maintenance = bins.filter((bin) => bin.status === 'maintenance').length

    return { available, inUse, maintenance }
  }, [bins])

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
            <div>
              <h1 className="text-3xl font-bold tracking-tight">SIMPLIITRASH Dashboard</h1>
              <p className="mt-2 text-sm text-slate-300">
                Professional operations overview for dispatch, orders, drivers, bins, and active customers
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/dispatch"
                className="rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-100"
              >
                Open Dispatch Board
              </Link>
              <Link
                href="/order"
                className="rounded-2xl border border-slate-500 bg-slate-800 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-700"
              >
                Open Orders
              </Link>
              <button
                onClick={loadDashboard}
                className="rounded-2xl border border-slate-600 bg-slate-800 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-700"
              >
                Refresh
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

        <div className="mb-6 grid gap-4 md:grid-cols-3">
          <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Active Customers
                </div>
                <div className="mt-2 text-2xl font-bold text-slate-900">
                  {metrics.totalCustomers}
                </div>
              </div>
              <Link
                href="/customers"
                className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:opacity-90"
              >
                View
              </Link>
            </div>
          </div>

          <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Total Bins
                </div>
                <div className="mt-2 text-2xl font-bold text-slate-900">
                  {metrics.totalBins}
                </div>
              </div>
              <Link
                href="/bins"
                className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:opacity-90"
              >
                View
              </Link>
            </div>
          </div>

          <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Drivers
                </div>
                <div className="mt-2 text-2xl font-bold text-slate-900">
                  {metrics.totalDrivers}
                </div>
              </div>
              <Link
                href="/drivers"
                className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:opacity-90"
              >
                View
              </Link>
            </div>
          </div>
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

        <div className="grid gap-6 xl:grid-cols-3">
          <div className="xl:col-span-2 rounded-3xl bg-white shadow-sm ring-1 ring-slate-200">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Recent Orders</h2>
                <p className="text-sm text-slate-500">Latest activity across your operation</p>
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
                        Window
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
                            {order.service_window || '—'}
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

          <div className="space-y-6">
            <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Upcoming Orders</h2>
                  <p className="text-sm text-slate-500">Next orders to monitor</p>
                </div>
                <Link
                  href="/dispatch"
                  className="text-sm font-semibold text-slate-700 hover:text-slate-900"
                >
                  Open
                </Link>
              </div>

              <div className="space-y-3">
                {upcomingOrders.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                    No upcoming orders.
                  </div>
                ) : (
                  upcomingOrders.map((order) => {
                    const badgeClass =
                      statusClasses[order.status || 'unassigned'] || statusClasses.unassigned

                    return (
                      <div
                        key={order.id}
                        className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="font-semibold text-slate-900">
                              {order.customer_name || 'No customer'}
                            </div>
                            <div className="mt-1 text-sm text-slate-500">
                              {order.service_address || order.pickup_address || 'No address'}
                            </div>
                          </div>
                          <span
                            className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${badgeClass}`}
                          >
                            {formatStatus(order.status || 'unassigned')}
                          </span>
                        </div>

                        <div className="mt-3 space-y-1 text-sm text-slate-600">
                          <div>
                            <span className="font-medium text-slate-800">Date:</span>{' '}
                            {formatDate(order.scheduled_date)}
                          </div>
                          <div>
                            <span className="font-medium text-slate-800">Service Time:</span>{' '}
                            {formatServiceTime(order.service_time)}
                          </div>
                          <div>
                            <span className="font-medium text-slate-800">Window:</span>{' '}
                            {order.service_window || '—'}
                          </div>
                        </div>

                        <div className="mt-3 flex items-center justify-between gap-3">
                          <div className="text-xs text-slate-500">
                            {formatOrderType(order.order_type)}
                          </div>
                          <div className="text-xs text-slate-500">
                            {order.driver_id
                              ? driverMap[order.driver_id]?.name || 'Assigned'
                              : 'Unassigned'}
                          </div>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>

            <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
              <h2 className="text-lg font-bold text-slate-900">Driver Overview</h2>
              <p className="mt-1 text-sm text-slate-500">Quick live availability snapshot</p>

              <div className="mt-4 space-y-3">
                {driverOverview.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                    No drivers found.
                  </div>
                ) : (
                  driverOverview.map((driver) => {
                    const badgeClass =
                      driver.status === 'busy'
                        ? 'bg-amber-100 text-amber-700 border-amber-200'
                        : driver.status === 'offline'
                          ? 'bg-slate-100 text-slate-700 border-slate-200'
                          : 'bg-emerald-100 text-emerald-700 border-emerald-200'

                    return (
                      <div
                        key={driver.id}
                        className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 p-4"
                      >
                        <div>
                          <div className="font-semibold text-slate-900">
                            {driver.name || 'Unnamed Driver'}
                          </div>
                          <div className="mt-1 text-sm text-slate-500">
                            Active orders: {driver.activeOrders}
                          </div>
                        </div>
                        <span
                          className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${badgeClass}`}
                        >
                          {formatStatus(driver.status || 'available')}
                        </span>
                      </div>
                    )
                  })
                )}
              </div>
            </div>

            <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
              <h2 className="text-lg font-bold text-slate-900">Bin Overview</h2>
              <p className="mt-1 text-sm text-slate-500">Inventory health at a glance</p>

              <div className="mt-4 grid gap-3">
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                    Available In Yard
                  </div>
                  <div className="mt-2 text-2xl font-bold text-emerald-900">
                    {binOverview.available}
                  </div>
                </div>

                <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-blue-700">
                    In Use
                  </div>
                  <div className="mt-2 text-2xl font-bold text-blue-900">
                    {binOverview.inUse}
                  </div>
                </div>

                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                    Maintenance
                  </div>
                  <div className="mt-2 text-2xl font-bold text-amber-900">
                    {binOverview.maintenance}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-4">
          <Link
            href="/order"
            className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200 transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <div className="text-lg font-bold text-slate-900">Orders</div>
            <div className="mt-2 text-sm text-slate-500">
              Create, edit, filter, and manage all operational orders
            </div>
          </Link>

          <Link
            href="/drivers"
            className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200 transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <div className="text-lg font-bold text-slate-900">Drivers</div>
            <div className="mt-2 text-sm text-slate-500">
              Track driver availability, workload, and contact details
            </div>
          </Link>

          <Link
            href="/bins"
            className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200 transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <div className="text-lg font-bold text-slate-900">Bins</div>
            <div className="mt-2 text-sm text-slate-500">
              Manage inventory, stock status, and yard availability
            </div>
          </Link>

          <Link
            href="/customers"
            className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200 transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <div className="text-lg font-bold text-slate-900">Customers</div>
            <div className="mt-2 text-sm text-slate-500">
              Keep organized active customer records connected to your orders
            </div>
          </Link>
        </div>
      </div>
    </div>
  )
}