'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Driver = {
  id: string
  name: string | null
  email?: string | null
  phone: string | null
  status: string | null
  auth_user_id?: string | null
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

type QueuedAction = {
  id: string
  orderId: string
  nextStatus: string
  completedAt: string | null
  completedBy: string | null
  createdAt: string
}

type SyncState = 'idle' | 'pending' | 'error'

const TABLE_NAME = 'order'
const CACHED_ORDERS_KEY = 'driver_cached_orders'
const QUEUED_ACTIONS_KEY = 'driver_queued_actions'

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

function readQueuedActions(): QueuedAction[] {
  if (typeof window === 'undefined') return []

  const raw = window.localStorage.getItem(QUEUED_ACTIONS_KEY)
  if (!raw) return []

  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as QueuedAction[]) : []
  } catch {
    return []
  }
}

function writeQueuedActions(actions: QueuedAction[]) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(QUEUED_ACTIONS_KEY, JSON.stringify(actions))
}

function writeCachedOrders(orders: Order[]) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(CACHED_ORDERS_KEY, JSON.stringify(orders))
}

function readCachedOrders(): Order[] {
  if (typeof window === 'undefined') return []

  const raw = window.localStorage.getItem(CACHED_ORDERS_KEY)
  if (!raw) return []

  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as Order[]) : []
  } catch {
    return []
  }
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }

  return outputArray
}

export default function DriverPage() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js')
    }
  }, [])

  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  const [driver, setDriver] = useState<Driver | null>(null)
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [pageError, setPageError] = useState('')
  const [savingOrderId, setSavingOrderId] = useState<string | null>(null)
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null)
  const [showSplash, setShowSplash] = useState(true)
  const [isOffline, setIsOffline] = useState(false)
  const [usingCachedOrders, setUsingCachedOrders] = useState(false)
  const [syncingQueue, setSyncingQueue] = useState(false)
  const [queuedActions, setQueuedActions] = useState<QueuedAction[]>([])
  const [syncStates, setSyncStates] = useState<Record<string, SyncState>>({})
  const [notificationsEnabled, setNotificationsEnabled] = useState(false)
  const [notificationsLoading, setNotificationsLoading] = useState(false)

  function persistOrders(nextOrders: Order[]) {
    setOrders(nextOrders)
    writeCachedOrders(nextOrders)
  }

  function markOrderSyncState(orderId: string, state: SyncState) {
    setSyncStates((current) => ({
      ...current,
      [orderId]: state,
    }))
  }

  function clearOrderSyncState(orderId: string) {
    setSyncStates((current) => {
      const next = { ...current }
      delete next[orderId]
      return next
    })
  }

  function updateLocalOrderStatus(orderId: string, nextStatus: string) {
    const completedAt = nextStatus === 'completed' ? new Date().toISOString() : null
    const completedBy = nextStatus === 'completed' ? driver?.name || 'Driver' : null

    if (nextStatus === 'completed') {
      const filtered = orders.filter((order) => order.id !== orderId)
      persistOrders(filtered)
      return { completedAt, completedBy }
    }

    const updated = orders.map((order) =>
      order.id === orderId
        ? {
            ...order,
            status: nextStatus,
            completed_at: completedAt,
            completed_by: completedBy,
          }
        : order
    )

    persistOrders(updated)
    return { completedAt, completedBy }
  }

  function queueOrderAction(orderId: string, nextStatus: string, completedAt: string | null, completedBy: string | null) {
    const action: QueuedAction = {
      id: `${orderId}-${Date.now()}`,
      orderId,
      nextStatus,
      completedAt,
      completedBy,
      createdAt: new Date().toISOString(),
    }

    const current = readQueuedActions().filter((item) => item.orderId !== orderId)
    const next = [...current, action]

    writeQueuedActions(next)
    setQueuedActions(next)
    markOrderSyncState(orderId, 'pending')
  }

  async function resolveDriver() {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      router.push('/login')
      return null
    }

    const { data: driverByAuth, error: driverByAuthError } = await supabase
      .from('drivers')
      .select('id,name,email,phone,status,auth_user_id')
      .eq('auth_user_id', user.id)
      .maybeSingle()

    if (driverByAuthError) {
      setPageError(driverByAuthError.message)
      return null
    }

    if (driverByAuth) {
      return driverByAuth as Driver
    }

    const normalizedEmail = (user.email || '').trim().toLowerCase()

    if (!normalizedEmail) {
      setPageError('This account is not linked to a driver profile.')
      return null
    }

    const { data: driverByEmail, error: driverByEmailError } = await supabase
      .from('drivers')
      .select('id,name,email,phone,status,auth_user_id')
      .ilike('email', normalizedEmail)
      .maybeSingle()

    if (driverByEmailError) {
      setPageError(driverByEmailError.message)
      return null
    }

    if (!driverByEmail) {
      setPageError('This account is not linked to a driver profile.')
      return null
    }

    const { error: linkError } = await supabase
      .from('drivers')
      .update({
        auth_user_id: user.id,
        last_login_at: new Date().toISOString(),
      })
      .eq('id', driverByEmail.id)

    if (linkError) {
      setPageError(linkError.message)
      return null
    }

    return {
      ...driverByEmail,
      auth_user_id: user.id,
    } as Driver
  }

  async function loadPage() {
    setPageError('')
    setLoading(true)

    const resolvedDriver = await resolveDriver()

    if (!resolvedDriver) {
      setLoading(false)
      return
    }

    setDriver(resolvedDriver)

    const { data: orderData, error: ordersError } = await supabase
      .from(TABLE_NAME)
      .select(
        'id,ticket_number,customer_name,pickup_address,service_address,service_time,service_window,bin_id,old_bin_id,bin_size,bin_type,order_type,scheduled_date,driver_id,route_position,status,notes,created_at,updated_at,completed_by,completed_at'
      )
      .eq('driver_id', resolvedDriver.id)
      .neq('status', 'completed')
      .order('route_position', { ascending: true })
      .order('scheduled_date', { ascending: true })
      .order('created_at', { ascending: true })

    if (ordersError) {
      const cachedOrders = readCachedOrders()

      if (cachedOrders.length > 0) {
        persistOrders(cachedOrders)
        setUsingCachedOrders(true)
        setPageError('')
        setLoading(false)
        return
      }

      setPageError(ordersError.message)
      setLoading(false)
      return
    }

    const nextOrders = (orderData as Order[]) || []
    persistOrders(nextOrders)
    setUsingCachedOrders(false)
    setLoading(false)
  }

  async function flushQueuedActions() {
    if (syncingQueue || typeof window === 'undefined') return
    if (!navigator.onLine) return

    const pending = readQueuedActions()
    if (pending.length === 0) {
      setQueuedActions([])
      return
    }

    setSyncingQueue(true)
    let remaining = [...pending]

    for (const action of pending) {
      try {
        const payload: Record<string, unknown> = {
          status: action.nextStatus,
          completed_at: action.nextStatus === 'completed' ? action.completedAt : null,
          completed_by: action.nextStatus === 'completed' ? action.completedBy : null,
        }

        const { error } = await supabase.from(TABLE_NAME).update(payload).eq('id', action.orderId)

        if (error) {
          markOrderSyncState(action.orderId, 'error')
          continue
        }

        remaining = remaining.filter((item) => item.id !== action.id)
        writeQueuedActions(remaining)
        setQueuedActions(remaining)
        clearOrderSyncState(action.orderId)
      } catch {
        markOrderSyncState(action.orderId, 'error')
      }
    }

    setSyncingQueue(false)

    const stillPending = readQueuedActions()
    if (stillPending.length === 0) {
      await loadPage()
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  async function checkNotificationStatus() {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      return
    }

    try {
      await navigator.serviceWorker.ready
    } catch {
      return
    }
  }

  async function handleEnableNotifications() {
    if (!driver) return
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setPageError('Push notifications are not supported on this device/browser.')
      return
    }

    const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
    if (!vapidPublicKey) {
      setPageError('Missing NEXT_PUBLIC_VAPID_PUBLIC_KEY.')
      return
    }

    try {
      setNotificationsLoading(true)
      setPageError('')
      setNotificationsEnabled(false)

      const permission = await Notification.requestPermission()

      if (permission !== 'granted') {
        setPageError('Notification permission was not granted.')
        setNotificationsLoading(false)
        return
      }

      const registration = await navigator.serviceWorker.ready

      let subscription = await registration.pushManager.getSubscription()

      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
        })
      }

      const raw = subscription.toJSON()

      if (!raw || !raw.endpoint || !raw.keys) {
        setPageError('Invalid subscription payload.')
        setNotificationsLoading(false)
        return
      }

      const { p256dh, auth } = raw.keys

      if (!p256dh || !auth) {
        setPageError('Invalid subscription keys.')
        setNotificationsLoading(false)
        return
      }

      const response = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          driverId: driver.id,
          endpoint: raw.endpoint,
          p256dh,
          auth,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        console.error('subscribe error', result)
        setPageError(
          result.debug
            ? `${result.error} ${JSON.stringify(result.debug)}`
            : result.error || 'Failed to save notification subscription.'
        )
        setNotificationsEnabled(false)
        setNotificationsLoading(false)
        return
      }

      setNotificationsEnabled(true)
      setNotificationsLoading(false)
    } catch (error) {
      setPageError(error instanceof Error ? error.message : 'Failed to enable notifications.')
      setNotificationsEnabled(false)
      setNotificationsLoading(false)
    }
  }

  async function handleSendTestNotification() {
    if (!driver) return

    try {
      setPageError('')

      const response = await fetch('/api/push/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ driverId: driver.id }),
      })

      const result = await response.json()

      if (!response.ok) {
        setPageError(result.error || 'Failed to send test notification.')
        return
      }
    } catch (error) {
      setPageError(error instanceof Error ? error.message : 'Failed to send test notification.')
    }
  }

  useEffect(() => {
    setQueuedActions(readQueuedActions())
  }, [])

  useEffect(() => {
    void loadPage()
    void checkNotificationStatus()

    const channel = supabase
      .channel('driver-page-realtime')
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
  }, [supabase])

  useEffect(() => {
    const interval = window.setInterval(() => {
      void loadPage()
      void flushQueuedActions()
      void checkNotificationStatus()
    }, 300000)

    return () => {
      window.clearInterval(interval)
    }
  }, [syncingQueue, orders])

  useEffect(() => {
    if (!loading) {
      const timer = window.setTimeout(() => {
        setShowSplash(false)
      }, 900)

      return () => window.clearTimeout(timer)
    }

    setShowSplash(true)
  }, [loading])

  useEffect(() => {
    const updateOnlineStatus = async () => {
      const offline = !navigator.onLine
      setIsOffline(offline)

      if (!offline) {
        await flushQueuedActions()
      }
    }

    void updateOnlineStatus()

    window.addEventListener('online', updateOnlineStatus)
    window.addEventListener('offline', updateOnlineStatus)

    return () => {
      window.removeEventListener('online', updateOnlineStatus)
      window.removeEventListener('offline', updateOnlineStatus)
    }
  }, [syncingQueue])

  const routeLink = useMemo(() => buildGoogleMapsLink(orders), [orders])

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

    const { completedAt, completedBy } = updateLocalOrderStatus(orderId, nextStatus)

    if (isOffline) {
      queueOrderAction(orderId, nextStatus, completedAt, completedBy)
      setSavingOrderId(null)
      return
    }

    const payload: Record<string, unknown> = {
      status: nextStatus,
      completed_at: nextStatus === 'completed' ? completedAt : null,
      completed_by: nextStatus === 'completed' ? completedBy : null,
    }

    const { error } = await supabase.from(TABLE_NAME).update(payload).eq('id', orderId)

    if (error) {
      queueOrderAction(orderId, nextStatus, completedAt, completedBy)
      setPageError('Connection issue: saved locally and will sync automatically.')
      setSavingOrderId(null)
      return
    }

    clearOrderSyncState(orderId)
    setSavingOrderId(null)
  }

  function toggleExpanded(orderId: string) {
    setExpandedOrderId((current) => (current === orderId ? null : orderId))
  }

  function getOrderSyncBadge(orderId: string) {
    const state = syncStates[orderId]
    if (state === 'pending') {
      return (
        <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700">
          Pending Sync
        </span>
      )
    }

    if (state === 'error') {
      return (
        <span className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-bold text-rose-700">
          Sync Failed
        </span>
      )
    }

    return null
  }

  if (showSplash) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-emerald-500 via-green-500 to-emerald-700 px-6">
        <div className="w-full max-w-md rounded-[2rem] bg-white/10 p-10 text-center shadow-2xl backdrop-blur-md">
          <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-3xl bg-white shadow-xl">
            <img
              src="/icons/icon-512.png"
              alt="SimpliiTrash Driver"
              className="h-16 w-16 rounded-2xl object-contain"
            />
          </div>

          <h1 className="mt-6 text-3xl font-extrabold tracking-tight text-white">
            SimpliiTrash Driver
          </h1>

          <p className="mt-2 text-sm text-white/90">
            Loading your route...
          </p>

          <div className="mt-6 h-2 overflow-hidden rounded-full bg-white/20">
            <div className="h-full w-2/3 animate-pulse rounded-full bg-white" />
          </div>
        </div>
      </div>
    )
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
                onClick={handleLogout}
                className="inline-flex items-center justify-center rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
              >
                Log Out
              </button>

              <button
                type="button"
                onClick={handleEnableNotifications}
                disabled={notificationsLoading || notificationsEnabled}
                className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {notificationsEnabled
                  ? 'Subscribed'
                  : notificationsLoading
                  ? 'Enabling...'
                  : 'Enable Notifications'}
              </button>

              {notificationsEnabled ? (
                <button
                  type="button"
                  onClick={handleSendTestNotification}
                  className="inline-flex items-center justify-center rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
                >
                  Test Notification
                </button>
              ) : null}

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
        </div>

        {isOffline || usingCachedOrders || queuedActions.length > 0 || syncingQueue ? (
          <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {syncingQueue
              ? 'Syncing offline updates...'
              : queuedActions.length > 0
              ? `Offline queue active: ${queuedActions.length} update${queuedActions.length === 1 ? '' : 's'} waiting to sync.`
              : usingCachedOrders
              ? 'Offline mode: showing last synced route.'
              : 'Connection looks weak. Some actions may sync later.'}
          </div>
        ) : null}

        {loading ? (
          <div className="rounded-3xl bg-white p-10 text-center text-sm text-slate-500 shadow-sm ring-1 ring-slate-200">
            Loading driver app...
          </div>
        ) : orders.length === 0 ? (
          <div className="rounded-3xl bg-white p-10 text-center text-sm text-slate-500 shadow-sm ring-1 ring-slate-200">
            No active orders for this driver.
          </div>
        ) : (
          <div className="space-y-4">
            {orders.map((order, index) => {
              const isCurrentStop = currentStopId === order.id
              const isExpanded = expandedOrderId === order.id
              const isSaving = savingOrderId === order.id
              const stopAddress = getOrderAddress(order)
              const syncBadge = getOrderSyncBadge(order.id)

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
                            Current Order
                          </span>
                        ) : null}

                        <span
                          className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                            statusStyles[order.status || 'unassigned'] || statusStyles.unassigned
                          }`}
                        >
                          {formatStatus(order.status || 'unassigned')}
                        </span>

                        {syncBadge}
                      </div>

                      <h2 className="mt-3 text-lg font-bold text-slate-900">
                        {order.customer_name || 'No customer'}
                      </h2>

                      <div className="mt-1 text-sm text-slate-500">
                        {order.ticket_number || `#${order.id.slice(0, 8)}`}
                      </div>

                      <div className="mt-3 grid gap-3 md:grid-cols-3">
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 md:col-span-2">
                          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Address
                          </div>
                          <div className="mt-2 text-sm text-slate-900">
                            {displayValue(stopAddress)}
                          </div>
                        </div>

                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Time
                          </div>
                          <div className="mt-2 text-sm text-slate-900">
                            {displayValue(order.service_window || order.service_time)}
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
                            Open in Maps
                          </a>
                        ) : null}

                        <button
                          type="button"
                          onClick={() => updateOrderStatus(order.id, 'in_progress')}
                          disabled={isSaving}
                          className="inline-flex items-center justify-center rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {isSaving ? 'Saving...' : isOffline ? 'Start Order (Queue)' : 'Start Order'}
                        </button>

                        <button
                          type="button"
                          onClick={() => updateOrderStatus(order.id, 'completed')}
                          disabled={isSaving}
                          className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {isSaving ? 'Saving...' : isOffline ? 'Complete Order (Queue)' : 'Complete Order'}
                        </button>

                        <button
                          type="button"
                          onClick={() => updateOrderStatus(order.id, 'issue')}
                          disabled={isSaving}
                          className="inline-flex items-center justify-center rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {isSaving ? 'Saving...' : isOffline ? 'Report Issue (Queue)' : 'Report Issue'}
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
                          Scheduled Date
                        </div>
                        <div className="mt-2 text-sm text-slate-900">
                          {formatDate(order.scheduled_date)}
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
      </div>
    </div>
  )
}