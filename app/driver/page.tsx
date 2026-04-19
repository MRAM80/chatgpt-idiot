'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
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

type Bin = {
  id: string
  bin_number: string | null
  bin_size: string | number | null
  status?: string | null
  location?: string | null
}

type OrderBinRelation = {
  id: string
  bin_number: string | null
  bin_size: string | number | null
  status?: string | null
  location?: string | null
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
  dump_site_id?: string | null
  dump_site_address?: string | null
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
  bins?: OrderBinRelation[] | null
  old_bin?: OrderBinRelation[] | null
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
type BinSaveState = 'idle' | 'saving' | 'saved' | 'error'

const TABLE_NAME = 'order'
const CACHED_ORDERS_KEY = 'driver_cached_orders'
const QUEUED_ACTIONS_KEY = 'driver_queued_actions'

function firstRelation<T>(value?: T[] | null): T | null {
  return Array.isArray(value) && value.length > 0 ? value[0] : null
}

function displayValue(value: unknown) {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'string') return value.trim() ? value : '—'
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function formatServiceTime(value: string | null | undefined) {
  if (!value) return '—'
  const cleaned = String(value).trim()
  if (!cleaned) return '—'

  const [hourStr, minuteStr] = cleaned.split(':')
  const hour = Number(hourStr)
  const minute = Number(minuteStr)

  if (Number.isNaN(hour) || Number.isNaN(minute)) return cleaned

  const date = new Date()
  date.setHours(hour, minute, 0, 0)

  return date.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  })
}

function normalizeBinNumber(value: string) {
  return value.trim().replace(/\s+/g, ' ').toUpperCase()
}

function formatDriverOperationalStatus(status: string | null | undefined) {
  if (!status) return ''
  if (status === 'heading_back') return 'Heading Back'
  if (status === 'parked') return 'Parked'
  if (status === 'available') return 'Available'
  return ''
}

function notifyInApp(title: string, body: string) {
  if (typeof window === 'undefined') return
  if (!('Notification' in window)) return
  if (Notification.permission !== 'granted') return

  try {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready
        .then((registration) => registration.showNotification(title, { body }))
        .catch(() => {
          try {
            new Notification(title, { body })
          } catch {
            // keep page usable
          }
        })
      return
    }

    new Notification(title, { body })
  } catch {
    // keep page usable
  }
}

function getOrderAddress(order: Order) {
  return order.service_address || order.pickup_address || ''
}

function buildGoogleMapsLinkForOrders(orders: Order[]) {
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

function buildGoogleMapsLinkFromStop(orders: Order[], startIndex: number) {
  return buildGoogleMapsLinkForOrders(orders.slice(startIndex))
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

const ACTIVE_ORDER_STATUSES = ['unassigned', 'assigned', 'in_progress'] as const

function getOrderTimeValue(order: Order) {
  return new Date(order.updated_at || order.created_at || order.scheduled_date || 0).getTime()
}

function getPrimaryBinId(order: Order) {
  return String(order.bin_id || order.old_bin_id || '')
}

function hasOpenPreviousOrder(currentOrder: Order, allOrders: Order[]) {
  const currentBinId = getPrimaryBinId(currentOrder)
  if (!currentBinId) return false

  const currentTime = getOrderTimeValue(currentOrder)

  return allOrders.some((order) => {
    if (order.id === currentOrder.id) return false
    if (!ACTIVE_ORDER_STATUSES.includes((order.status || '') as (typeof ACTIVE_ORDER_STATUSES)[number])) {
      return false
    }

    const otherPrimaryBinId = getPrimaryBinId(order)
    if (!otherPrimaryBinId) return false
    if (otherPrimaryBinId !== currentBinId) return false

    return getOrderTimeValue(order) < currentTime
  })
}

export default function DriverPage() {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  const [driver, setDriver] = useState<Driver | null>(null)
  const [orders, setOrders] = useState<Order[]>([])
  const [binsMap, setBinsMap] = useState<Record<string, Bin>>({})
  const [loading, setLoading] = useState(true)
  const [pageError, setPageError] = useState('')
  const [savingOrderId, setSavingOrderId] = useState<string | null>(null)
  const [showSplash, setShowSplash] = useState(true)
  const [isOffline, setIsOffline] = useState(false)
  const [usingCachedOrders, setUsingCachedOrders] = useState(false)
  const [syncingQueue, setSyncingQueue] = useState(false)
  const [queuedActions, setQueuedActions] = useState<QueuedAction[]>([])
  const [syncStates, setSyncStates] = useState<Record<string, SyncState>>({})
  const [binInputs, setBinInputs] = useState<Record<string, string>>({})
  const [binSaveStates, setBinSaveStates] = useState<Record<string, BinSaveState>>({})
  const hasInitializedPresenceRef = useRef(false)
  const previousDriverStatusRef = useRef<string | null>(null)
  const previousOrderIdsRef = useRef<string[]>([])

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

  function setBinSaveState(orderId: string, state: BinSaveState) {
    setBinSaveStates((current) => ({
      ...current,
      [orderId]: state,
    }))
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

  async function markDriverAvailable(driverId: string) {
    const { error } = await supabase
      .from('drivers')
      .update({ status: 'available' })
      .eq('id', driverId)

    if (error) {
      setPageError(error.message)
      return false
    }

    setDriver((current) => (current ? { ...current, status: 'available' } : current))
    return true
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

  async function ensureNotificationsSubscribed(driverId: string) {
    if (typeof window === 'undefined') return
    if ('Notification' in window && Notification.permission === 'default') {
      try {
        await Notification.requestPermission()
      } catch {
        // keep page usable
      }
    }
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return

    const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
    if (!vapidPublicKey) return

    try {
      await navigator.serviceWorker.register('/sw.js')
      const registration = await navigator.serviceWorker.ready

      let permission = Notification.permission
      if (permission === 'default') {
        permission = await Notification.requestPermission()
      }

      if (permission !== 'granted') return

      let subscription = await registration.pushManager.getSubscription()

      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
        })
      }

      const raw = subscription.toJSON()
      if (!raw?.endpoint || !raw?.keys?.p256dh || !raw?.keys?.auth) return

      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          driverId,
          endpoint: raw.endpoint,
          p256dh: raw.keys.p256dh,
          auth: raw.keys.auth,
        }),
      })
    } catch {
      // keep page usable
    }
  }

  async function loadBinsForOrders(nextOrders: Order[]) {
    const ids = Array.from(
      new Set(
        nextOrders
          .flatMap((order) => [order.bin_id, order.old_bin_id])
          .filter(Boolean)
          .map((id) => String(id))
      )
    )

    if (ids.length === 0) {
      setBinsMap({})
      return
    }

    const { data, error } = await supabase
      .from('bins')
      .select('id,bin_number,bin_size,status,location')
      .in('id', ids)

    if (error) {
      setPageError((prev) => prev || error.message)
      return
    }

    const nextMap: Record<string, Bin> = {}
    for (const bin of (data as Bin[]) || []) {
      nextMap[String(bin.id)] = bin
    }
    setBinsMap(nextMap)
  }

  async function loadPage() {
    setPageError('')
    setLoading(true)

    let resolvedDriver = await resolveDriver()

    if (!resolvedDriver) {
      setLoading(false)
      return
    }

    if (!hasInitializedPresenceRef.current) {
      const becameAvailable = await markDriverAvailable(resolvedDriver.id)
      if (becameAvailable) {
        resolvedDriver = { ...resolvedDriver, status: 'available' }
      }
      hasInitializedPresenceRef.current = true
    }

    setDriver(resolvedDriver)
    void ensureNotificationsSubscribed(resolvedDriver.id)

    const { data: orderData, error: ordersError } = await supabase
      .from(TABLE_NAME)
      .select(
        `
        id,
        ticket_number,
        customer_name,
        pickup_address,
        service_address,
        service_time,
        service_window,
        bin_id,
        old_bin_id,
        dump_site_id,
        dump_site_address,
        bin_size,
        bin_type,
        order_type,
        scheduled_date,
        driver_id,
        route_position,
        status,
        notes,
        created_at,
        updated_at,
        completed_by,
        completed_at,
        bins:bin_id ( id, bin_number, bin_size, status, location ),
        old_bin:old_bin_id ( id, bin_number, bin_size, status, location )
      `
      )
      .eq('driver_id', resolvedDriver.id)
      .neq('status', 'completed')
      .order('route_position', { ascending: true })
      .order('created_at', { ascending: true })

    if (ordersError) {
      const cachedOrders = readCachedOrders()

      if (cachedOrders.length > 0) {
        persistOrders(cachedOrders)
        setUsingCachedOrders(true)
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
    await loadBinsForOrders(nextOrders)

    setBinInputs((current) => {
      const next = { ...current }
      for (const order of nextOrders) {
        const assignedBin = firstRelation(order.bins)
        const oldBin = firstRelation(order.old_bin)
        const mappedAssigned = order.bin_id ? binsMap[String(order.bin_id)] : null
        const mappedOld = order.old_bin_id ? binsMap[String(order.old_bin_id)] : null

        if (order.order_type === 'REMOVAL' || order.order_type === 'DUMP RETURN') {
          next[order.id] =
            oldBin?.bin_number ||
            mappedOld?.bin_number ||
            assignedBin?.bin_number ||
            mappedAssigned?.bin_number ||
            current[order.id] ||
            ''
        } else {
          next[order.id] =
            assignedBin?.bin_number ||
            mappedAssigned?.bin_number ||
            current[order.id] ||
            ''
        }
      }
      return next
    })

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

  async function saveBinNumber(order: Order) {
    const rawInput = binInputs[order.id] || ''
    const normalizedInput = normalizeBinNumber(rawInput)

    if (!normalizedInput) {
      setPageError('Please enter a bin number.')
      setBinSaveState(order.id, 'error')
      return
    }

    setPageError('')
    setBinSaveState(order.id, 'saving')

    const { data: matchedBin, error: binError } = await supabase
      .from('bins')
      .select('id,bin_number,bin_size,status,location')
      .ilike('bin_number', normalizedInput)
      .maybeSingle()

    if (binError) {
      setPageError(binError.message)
      setBinSaveState(order.id, 'error')
      return
    }

    if (!matchedBin) {
      setPageError(`Bin ${normalizedInput} was not found.`)
      setBinSaveState(order.id, 'error')
      return
    }

    const expectedSize = String(order.bin_size ?? '').trim()
    const actualSize = String(matchedBin.bin_size ?? '').trim()

    if (expectedSize && actualSize && expectedSize !== actualSize) {
      setPageError(`Bin ${normalizedInput} is ${actualSize}Yd, but this order needs ${expectedSize}Yd.`)
      setBinSaveState(order.id, 'error')
      return
    }

    const currentOldBinId = order.old_bin_id ? String(order.old_bin_id) : null
    if (
      currentOldBinId &&
      String(matchedBin.id) === currentOldBinId &&
      order.order_type === 'EXCHANGE'
    ) {
      setPageError('The new bin cannot be the same as the old bin.')
      setBinSaveState(order.id, 'error')
      return
    }

    const stopAddress = getOrderAddress(order) || null
    const nextOrderPayload: Record<string, unknown> = {
      bin_id: matchedBin.id,
    }

    const { error: orderError } = await supabase
      .from(TABLE_NAME)
      .update(nextOrderPayload)
      .eq('id', order.id)

    if (orderError) {
      setPageError(orderError.message)
      setBinSaveState(order.id, 'error')
      return
    }

    const { error: updateBinError } = await supabase
      .from('bins')
      .update({
        status: 'in_use',
        location: stopAddress,
      })
      .eq('id', matchedBin.id)

    if (updateBinError) {
      setPageError(updateBinError.message)
      setBinSaveState(order.id, 'error')
      return
    }

    setBinsMap((current) => ({
      ...current,
      [String(matchedBin.id)]: matchedBin as Bin,
    }))

    setOrders((current) =>
      current.map((item) =>
        item.id === order.id
          ? {
              ...item,
              bin_id: matchedBin.id,
              bins: [
                {
                  id: matchedBin.id,
                  bin_number: matchedBin.bin_number,
                  bin_size: matchedBin.bin_size,
                  status: matchedBin.status,
                  location: matchedBin.location,
                },
              ],
            }
          : item
      )
    )

    setBinInputs((current) => ({
      ...current,
      [order.id]: matchedBin.bin_number || normalizedInput,
    }))

    setBinSaveState(order.id, 'saved')
  }

  useEffect(() => {
    setQueuedActions(readQueuedActions())
  }, [])

  useEffect(() => {
    void loadPage()

    const handleWindowFocus = () => {
      void loadPage()
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void loadPage()
      }
    }

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

    window.addEventListener('focus', handleWindowFocus)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.removeEventListener('focus', handleWindowFocus)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      supabase.removeChannel(channel)
    }
  }, [supabase])

  useEffect(() => {
    const interval = window.setInterval(() => {
      void loadPage()
      void flushQueuedActions()
    }, 600000)

    return () => {
      window.clearInterval(interval)
    }
  }, [syncingQueue])

  useEffect(() => {
    if (!loading) {
      const timer = window.setTimeout(() => {
        setShowSplash(false)
      }, 700)

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

  async function updateOrderStatus(orderId: string, nextStatus: string) {
    setSavingOrderId(orderId)
    setPageError('')

    const order = orders.find((o) => o.id === orderId)
    if (!order) {
      setSavingOrderId(null)
      return
    }

    const requiresDriverBin = order.order_type === 'DELIVERY' || order.order_type === 'EXCHANGE'
    const currentBinRelation =
      firstRelation(order.bins) || (order.bin_id ? binsMap[String(order.bin_id)] : null)

    if (nextStatus === 'completed' && requiresDriverBin && !currentBinRelation?.id) {
      setPageError('Please save the bin number before completing this order.')
      setSavingOrderId(null)
      return
    }

    if (nextStatus === 'completed' && hasOpenPreviousOrder(order, orders)) {
      setPageError('Finish previous job before continuing.')
      setSavingOrderId(null)
      return
    }

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

    if (!error && nextStatus === 'completed') {
      const stopAddress = getOrderAddress(order)

      if (order.order_type === 'DELIVERY' && order.bin_id) {
        await supabase
          .from('bins')
          .update({
            status: 'in_use',
            location: stopAddress,
          })
          .eq('id', order.bin_id)
      }

      if (order.order_type === 'EXCHANGE') {
        if (order.bin_id) {
          await supabase
            .from('bins')
            .update({
              status: 'in_use',
              location: stopAddress,
            })
            .eq('id', order.bin_id)
        }

        if (order.old_bin_id) {
          await supabase
            .from('bins')
            .update({
              status: 'available',
              location: 'Yard',
            })
            .eq('id', order.old_bin_id)
        }
      }

      if (order.order_type === 'REMOVAL' && order.old_bin_id) {
        await supabase
          .from('bins')
          .update({
            status: 'available',
            location: 'Yard',
          })
          .eq('id', order.old_bin_id)
      }

      if (order.order_type === 'DUMP RETURN' && order.old_bin_id) {
        await supabase
          .from('bins')
          .update({
            status: 'in_use',
            location: stopAddress,
          })
          .eq('id', order.old_bin_id)
      }
    }

    if (error) {
      queueOrderAction(orderId, nextStatus, completedAt, completedBy)
      setPageError('Connection issue: saved locally and will sync automatically.')
      setSavingOrderId(null)
      return
    }

    clearOrderSyncState(orderId)
    setSavingOrderId(null)
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

  useEffect(() => {
    if (!driver) return

    const currentStatus = driver.status || null
    const previousStatus = previousDriverStatusRef.current

    if (previousStatus !== null && previousStatus !== currentStatus) {
      if (currentStatus === 'heading_back') {
        notifyInApp('SimpliiTrash', 'HEAD BACK')
      } else if (currentStatus === 'parked') {
        notifyInApp('SimpliiTrash', 'Park and finish today')
      } else if (currentStatus === 'available') {
        notifyInApp('SimpliiTrash', 'You are available')
      }
    }

    previousDriverStatusRef.current = currentStatus
  }, [driver?.status])

  useEffect(() => {
    const currentIds = orders.map((order) => order.id).sort()
    const previousIds = previousOrderIdsRef.current

    const newOrderIds = currentIds.filter((id) => !previousIds.includes(id))
    if (previousIds.length > 0 && newOrderIds.length > 0) {
      notifyInApp(
        'SimpliiTrash',
        newOrderIds.length === 1 ? 'You received a new order' : `You received ${newOrderIds.length} new orders`
      )
    }

    previousOrderIdsRef.current = currentIds
  }, [orders])

  if (showSplash) {
    return (
      <div style={{ colorScheme: 'light' }} className="flex min-h-screen items-center justify-center bg-gradient-to-br from-emerald-500 via-green-500 to-emerald-700 px-6">
        <div className="w-full max-w-md rounded-[2rem] bg-white/10 p-10 text-center shadow-2xl backdrop-blur-md">
          <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-3xl bg-white shadow-xl">
            <img
              src="/icons/icon-512.png"
              alt="SimpliiTrash"
              className="h-16 w-16 rounded-2xl object-contain"
            />
          </div>

          <h1 className="mt-6 text-3xl font-extrabold tracking-tight text-white">
            SimpliiTrash
          </h1>

          <p className="mt-2 text-sm text-white/90">
            Loading route...
          </p>

          <div className="mt-6 h-2 overflow-hidden rounded-full bg-white/20">
            <div className="h-full w-2/3 animate-pulse rounded-full bg-white" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ colorScheme: 'light' }} className="min-h-screen bg-slate-100 text-slate-900">
      <div className="mx-auto max-w-6xl p-4 md:p-6">
        <div className="mb-6 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                {driver?.name || 'Driver'}
              </h1>

              {driver?.status === 'heading_back' ? (
                <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
                  HB
                </span>
              ) : null}

              {driver?.status === 'parked' ? (
                <span className="rounded-full border border-slate-300 bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
                  Parked
                </span>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {driver?.status !== 'available' ? (
                <button
                  type="button"
                  onClick={async () => {
                    if (!driver?.id) return
                    const ok = await markDriverAvailable(driver.id)
                    if (ok) await loadPage()
                  }}
                  className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
                >
                  Available
                </button>
              ) : null}

              <button
                type="button"
                onClick={handleLogout}
                className="inline-flex items-center justify-center rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
              >
                Log Out
              </button>
            </div>
          </div>

          {pageError ? (
            <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {pageError}
            </div>
          ) : null}

          {driver?.status === 'heading_back' ? (
            <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-700">
              HEAD BACK
            </div>
          ) : null}

          {driver?.status === 'parked' ? (
            <div className="mt-4 rounded-2xl border border-slate-300 bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-700">
              Park and finish today
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
            Loading driver page...
          </div>
        ) : orders.length === 0 ? (
          <div className="rounded-3xl bg-white p-10 text-center text-sm text-slate-500 shadow-sm ring-1 ring-slate-200">
            No active orders for this driver.
          </div>
        ) : (
          <div className="space-y-4">
            {orders.map((order, index) => {
              const isSaving = savingOrderId === order.id
              const syncBadge = getOrderSyncBadge(order.id)
              const stopAddress = getOrderAddress(order)
              const assignedBin = firstRelation(order.bins) || (order.bin_id ? binsMap[String(order.bin_id)] : null)
              const oldBin = firstRelation(order.old_bin) || (order.old_bin_id ? binsMap[String(order.old_bin_id)] : null)
              const binSaveState = binSaveStates[order.id] || 'idle'
              const stopRouteLink = buildGoogleMapsLinkFromStop(orders, index)
              const usesExistingBin =
                order.order_type === 'REMOVAL' || order.order_type === 'DUMP RETURN'
              const needsNewBin =
                order.order_type === 'DELIVERY' || order.order_type === 'EXCHANGE'
              const visibleBinNumber = usesExistingBin
                ? oldBin?.bin_number || assignedBin?.bin_number || binInputs[order.id] || ''
                : assignedBin?.bin_number || binInputs[order.id] || ''

              return (
                <div
                  key={order.id}
                  className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200"
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-700">
                          Stop {order.route_position || index + 1}
                        </span>

                        <span className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-bold text-violet-700">
                          {displayValue(order.bin_size)}Yd
                        </span>

                        <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-700">
                          {displayValue(order.order_type)}
                        </span>

                        <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-700">
                          {order.service_window
                            ? displayValue(order.service_window)
                            : formatServiceTime(order.service_time)}
                        </span>

                        {syncBadge}
                      </div>

                      <div className="mt-3">
                        <h2 className="text-lg font-bold text-slate-900">
                          {order.customer_name || 'No customer'}
                        </h2>
                      </div>

                      <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto]">
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Address
                          </div>
                          <div className="mt-2 text-sm text-slate-900">
                            {displayValue(stopAddress)}
                          </div>
                        </div>

                        {stopRouteLink ? (
                          <a
                            href={stopRouteLink}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex h-fit items-center justify-center rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:opacity-90"
                          >
                            Open Full Route
                          </a>
                        ) : null}
                      </div>

                      <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Bin Number
                        </div>

                        {needsNewBin && !assignedBin?.bin_number ? (
                          <div className="mt-3 flex flex-col gap-3 md:flex-row">
                            <input
                              value={binInputs[order.id] || ''}
                              onChange={(e) =>
                                setBinInputs((current) => ({
                                  ...current,
                                  [order.id]: e.target.value,
                                }))
                              }
                              placeholder="Enter bin number"
                              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-slate-400"
                            />

                            <button
                              type="button"
                              onClick={() => void saveBinNumber(order)}
                              disabled={binSaveState === 'saving'}
                              className="inline-flex items-center justify-center rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {binSaveState === 'saving' ? 'Saving...' : 'Save Bin'}
                            </button>
                          </div>
                        ) : (
                          <div className="mt-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-700">
                            <span className="font-semibold">{visibleBinNumber || 'Not set'}</span>
                          </div>
                        )}

                        {order.order_type === 'EXCHANGE' && oldBin?.bin_number ? (
                          <div className="mt-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-700">
                            Old bin at site: <span className="font-semibold">{oldBin.bin_number}</span>
                          </div>
                        ) : null}
                      </div>

                      {order.order_type === 'REMOVAL' || order.order_type === 'EXCHANGE' || order.order_type === 'DUMP RETURN' ? (
                        <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Dump Site
                          </div>
                          <div className="mt-2 text-sm text-slate-900">
                            {displayValue(order.dump_site_address)}
                          </div>
                        </div>
                      ) : null}

                      <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Notes
                        </div>
                        <div className="mt-2 whitespace-pre-wrap text-sm text-slate-900">
                          {displayValue(order.notes)}
                        </div>
                      </div>
                    </div>

                    <div className="w-full shrink-0 lg:w-[220px]">
                      <div className="grid gap-2">
                        {order.status !== 'in_progress' ? (
                          <button
                            type="button"
                            onClick={() => void updateOrderStatus(order.id, 'in_progress')}
                            disabled={isSaving}
                            className="inline-flex items-center justify-center rounded-xl bg-amber-500 px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {isSaving ? 'Saving...' : isOffline ? 'Start Order (Queue)' : 'Start Order'}
                          </button>
                        ) : null}

                        <button
                          type="button"
                          onClick={() => {
                            if (hasOpenPreviousOrder(order, orders)) {
                              setPageError('Finish previous job before continuing.')
                              return
                            }
                            void updateOrderStatus(order.id, 'completed')
                          }}
                          disabled={isSaving || hasOpenPreviousOrder(order, orders)}
                          className={`inline-flex items-center justify-center rounded-xl px-4 py-3 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-60 ${
                            hasOpenPreviousOrder(order, orders)
                              ? 'bg-slate-400'
                              : 'bg-emerald-600 hover:opacity-90'
                          }`}
                        >
                          {hasOpenPreviousOrder(order, orders)
                            ? 'Complete Blocked'
                            : isSaving
                              ? 'Saving...'
                              : isOffline
                                ? 'Complete Order (Queue)'
                                : 'Complete Order'}
                        </button>

                        <button
                          type="button"
                          onClick={() => void updateOrderStatus(order.id, 'issue')}
                          disabled={isSaving}
                          className="inline-flex items-center justify-center rounded-xl bg-rose-600 px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {isSaving ? 'Saving...' : isOffline ? 'Report Issue (Queue)' : 'Report Issue'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
