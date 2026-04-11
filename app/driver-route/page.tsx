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

function buildGoogleMapsLink(orders: Order[]) {
  const addresses = orders
    .map((order) => order.service_address || order.pickup_address)
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

function DriverRoutePageContent() {
  const supabase = useMemo(() => createClient(), [])
  const searchParams = useSearchParams()
  const driverId = searchParams.get('driverId') || ''

  const [driver, setDriver] = useState<Driver | null>(null)
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [pageError, setPageError] = useState('')
  const [copied, setCopied] = useState(false)

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
          .from('order')
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
      .channel(`driver-route-${driverId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'order' },
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

  async function copyPageLink() {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setPageError('Could not copy page link.')
    }
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="mx-auto max-w-6xl p-4 md:p-6">
        <div className="mb-6 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                Driver Route
              </div>
              <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
                {driver?.name || 'Driver'}
              </h1>
              <p className="mt-2 text-sm text-slate-500">
                Route ordered by database route_position
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
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
                  Open Route
                </a>
              ) : null}

              <Link
                href="/dispatch"
                className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Back to Dispatch
              </Link>
            </div>
          </div>

          {pageError ? (
            <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {pageError}
            </div>
          ) : null}
        </div>

        {loading ? (
          <div className="rounded-3xl bg-white p-10 text-center text-sm text-slate-500 shadow-sm ring-1 ring-slate-200">
            Loading route...
          </div>
        ) : (
          <div className="space-y-4">
            {orders.length === 0 ? (
              <div className="rounded-3xl bg-white p-10 text-center text-sm text-slate-500 shadow-sm ring-1 ring-slate-200">
                No assigned orders for this driver.
              </div>
            ) : (
              orders.map((order, index) => (
                <div
                  key={order.id}
                  className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200"
                >
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                        Stop {order.route_position || index + 1}
                      </div>
                      <h2 className="mt-2 text-lg font-bold text-slate-900">
                        {order.customer_name || 'No customer'}
                      </h2>
                      <div className="mt-1 text-sm text-slate-500">
                        {order.ticket_number || `#${order.id.slice(0, 8)}`}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
                        {formatStatus(order.status)}
                      </span>
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
                        {order.order_type || '—'}
                      </span>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Service Address
                      </div>
                      <div className="mt-2 text-sm text-slate-900">
                        {order.service_address || '—'}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Pickup Address
                      </div>
                      <div className="mt-2 text-sm text-slate-900">
                        {order.pickup_address || '—'}
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

                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Service Window
                      </div>
                      <div className="mt-2 text-sm text-slate-900">
                        {order.service_window || order.service_time || '—'}
                      </div>
                    </div>
                  </div>

                  {order.notes ? (
                    <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Notes
                      </div>
                      <div className="mt-2 whitespace-pre-wrap text-sm text-slate-900">
                        {order.notes}
                      </div>
                    </div>
                  ) : null}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default function DriverRoutePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-100">
          <div className="mx-auto max-w-6xl p-4 md:p-6">
            <div className="rounded-3xl bg-white p-10 text-center text-sm text-slate-500 shadow-sm ring-1 ring-slate-200">
              Loading route...
            </div>
          </div>
        </div>
      }
    >
      <DriverRoutePageContent />
    </Suspense>
  )
}