'use client'

import Link from 'next/link'
import { Suspense, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Driver = {
  id: string
  name: string | null
  phone: string | null
  status: string | null
}

type Order = {
  id: string
  ticket_number: string | null
  customer_name: string | null
  pickup_address: string | null
  service_address?: string | null
  service_time?: string | null
  service_window?: string | null
  bin_id: string | number | null
  old_bin_id: string | number | null
  bin_size: string | number | null
  bin_type: string | null
  order_type: string | null
  scheduled_date: string | null
  driver_id: string | null
  route_position?: number | null
  status: string | null
  notes: string | null
  created_at: string | null
  updated_at: string | null
  completed_by?: string | null
  completed_at?: string | null
}

const TABLE_NAME = 'order'

const statusStyles: Record<string, string> = {
  unassigned: 'border-slate-200 bg-slate-50 text-slate-700',
  assigned: 'border-blue-200 bg-blue-50 text-blue-700',
  in_progress: 'border-amber-200 bg-amber-50 text-amber-700',
  completed: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  issue: 'border-rose-200 bg-rose-50 text-rose-700',
}

function formatStatus(status: string | null | undefined) {
  if (!status) return 'Unassigned'
  if (status === 'in_progress') return 'In Progress'
  return status
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

function formatDate(dateValue: string | null | undefined) {
  if (!dateValue) return '—'
  const date = new Date(dateValue)
  if (Number.isNaN(date.getTime())) return String(dateValue)
  return date.toLocaleDateString()
}

function displayValue(value: unknown) {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'string') {
    return value.trim() ? value : '—'
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function getOrderAddress(order: Order) {
  return order.service_address || order.pickup_address || ''
}

function buildGoogleMapsLink(orders: Order[]) {
  const addresses = orders
    .map((order) => getOrderAddress(order))
    .filter((value): value is string => Boolean(value && value.trim()))

  if (addresses.length === 0) return ''

  if (addresses.length === 1) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addresses[0])}`
  }

  const origin = addresses[0]
  const destination = addresses[addresses.length - 1]
  const waypoints = addresses.slice(1, -1)

  const params = new URLSearchParams({
    api: '1',
    origin,
    destination,
    travelmode: 'driving',
  })

  if (waypoints.length > 0) {
    params.set('waypoints', waypoints.join('|'))
  }

  return `https://www.google.com/maps/dir/?${params.toString()}`
}

function DriverAppContent() {
  const supabase = useMemo(() => createClient(), [])
  const searchParams = useSearchParams()
  const driverId = searchParams.get('driverId') || ''

  const [driver, setDriver] = useState<Driver | null>(null)
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [pageError, setPageError] = useState('')
  const [copied, setCopied] = useState(false)
  const [savingOrderId, setSavingOrderId] = useState<string | null>(null)
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null)

  async function loadPage() {
    if (!driverId) {
      setPageError('Missing driverId in URL.')
      setLoading(false)
      return
    }

    setPageError('')
    setLoading(true)

    const [{ data: driverData, error: driverError }, { data: orderData, error: ordersError }] =
      await Promise.all([
        supabase.from('drivers').select('id,name,phone,status').eq('id', driverId).single(),
        supabase
          .from(TABLE_NAME)
          .select(
            'id,ticket_number,customer_name,pickup_address,service_address,service_time,service_window,bin_id,old_bin_id,bin_size,bin_type,order_type,scheduled_date,driver_id,route_position,status,notes,created_at,updated_at,completed_by,completed_at'
          )
          .eq('driver_id', driverId)
          .order('route_position', { ascending: true })
          .order('scheduled_date', { ascending: true })
          .order('created_at', { ascending: true }),
      ])

    if (driverError) {
      setPageError(driverError.message)
      setLoading(false)
      return
    }

    if (ordersError) {
      setPageError(ordersError.message)
      setLoading(false)
      return
    }

    setDriver((driverData as Driver) || null)
    setOrders((orderData as Order[]) || [])
    setLoading(false)
  }

  useEffect(() => {
    void loadPage()

    const channel = supabase
      .channel(`driver-app-${driverId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: TABLE_NAME },
        async () => {
          await loadPage()
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'drivers' },
        async () => {
          await loadPage()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase, driverId])

  const routeLink = useMemo(() => buildGoogleMapsLink(orders), [orders])

  const stats = useMemo(() => {
    const total = orders.length
    const completed = orders.filter((order) => order.status === 'completed').length
    const issues = orders.filter((order) => order.status === 'issue').length
    const inProgress = orders.filter((order) => order.status === 'in_progress').length
    const remaining = orders.filter((order) => order.status !== 'completed').length

    return { total, completed, issues, inProgress, remaining }
  }, [orders])

  const currentStopId = useMemo(() => {
    const firstInProgress = orders.find((order) => order.status === 'in_progress')
    if (firstInProgress) return firstInProgress.id

    const firstAssigned = orders.find((order) => order.status === 'assigned')
    if (firstAssigned) return firstAssigned.id

    const firstIssue = orders.find((order) => order.status === 'issue')
    if (firstIssue) return firstIssue.id

    return null
  }, [orders])

  async function updateOrderStatus(orderId: string, nextStatus: string) {
    setSavingOrderId(orderId)
    setPageError('')

    const payload: Record<string, unknown> = {
      status: nextStatus,
    }

    if (nextStatus === 'completed') {
      payload.completed_at = new Date().toISOString()
      payload.completed_by = driver?.name || 'Driver'
    }

    if (nextStatus !== 'completed') {
      payload.completed_at = null
      payload.completed_by = null
    }

    const { error } = await supabase.from(TABLE_NAME).update(payload).eq('id', orderId)

    if (error) {
      setPageError(error.message)
      setSavingOrderId(null)
      return
    }

    setOrders((current) =>
      current.map((order) =>
        order.id === orderId
          ? {
              ...order,
              status: nextStatus,
              completed_at: nextStatus === 'completed' ? String(payload.completed_at) : null,
              completed_by: nextStatus === 'completed' ? String(payload.completed_by) : null,
            }
          : order
      )
    )

    setSavingOrderId(null)
  }

  async function copyPageLink() {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setPageError('Could not copy page link.')
    }
  }

  function toggleExpanded(orderId: string) {
    setExpandedOrderId((current) => (current === orderId ? null : orderId))
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="mx-auto max-w-6xl p-4 md:p-6">
        <div className="mb-6 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                Driver App
              </div>
              <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
                {driver?.name || 'Driver'}
              </h1>
              <p className="mt-2 text-sm text-slate-500">
                Live route connected to dispatch
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={loadPage}
                className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Refresh
              </button>

              <button
                type="button"
                onClick={copyPageLink}
                className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                {copied ? 'Copied!' : 'Copy Link'}
              </button>

              {routeLink ? (
                <a
                  href={routeLink}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
                >
                  Open Full Route
                </a>
              ) : null}
            </div>
          </div>

          {pageError ? (
            <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {pageError}
            </div>
          ) : null}

          <div className="mt-6 grid gap-4 md:grid-cols-5">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Total Stops
              </div>
              <div className="mt-2 text-2xl font-bold text-slate-900">{stats.total}</div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Remaining
              </div>
              <div className="mt-2 text-2xl font-bold text-slate-900">{stats.remaining}</div>
            </div>

            <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
              <div className="text-xs font-medium uppercase tracking-wide text-blue-700">
                In Progress
              </div>
              <div className="mt-2 text-2xl font-bold text-blue-900">{stats.inProgress}</div>
            </div>

            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <div className="text-xs font-medium uppercase tracking-wide text-emerald-700">
                Completed
              </div>
              <div className="mt-2 text-2xl font-bold text-emerald-900">{stats.completed}</div>
            </div>

            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
              <div className="text-xs font-medium uppercase tracking-wide text-rose-700">
                Issues
              </div>
              <div className="mt-2 text-2xl font-bold text-rose-900">{stats.issues}</div>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="rounded-3xl bg-white p-10 text-center text-sm text-slate-500 shadow-sm ring-1 ring-slate-200">
            Loading driver app...
          </div>
        ) : orders.length === 0 ? (
          <div className="rounded-3xl bg-white p-10 text-center text-sm text-slate-500 shadow-sm ring-1 ring-slate-200">
            No assigned orders for this driver.
          </div>
        ) : (
          <div className="space-y-4">
            {orders.map((order, index) => {
              const isCurrentStop = currentStopId === order.id
              const isExpanded = expandedOrderId === order.id
              const isSaving = savingOrderId === order.id
              const stopAddress = getOrderAddress(order)

              return (
                <div
                  key={order.id}
                  className={`rounded-3xl bg-white p-5 shadow-sm ring-1 ${
                    isCurrentStop ? 'ring-blue-300' : 'ring-slate-200'
                  }`}
                >
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-700">
                          Stop {order.route_position || index + 1}
                        </span>

                        {isCurrentStop ? (
                          <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
                            Current Stop
                          </span>
                        ) : null}

                        <span
                          className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                            statusStyles[order.status || 'unassigned'] || statusStyles.unassigned
                          }`}
                        >
                          {formatStatus(order.status || 'unassigned')}
                        </span>
                      </div>

                      <h2 className="mt-3 text-lg font-bold text-slate-900">
                        {order.customer_name || 'No customer'}
                      </h2>

                      <div className="mt-1 text-sm text-slate-500">
                        {order.ticket_number || `#${order.id.slice(0, 8)}`}
                      </div>

                      <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Service Address
                          </div>
                          <div className="mt-2 text-sm text-slate-900">
                            {displayValue(order.service_address)}
                          </div>
                        </div>

                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Pickup Address
                          </div>
                          <div className="mt-2 text-sm text-slate-900">
                            {displayValue(order.pickup_address)}
                          </div>
                        </div>

                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Service Window
                          </div>
                          <div className="mt-2 text-sm text-slate-900">
                            {displayValue(order.service_window || order.service_time)}
                          </div>
                        </div>

                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Scheduled Date
                          </div>
                          <div className="mt-2 text-sm text-slate-900">
                            {formatDate(order.scheduled_date)}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="w-full shrink-0 md:w-[260px]">
                      <div className="grid gap-2">
                        {stopAddress ? (
                          <a
                            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(stopAddress)}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                          >
                            Open This Stop
                          </a>
                        ) : null}

                        <button
                          type="button"
                          onClick={() => updateOrderStatus(order.id, 'in_progress')}
                          disabled={isSaving || order.status === 'completed'}
                          className="inline-flex items-center justify-center rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {isSaving ? 'Saving...' : 'Start Stop'}
                        </button>

                        <button
                          type="button"
                          onClick={() => updateOrderStatus(order.id, 'completed')}
                          disabled={isSaving || order.status === 'completed'}
                          className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {isSaving ? 'Saving...' : 'Mark Completed'}
                        </button>

                        <button
                          type="button"
                          onClick={() => updateOrderStatus(order.id, 'issue')}
                          disabled={isSaving || order.status === 'completed'}
                          className="inline-flex items-center justify-center rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {isSaving ? 'Saving...' : 'Report Issue'}
                        </button>

                        <button
                          type="button"
                          onClick={() => toggleExpanded(order.id)}
                          className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                        >
                          {isExpanded ? 'Hide Details' : 'Show Details'}
                        </button>
                      </div>
                    </div>
                  </div>

                  {isExpanded ? (
                    <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Order Type
                        </div>
                        <div className="mt-2 text-sm text-slate-900">
                          {displayValue(order.order_type)}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Bin Size
                        </div>
                        <div className="mt-2 text-sm text-slate-900">
                          {displayValue(order.bin_size)}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Bin Type
                        </div>
                        <div className="mt-2 text-sm text-slate-900">
                          {displayValue(order.bin_type)}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Bin ID
                        </div>
                        <div className="mt-2 text-sm text-slate-900">
                          {displayValue(order.bin_id)}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Old Bin ID
                        </div>
                        <div className="mt-2 text-sm text-slate-900">
                          {displayValue(order.old_bin_id)}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Route Position
                        </div>
                        <div className="mt-2 text-sm text-slate-900">
                          {displayValue(order.route_position)}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Completed By
                        </div>
                        <div className="mt-2 text-sm text-slate-900">
                          {displayValue(order.completed_by)}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Completed At
                        </div>
                        <div className="mt-2 text-sm text-slate-900">
                          {displayValue(order.completed_at)}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 md:col-span-2 xl:col-span-4">
                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Notes
                        </div>
                        <div className="mt-2 whitespace-pre-wrap text-sm text-slate-900">
                          {displayValue(order.notes)}
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        )}

        <div className="mt-6 flex justify-center">
          <Link
            href="/dispatch"
            className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            Back to Dispatch
          </Link>
        </div>
      </div>
    </div>
  )
}

export default function DriverAppPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-100">
          <div className="mx-auto max-w-6xl p-4 md:p-6">
            <div className="rounded-3xl bg-white p-10 text-center text-sm text-slate-500 shadow-sm ring-1 ring-slate-200">
              Loading driver app...
            </div>
          </div>
        </div>
      }
    >
      <DriverAppContent />
    </Suspense>
  )
}