'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import AppLogo from '@/components/AppLogo'
import { useRole } from '@/hooks/useRole'
import { can } from '@/lib/roles'

type Driver = {
  id: string
  name: string | null
  phone: string | null
  status: string | null
}

type Customer = {
  id: string
  name: string | null
  address: string | null
}

type JobSite = {
  id: string
  customer_id: string | null
  site_name: string | null
  address: string | null
}

type Bin = {
  id: string
  bin_number: string | null
  bin_size: string | null
  status: string | null
  location: string | null
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
  driver_notes?: string | null
  delivery_photo_url?: string | null
  workflow_step?: string | null
  parent_order_id?: string | null
  dump_site_address?: string | null
}

type BoardColumn = {
  key: string
  label: string
  type: 'unassigned' | 'driver'
}

type DragState = {
  orderId: string
  fromColumnKey: string
} | null

type QuickOrderForm = {
  customer_id: string
  customer_name: string
  job_site_id: string
  pickup_address: string
  order_type: string
  bin_size: string
  bin_type: string
  bin_number: string
  dump_site_address: string
  scheduled_date: string
  service_time: string
  driver_id: string
  notes: string
}

function generateTicketNumber() {
  return `ST-${Math.random().toString(36).slice(2, 10).toUpperCase()}`
}

function toLocalDayKeyLocal(date: Date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

const emptyQuickForm = (): QuickOrderForm => ({
  customer_id: '',
  customer_name: '',
  job_site_id: '',
  pickup_address: '',
  order_type: 'DELIVERY',
  bin_size: '20',
  bin_type: 'Garbage',
  bin_number: '',
  dump_site_address: '',
  scheduled_date: toLocalDayKeyLocal(new Date()),
  service_time: '',
  driver_id: '',
  notes: '',
})

const TABLE_NAME = 'order'

const statusStyles: Record<string, string> = {
  unassigned: 'border-slate-200 bg-slate-50 text-slate-700',
  assigned: 'border-blue-200 bg-blue-50 text-blue-700',
  in_progress: 'border-amber-200 bg-amber-50 text-amber-700',
  completed: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  issue: 'border-rose-200 bg-rose-50 text-rose-700',
}

const driverStatusStyles: Record<string, string> = {
  available: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  busy: 'border-amber-200 bg-amber-50 text-amber-700',
  heading_back: 'border-blue-200 bg-blue-50 text-blue-700',
  parked: 'border-slate-300 bg-slate-100 text-slate-700',
}

function getDriverColumnStyle(status?: string | null) {
  switch (status) {
    case 'available':
      return 'bg-emerald-50 ring-emerald-200'
    case 'heading_back':
      return 'bg-blue-50 ring-blue-200'
    case 'parked':
      return 'bg-slate-100 ring-slate-300'
    case 'busy':
      return 'bg-amber-50 ring-amber-200'
    default:
      return 'bg-white ring-slate-200'
  }
}

function formatStatus(status: string | null | undefined) {
  if (!status) return 'Unassigned'
  if (status === 'in_progress') return 'In Progress'
  return status
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

function formatDriverStatus(status: string | null | undefined) {
  if (!status) return 'Available'
  if (status === 'heading_back') return 'HB'
  if (status === 'parked') return 'Parked'
  return status.charAt(0).toUpperCase() + status.slice(1)
}

function formatDate(dateValue: string | null | undefined) {
  if (!dateValue) return '—'
  const date = new Date(dateValue)
  if (Number.isNaN(date.getTime())) return String(dateValue)
  return date.toLocaleDateString()
}

function formatServiceTime(timeValue: string | null | undefined) {
  if (!timeValue) return '—'
  const cleaned = String(timeValue).trim()
  if (!cleaned) return '—'

  if (/am|pm/i.test(cleaned)) return cleaned

  const parts = cleaned.split(':')
  if (parts.length < 2) return cleaned

  const hour = Number(parts[0])
  const minute = Number(parts[1])

  if (Number.isNaN(hour) || Number.isNaN(minute)) return cleaned

  const date = new Date()
  date.setHours(hour, minute, 0, 0)

  return date.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  })
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

function DetailItem({
  label,
  value,
}: {
  label: string
  value: unknown
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div className="mt-2 text-sm text-slate-900">{displayValue(value)}</div>
    </div>
  )
}

function reorderIds(orderIds: string[], movingId: string, beforeId?: string | null) {
  const withoutMoving = orderIds.filter((id) => id !== movingId)

  if (!beforeId) return [...withoutMoving, movingId]

  const insertIndex = withoutMoving.indexOf(beforeId)
  if (insertIndex === -1) return [...withoutMoving, movingId]

  return [
    ...withoutMoving.slice(0, insertIndex),
    movingId,
    ...withoutMoving.slice(insertIndex),
  ]
}

function mergeDriverRouteOrder(currentOrders: Order[]) {
  const assigned = currentOrders
    .filter((order) => !!order.driver_id)
    .sort((a, b) => {
      const driverCompare = String(a.driver_id || '').localeCompare(String(b.driver_id || ''))
      if (driverCompare !== 0) return driverCompare

      const aPos = a.route_position ?? Number.MAX_SAFE_INTEGER
      const bPos = b.route_position ?? Number.MAX_SAFE_INTEGER
      if (aPos !== bPos) return aPos - bPos

      const aDate = a.scheduled_date || ''
      const bDate = b.scheduled_date || ''
      if (aDate !== bDate) return aDate.localeCompare(bDate)

      return String(a.created_at || '').localeCompare(String(b.created_at || ''))
    })

  return assigned.map((order) => order.id)
}

function toLocalDayKey(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getTodayKey() {
  return toLocalDayKey(new Date())
}

function getTomorrowKey() {
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  return toLocalDayKey(tomorrow)
}

function formatBoardDayLabel(dayKey: string) {
  const [year, month, day] = String(dayKey).split('-').map(Number)
  const parsed = new Date(year, (month || 1) - 1, day || 1)
  if (Number.isNaN(parsed.getTime())) return dayKey
  return parsed.toLocaleDateString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

function getOrderSortableAddress(order: Order) {
  return String(order.service_address || order.pickup_address || order.dump_site_address || '')
    .trim()
    .toLowerCase()
}

function getOrderDayKey(order: Order) {
  if (order.scheduled_date) return String(order.scheduled_date).slice(0, 10)

  if (order.created_at) {
    const parsed = new Date(order.created_at)
    if (!Number.isNaN(parsed.getTime())) return toLocalDayKey(parsed)
  }

  return ''
}

function getOrderDestination(order: Order) {
  return order.workflow_step === 'DUMP'
    ? order.dump_site_address || 'No dump site address'
    : order.service_address || order.pickup_address || 'No service address'
}

function getLastOrderSummary(order: Order | null) {
  if (!order) return 'No orders'
  return `${displayValue(order.order_type)} • ${getOrderDestination(order)}`
}

export default function DispatchBoardPage() {
  const router = useRouter()
  const { role, loading: roleLoading } = useRole()
  const supabase = useMemo(() => createClient(), [])

  useEffect(() => {
    if (!roleLoading && role !== null && !can(role, 'canDispatch')) {
      router.push(role === 'driver' ? '/driver' : '/dashboard')
    }
  }, [roleLoading, role])

  const [orders, setOrders] = useState<Order[]>([])
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [jobSites, setJobSites] = useState<JobSite[]>([])
  const [bins, setBins] = useState<Bin[]>([])
  const [loading, setLoading] = useState(true)
  const [pageError, setPageError] = useState('')
  const [search, setSearch] = useState('')
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [dragState, setDragState] = useState<DragState>(null)
  const [dropTarget, setDropTarget] = useState<{ columnKey: string; beforeId: string | null } | null>(null)
  const [assignSelections, setAssignSelections] = useState<Record<string, string>>({})
  const [selectedDayKey, setSelectedDayKey] = useState(getTodayKey())
  const [quickCreateOpen, setQuickCreateOpen] = useState(false)
  const [quickForm, setQuickForm] = useState<QuickOrderForm>(emptyQuickForm)
  const [quickSaving, setQuickSaving] = useState(false)
  const [quickError, setQuickError] = useState('')
  const [modalNoteDraft, setModalNoteDraft] = useState('')
  const [modalNoteSaving, setModalNoteSaving] = useState(false)

  const todayKey = useMemo(() => getTodayKey(), [])
  const tomorrowKey = useMemo(() => getTomorrowKey(), [])

  async function loadDrivers() {
    const { data, error } = await supabase
      .from('drivers')
      .select('id,name,phone,status')
      .neq('status', 'offline')
      .order('name', { ascending: true })

    if (error) {
      setPageError(error.message)
      return
    }

    setDrivers((data as Driver[]) || [])
  }

  async function loadOrders() {
    setLoading(true)

    const { data, error } = await supabase
      .from(TABLE_NAME)
      .select('id,ticket_number,customer_name,pickup_address,service_address,service_time,workflow_step,parent_order_id,dump_site_address,service_window,bin_id,old_bin_id,bin_size,bin_type,order_type,scheduled_date,driver_id,route_position,status,notes,driver_notes,delivery_photo_url,created_at,updated_at,completed_by,completed_at')
      .order('scheduled_date', { ascending: true })
      .order('created_at', { ascending: true })

    if (error) {
      setPageError(error.message)
      setLoading(false)
      return
    }

    setOrders((data as Order[]) || [])
    setLoading(false)
  }

  async function loadCustomers() {
    const { data } = await supabase
      .from('customers')
      .select('id,name,address')
      .eq('status', 'active')
      .order('name', { ascending: true })
    setCustomers((data as Customer[]) || [])
  }

  async function loadJobSites() {
    const { data } = await supabase
      .from('job_sites')
      .select('id,customer_id,site_name,address')
      .eq('is_active', true)
      .order('site_name', { ascending: true })
    setJobSites((data as JobSite[]) || [])
  }

  async function loadBins() {
    const { data } = await supabase
      .from('bins')
      .select('id,bin_number,bin_size,status,location')
      .order('bin_number', { ascending: true })
    setBins((data as Bin[]) || [])
  }

  async function refreshAll() {
    setPageError('')
    await Promise.all([loadDrivers(), loadOrders(), loadCustomers(), loadJobSites(), loadBins()])
  }

  useEffect(() => {
    void refreshAll()

    const interval = window.setInterval(() => {
      void refreshAll()
    }, 15000)

    const channel = supabase
      .channel('dispatch-board-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: TABLE_NAME }, async () => {
        await loadOrders()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'drivers' }, async () => {
        await loadDrivers()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'customers' }, async () => {
        await loadCustomers()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'job_sites' }, async () => {
        await loadJobSites()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bins' }, async () => {
        await loadBins()
      })
      .subscribe()

    return () => {
      window.clearInterval(interval)
      supabase.removeChannel(channel)
    }
  }, [supabase])

  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setModalOpen(false)
        setSelectedOrderId(null)
      }
    }

    if (modalOpen) {
      document.body.style.overflow = 'hidden'
      window.addEventListener('keydown', handleEscape)
    } else {
      document.body.style.overflow = ''
    }

    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', handleEscape)
    }
  }, [modalOpen])

  const driverMap = useMemo(() => {
    return drivers.reduce<Record<string, Driver>>((acc, driver) => {
      acc[driver.id] = driver
      return acc
    }, {})
  }, [drivers])

  const activeDrivers = useMemo(() => {
    return drivers.filter((driver) => driver.status !== 'offline')
  }, [drivers])

  const assignableDrivers = useMemo(() => {
    return drivers.filter((driver) => {
      if (!driver) return false

      if (selectedDayKey === todayKey) {
        return driver.status === 'available' || driver.status === 'busy'
      }

      return (
        driver.status === 'available' ||
        driver.status === 'busy' ||
        driver.status === 'heading_back' ||
        driver.status === 'parked'
      )
    })
  }, [drivers, selectedDayKey, todayKey])

  const selectedOrder = useMemo(() => {
    if (!selectedOrderId) return null
    return orders.find((order) => order.id === selectedOrderId) || null
  }, [orders, selectedOrderId])

  const boardOrders = useMemo(() => {
    return orders.filter((order) => getOrderDayKey(order) === selectedDayKey)
  }, [orders, selectedDayKey])

  const boardColumns = useMemo<BoardColumn[]>(() => {
    return [
      { key: 'unassigned', label: 'Unassigned', type: 'unassigned' },
      ...activeDrivers.map((driver) => ({
        key: driver.id,
        label: driver.name || 'Unnamed Driver',
        type: 'driver' as const,
      })),
    ]
  }, [activeDrivers])

  async function syncDriverStatuses(driverId: string) {
    const { data: orderData, error: ordersError } = await supabase
      .from(TABLE_NAME)
      .select('status,scheduled_date')
      .eq('driver_id', driverId)

    if (ordersError) {
      setPageError(ordersError.message)
      return
    }

    const activeStatuses = ['assigned', 'in_progress']
    const hasActiveOrdersToday = (orderData || []).some(
      (order) =>
        activeStatuses.includes(order.status || '') &&
        String(order.scheduled_date || '').slice(0, 10) === todayKey
    )

    const { data: driver, error: driverError } = await supabase
      .from('drivers')
      .select('status')
      .eq('id', driverId)
      .single()

    if (driverError) {
      setPageError(driverError.message)
      return
    }

    if (driver?.status === 'offline') return
    if (driver?.status === 'heading_back' || driver?.status === 'parked') return

    const { error: updateError } = await supabase
      .from('drivers')
      .update({ status: hasActiveOrdersToday ? 'busy' : 'available' })
      .eq('id', driverId)

    if (updateError) {
      setPageError(updateError.message)
    }
  }

  async function setDriverOperationalStatus(driverId: string, nextStatus: 'available' | 'heading_back' | 'parked') {
    setPageError('')

    const { error } = await supabase
      .from('drivers')
      .update({ status: nextStatus })
      .eq('id', driverId)

    if (error) {
      setPageError(error.message)
      return
    }

    if (nextStatus === 'parked') {
      const todaysDriverOrders = boardOrders.filter((order) => order.driver_id === driverId)
      for (const order of todaysDriverOrders) {
        await supabase.from(TABLE_NAME).update({ route_position: null }).eq('id', order.id)
      }
    }

    setDrivers((current) =>
      current.map((driver) => (driver.id === driverId ? { ...driver, status: nextStatus } : driver))
    )

    await Promise.all([loadDrivers(), loadOrders()])
  }

  async function normalizeRoutePositionsForDriver(driverId: string) {
    const driverOrders = boardOrders
      .filter((order) => order.driver_id === driverId && order.status !== 'completed')
      .sort((a, b) => {
        const aPos = a.route_position ?? Number.MAX_SAFE_INTEGER
        const bPos = b.route_position ?? Number.MAX_SAFE_INTEGER
        if (aPos !== bPos) return aPos - bPos
        const aDate = a.scheduled_date || ''
        const bDate = b.scheduled_date || ''
        if (aDate !== bDate) return aDate.localeCompare(bDate)
        return String(a.created_at || '').localeCompare(String(b.created_at || ''))
      })

    for (let index = 0; index < driverOrders.length; index += 1) {
      const order = driverOrders[index]
      const nextPosition = index + 1
      if ((order.route_position ?? null) !== nextPosition) {
        const { error } = await supabase.from(TABLE_NAME).update({ route_position: nextPosition }).eq('id', order.id)
        if (error) {
          setPageError(error.message)
          return
        }
      }
    }
  }

  async function updateOrder(id: string, values: Partial<Order>) {
    setPageError('')
    const currentOrder = orders.find((order) => order.id === id)
    if (!currentOrder) return false

    if (currentOrder.status === 'completed' && Object.prototype.hasOwnProperty.call(values, 'status')) {
      return false
    }

    const previousDriverId = currentOrder.driver_id
    const { error } = await supabase.from(TABLE_NAME).update(values).eq('id', id)

    if (error) {
      setPageError(error.message)
      return false
    }

    if (previousDriverId && previousDriverId !== values.driver_id) {
      await syncDriverStatuses(previousDriverId)
    }

    if (values.driver_id) {
      await syncDriverStatuses(values.driver_id)
    }

    setOrders((current) => current.map((order) => (order.id === id ? { ...order, ...values } : order)))
    await refreshAll()
    return true
  }

  async function sendAssignedOrderNotification(params: {
    driverId: string
    orderId: string
    customerName?: string | null
    address?: string | null
  }) {
    try {
      await fetch('/api/push/order-assigned', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      })
    } catch (error) {
      console.error('Push notification failed:', error)
    }
  }

  async function sendNotifyPush(params: {
    driverId: string | null | undefined
    event: 'status_changed' | 'note_added'
    customerName?: string | null
    address?: string | null
    status?: string | null
    note?: string | null
  }) {
    if (!params.driverId) return
    try {
      await fetch('/api/push/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      })
    } catch {
      // non-critical — don't block the UI
    }
  }

  async function handleAssign(orderId: string, driverId: string) {
    const currentOrder = orders.find((order) => order.id === orderId)
    if (!currentOrder || currentOrder.status === 'completed') return

    if (!driverId) {
      const ok = await updateOrder(orderId, { driver_id: null, route_position: null, status: 'unassigned' })
      if (!ok) return
      if (currentOrder.driver_id) {
        await normalizeRoutePositionsForDriver(currentOrder.driver_id)
      }
      await refreshAll()
      return
    }

    const selectedDriver = drivers.find((driver) => driver.id === driverId) || null

    const canAssignToday =
      selectedDayKey !== todayKey ||
      selectedDriver?.status === 'available' ||
      selectedDriver?.status === 'busy'

    if (!canAssignToday) {
      setPageError('Today orders can only be assigned to available drivers.')
      return
    }

    const maxRoute = boardOrders
      .filter((order) => order.driver_id === driverId && order.status !== 'completed')
      .reduce((max, order) => Math.max(max, order.route_position || 0), 0)

    const ok = await updateOrder(orderId, {
      driver_id: driverId,
      route_position: maxRoute + 1,
      status: 'assigned',
    })
    if (!ok) return

    const orderDayKey = String(currentOrder.scheduled_date || '').slice(0, 10)

    if (orderDayKey === todayKey) {
      await sendAssignedOrderNotification({
        driverId,
        orderId,
        customerName: currentOrder.customer_name,
        address: currentOrder.service_address || currentOrder.pickup_address,
      })
    }

    setAssignSelections((current) => ({ ...current, [orderId]: '' }))
    await refreshAll()
  }

  const filteredOrders = useMemo(() => {
    return boardOrders.filter((order) => {
      const q = search.trim().toLowerCase()
      const driverName = driverMap[order.driver_id || '']?.name || ''
      const address = getOrderSortableAddress(order)
      return (
        !q ||
        (order.ticket_number || '').toLowerCase().includes(q) ||
        (order.customer_name || '').toLowerCase().includes(q) ||
        driverName.toLowerCase().includes(q) ||
        address.includes(q)
      )
    })
  }, [boardOrders, search, driverMap])

  const visibleBoardOrders = useMemo(() => {
    return filteredOrders.filter((order) => order.status !== 'completed')
  }, [filteredOrders])

  const routeIndexMap = useMemo(() => {
    return mergeDriverRouteOrder(visibleBoardOrders).reduce<Record<string, number>>((acc, id, index) => {
      acc[id] = index
      return acc
    }, {})
  }, [visibleBoardOrders])

  const groupedOrders = useMemo(() => {
    return boardColumns.reduce<Record<string, Order[]>>((acc, column) => {
      const matchingOrders = visibleBoardOrders.filter((order) => {
        if (column.key === 'unassigned') return !order.driver_id
        return order.driver_id === column.key
      })

      acc[column.key] = [...matchingOrders].sort((a, b) => {
        if (column.key === 'unassigned') {
          const addressCompare = getOrderSortableAddress(a).localeCompare(getOrderSortableAddress(b))
          if (addressCompare !== 0) return addressCompare

          const aTime = a.service_time || '99:99'
          const bTime = b.service_time || '99:99'
          if (aTime !== bTime) return aTime.localeCompare(bTime)

          const aCreated = String(a.created_at || '')
          const bCreated = String(b.created_at || '')
          return aCreated.localeCompare(bCreated)
        }

        const aIndex = routeIndexMap[a.id] ?? Number.MAX_SAFE_INTEGER
        const bIndex = routeIndexMap[b.id] ?? Number.MAX_SAFE_INTEGER
        return aIndex - bIndex
      })

      return acc
    }, {})
  }, [visibleBoardOrders, boardColumns, routeIndexMap])

  const stats = useMemo(() => {
    const unassigned = boardOrders.filter((order) => !order.driver_id && order.status !== 'completed').length
    const activeDriverIds = new Set(
      boardOrders.filter((order) => order.driver_id && order.status !== 'completed').map((order) => order.driver_id as string)
    )
    const inProgress = boardOrders.filter((order) => order.status === 'in_progress').length
    const available = activeDrivers.filter((driver) => driver.status === 'available').length
    return { unassigned, activeDrivers: activeDriverIds.size, inProgress, available }
  }, [boardOrders, activeDrivers])

  const driverOrdersMap = useMemo(() => {
    const map: Record<string, Order[]> = {}

    for (const driver of activeDrivers) {
      map[driver.id] = boardOrders
        .filter((order) => order.driver_id === driver.id && order.status !== 'completed')
        .sort((a, b) => {
          const aPos = a.route_position ?? Number.MAX_SAFE_INTEGER
          const bPos = b.route_position ?? Number.MAX_SAFE_INTEGER
          if (aPos !== bPos) return aPos - bPos
          return String(a.created_at || '').localeCompare(String(b.created_at || ''))
        })
    }

    return map
  }, [activeDrivers, boardOrders])

  const driverLastOrderMap = useMemo(() => {
    const map: Record<string, Order | null> = {}

    for (const driver of activeDrivers) {
      const driverOrders = boardOrders
        .filter((order) => order.driver_id === driver.id)
        .sort((a, b) => {
          const aTime = new Date(a.updated_at || a.created_at || 0).getTime()
          const bTime = new Date(b.updated_at || b.created_at || 0).getTime()
          return bTime - aTime
        })

      map[driver.id] = driverOrders[0] || null
    }

    return map
  }, [activeDrivers, boardOrders])

  const orderedDrivers = useMemo(() => {
    const rank = (driver: Driver) => {
      const driverOrders = driverOrdersMap[driver.id] || []
      const isInProgress = driverOrders.some((order) => order.status === 'in_progress')

      if (driver.status === 'available') return 0
      if (driver.status === 'heading_back') return 1
      if (driver.status === 'parked') return 2
      if (driver.status === 'busy' && !isInProgress) return 3
      if (driver.status === 'busy' && isInProgress) return 4
      return 5
    }

    return [...activeDrivers].sort((a, b) => {
      const rankCompare = rank(a) - rank(b)
      if (rankCompare !== 0) return rankCompare
      return String(a.name || '').localeCompare(String(b.name || ''))
    })
  }, [activeDrivers, driverOrdersMap])

  const unassignedOrders = useMemo(() => groupedOrders.unassigned || [], [groupedOrders])

  function openOrder(orderId: string) {
    const order = orders.find((o) => o.id === orderId)
    setModalNoteDraft(order?.notes || '')
    setSelectedOrderId(orderId)
    setModalOpen(true)
  }

  function closeOrderModal() {
    setModalOpen(false)
    setSelectedOrderId(null)
    setModalNoteDraft('')
  }

  async function saveModalNote() {
    if (!selectedOrder) return
    setModalNoteSaving(true)
    const ok = await updateOrder(selectedOrder.id, { notes: modalNoteDraft })
    setModalNoteSaving(false)
    if (ok && selectedOrder.driver_id && modalNoteDraft.trim()) {
      sendNotifyPush({
        driverId: selectedOrder.driver_id,
        event: 'note_added',
        customerName: selectedOrder.customer_name,
        address: selectedOrder.service_address || selectedOrder.pickup_address,
        note: modalNoteDraft.trim(),
      })
    }
  }

  function handleDragStart(orderId: string, fromColumnKey: string) {
    setDragState({ orderId, fromColumnKey })
  }

  function handleDragEnd() {
    setDragState(null)
    setDropTarget(null)
  }

  function allowDrop(event: React.DragEvent<HTMLDivElement>, columnKey: string, beforeId: string | null) {
    event.preventDefault()
    if (!dragState) return
    setDropTarget({ columnKey, beforeId })
  }

  async function saveDriverRouteOrder(driverId: string, orderedIds: string[]) {
    for (let index = 0; index < orderedIds.length; index += 1) {
      const orderId = orderedIds[index]
      const { error } = await supabase
        .from(TABLE_NAME)
        .update({ driver_id: driverId, route_position: index + 1, status: 'assigned' })
        .eq('id', orderId)

      if (error) {
        setPageError(error.message)
        return false
      }
    }
    return true
  }

  async function moveOrderToColumn(movingOrderId: string, targetColumnKey: string, beforeId: string | null) {
    const movingOrder = orders.find((order) => order.id === movingOrderId)
    if (!movingOrder || movingOrder.status === 'completed') return

    const previousDriverId = movingOrder.driver_id
    const nextDriverId = targetColumnKey === 'unassigned' ? null : targetColumnKey

    if (!nextDriverId) {
      const ok = await updateOrder(movingOrderId, { driver_id: null, route_position: null, status: 'unassigned' })
      if (!ok) return

      if (previousDriverId) {
        await normalizeRoutePositionsForDriver(previousDriverId)
      }
      await refreshAll()
      return
    }

    const targetOrders = boardOrders
      .filter((order) => order.driver_id === nextDriverId && order.id !== movingOrderId && order.status !== 'completed')
      .sort((a, b) => {
        const aPos = a.route_position ?? Number.MAX_SAFE_INTEGER
        const bPos = b.route_position ?? Number.MAX_SAFE_INTEGER
        return aPos - bPos
      })

    const targetIds = targetOrders.map((order) => order.id)
    const reorderedIds = reorderIds(targetIds, movingOrderId, beforeId)

    const updateMovingOrder = await supabase
      .from(TABLE_NAME)
      .update({ driver_id: nextDriverId, status: 'assigned' })
      .eq('id', movingOrderId)

    if (updateMovingOrder.error) {
      setPageError(updateMovingOrder.error.message)
      return
    }

    const saved = await saveDriverRouteOrder(nextDriverId, reorderedIds)
    if (!saved) return

    if (previousDriverId && previousDriverId !== nextDriverId) {
      await normalizeRoutePositionsForDriver(previousDriverId)
    }

    await syncDriverStatuses(nextDriverId)
    if (previousDriverId && previousDriverId !== nextDriverId) {
      await syncDriverStatuses(previousDriverId)
    }

    await refreshAll()
  }

  async function handleDrop(event: React.DragEvent<HTMLDivElement>, targetColumnKey: string, beforeId: string | null) {
    event.preventDefault()
    if (!dragState) return

    const movingOrderId = dragState.orderId
    setDropTarget(null)
    setDragState(null)

    await moveOrderToColumn(movingOrderId, targetColumnKey, beforeId)
  }

  function setQuickField(field: keyof QuickOrderForm, value: string) {
    setQuickForm((prev) => ({ ...prev, [field]: value }))
  }

  const quickCustomerJobSites = useMemo(() => {
    return jobSites.filter((site) => site.customer_id === quickForm.customer_id)
  }, [jobSites, quickForm.customer_id])

  const quickBinsAtJobSite = useMemo(() => {
    const addr = (quickForm.pickup_address || '').trim().toLowerCase()
    if (!addr) return []
    return bins.filter((bin) => {
      return (bin.location || '').trim().toLowerCase() === addr && bin.status === 'in_use'
    })
  }, [bins, quickForm.pickup_address])

  const quickExistingBins = useMemo(() => {
    if (quickForm.order_type === 'EXCHANGE' || quickForm.order_type === 'REMOVAL' || quickForm.order_type === 'DUMP RETURN') {
      return quickBinsAtJobSite
    }
    return []
  }, [quickBinsAtJobSite, quickForm.order_type])

  useEffect(() => {
    if (quickExistingBins.length === 1) {
      const bin = quickExistingBins[0]
      setQuickForm((prev) => ({
        ...prev,
        bin_size: bin.bin_size || prev.bin_size,
        bin_number: bin.bin_number ? String(bin.bin_number) : prev.bin_number,
      }))
    }
  }, [quickExistingBins])

  function handleQuickCustomerChange(customerId: string) {
    const customer = customers.find((c) => c.id === customerId)
    setQuickForm((prev) => ({
      ...prev,
      customer_id: customerId,
      customer_name: customer?.name || '',
      job_site_id: '',
      pickup_address: '',
    }))
  }

  function handleQuickJobSiteAddressInput(address: string) {
    const matched = quickCustomerJobSites.find(
      (site) => (site.address || '').trim().toLowerCase() === address.trim().toLowerCase()
    )
    setQuickForm((prev) => ({
      ...prev,
      pickup_address: address,
      job_site_id: matched?.id || '',
    }))
  }

  async function handleQuickCreate() {
    setQuickError('')

    if (!quickForm.customer_name.trim()) {
      setQuickError('Customer name is required.')
      return
    }
    if (!quickForm.pickup_address.trim()) {
      setQuickError('Job site address is required.')
      return
    }

    setQuickSaving(true)

    const driverForAssign = quickForm.driver_id ? drivers.find((d) => d.id === quickForm.driver_id) : null
    const status = driverForAssign ? 'assigned' : 'unassigned'

    const maxRoute = quickForm.driver_id
      ? boardOrders
          .filter((o) => o.driver_id === quickForm.driver_id && o.status !== 'completed')
          .reduce((max, o) => Math.max(max, o.route_position || 0), 0)
      : 0

    const isMultiStep = quickForm.order_type === 'DUMP RETURN' || quickForm.order_type === 'EXCHANGE' || quickForm.order_type === 'REMOVAL'
    const ticketBase = generateTicketNumber()

    const step1Payload = {
      ticket_number: ticketBase,
      customer_id: quickForm.customer_id || null,
      customer_name: quickForm.customer_name.trim(),
      job_site_id: quickForm.job_site_id || null,
      pickup_address: quickForm.pickup_address.trim(),
      service_address: quickForm.pickup_address.trim(),
      order_type: quickForm.order_type,
      bin_size: quickForm.bin_size,
      bin_type: quickForm.bin_type,
      bin_number: quickForm.bin_number || null,
      dump_site_address: quickForm.dump_site_address || null,
      scheduled_date: quickForm.scheduled_date,
      service_time: quickForm.service_time || null,
      driver_id: quickForm.driver_id || null,
      route_position: quickForm.driver_id ? maxRoute + 1 : null,
      status,
      notes: quickForm.notes || null,
      workflow_step: isMultiStep ? 'PICKUP' : 'MAIN',
    }

    const { data: step1Data, error } = await supabase.from('order').insert(step1Payload).select('id').single()

    if (error) {
      setQuickError(error.message)
      setQuickSaving(false)
      return
    }

    // Create the dump step automatically for multi-step order types
    if (isMultiStep && quickForm.dump_site_address.trim()) {
      const step2Payload = {
        ticket_number: `${ticketBase}-DUMP`,
        customer_id: quickForm.customer_id || null,
        customer_name: quickForm.customer_name.trim(),
        job_site_id: quickForm.job_site_id || null,
        pickup_address: quickForm.dump_site_address.trim(),
        service_address: quickForm.dump_site_address.trim(),
        dump_site_address: quickForm.dump_site_address.trim(),
        order_type: quickForm.order_type,
        bin_size: quickForm.bin_size,
        bin_type: quickForm.bin_type,
        bin_number: quickForm.bin_number || null,
        scheduled_date: quickForm.scheduled_date,
        service_time: quickForm.service_time || null,
        driver_id: quickForm.driver_id || null,
        route_position: quickForm.driver_id ? maxRoute + 2 : null,
        status,
        notes: `Dump step — bin picked up from ${quickForm.pickup_address.trim()}`,
        workflow_step: 'DUMP',
        parent_order_id: step1Data.id,
      }
      const { error: step2Error } = await supabase.from('order').insert(step2Payload)
      if (step2Error) {
        setQuickError(`Step 1 created but dump step failed: ${step2Error.message}`)
        setQuickSaving(false)
        return
      }
    }

    if (quickForm.driver_id) {
      await syncDriverStatuses(quickForm.driver_id)
    }

    setQuickSaving(false)
    setQuickCreateOpen(false)
    setQuickForm(emptyQuickForm())
    await refreshAll()
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="mx-auto max-w-[1920px] p-3 md:p-4">
        {/* Header */}
        <div className="mb-4 rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-slate-200">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <AppLogo className="h-9 w-auto" />
              <div>
                <h1 className="text-lg font-bold tracking-tight text-slate-900">Dispatch Board</h1>
                <p className="text-xs text-slate-400">Planning: {formatBoardDayLabel(selectedDayKey)}</p>
              </div>

              {/* Stats inline */}
              <div className="hidden md:flex items-center gap-2">
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-center">
                  <div className="text-[10px] font-semibold uppercase text-slate-400">Unassigned</div>
                  <div className="text-base font-bold text-slate-900">{stats.unassigned}</div>
                </div>
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-center">
                  <div className="text-[10px] font-semibold uppercase text-emerald-600">Available</div>
                  <div className="text-base font-bold text-emerald-900">{stats.available}</div>
                </div>
                <div className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-1.5 text-center">
                  <div className="text-[10px] font-semibold uppercase text-blue-600">Active</div>
                  <div className="text-base font-bold text-blue-900">{stats.activeDrivers}</div>
                </div>
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-1.5 text-center">
                  <div className="text-[10px] font-semibold uppercase text-amber-600">In Progress</div>
                  <div className="text-base font-bold text-amber-900">{stats.inProgress}</div>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search ticket, customer, address…"
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-slate-400 w-56"
              />

              <button
                type="button"
                onClick={() => setSelectedDayKey(todayKey)}
                className={`rounded-xl border px-3 py-1.5 text-xs font-bold transition ${
                  selectedDayKey === todayKey
                    ? 'border-slate-900 bg-slate-900 text-white'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => setSelectedDayKey(tomorrowKey)}
                className={`rounded-xl border px-3 py-1.5 text-xs font-bold transition ${
                  selectedDayKey === tomorrowKey
                    ? 'border-slate-900 bg-slate-900 text-white'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                Tomorrow
              </button>

              <button
                type="button"
                onClick={() => { setQuickForm(emptyQuickForm()); setQuickError(''); setQuickCreateOpen(true) }}
                className="rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-bold text-white transition hover:opacity-90"
              >
                + New Order
              </button>

              <button
                onClick={refreshAll}
                className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-slate-50"
              >
                Refresh
              </button>

              <Link
                href="/dashboard"
                className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
              >
                Dashboard
              </Link>

            </div>
          </div>

          {pageError ? (
            <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {pageError}
            </div>
          ) : null}
        </div>

        {/* Board */}
        {loading ? (
          <div className="rounded-2xl bg-white p-10 text-center text-sm text-slate-500 shadow-sm ring-1 ring-slate-200">
            Loading dispatch board...
          </div>
        ) : (
          <div className="flex gap-3 items-start">
            {/* Unassigned panel — fixed width sidebar */}
            <div className="w-72 shrink-0 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200">
              <div className="mb-2 flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-600">Unassigned</h2>
                <span className="rounded-full bg-white px-2 py-0.5 text-xs font-bold text-slate-700 ring-1 ring-slate-200">
                  {unassignedOrders.length}
                </span>
              </div>

              <div
                className={`h-[calc(100vh-160px)] overflow-y-auto rounded-xl p-1 transition ${
                  dropTarget?.columnKey === 'unassigned' && dropTarget.beforeId === null ? 'bg-sky-50' : ''
                }`}
                onDragOver={(e) => allowDrop(e, 'unassigned', null)}
                onDrop={(e) => handleDrop(e, 'unassigned', null)}
              >
                <div className="space-y-1.5">
                  {unassignedOrders.map((order) => {
                    const showTopDrop = dropTarget?.columnKey === 'unassigned' && dropTarget.beforeId === order.id

                    return (
                      <div key={order.id}>
                        <div
                          onDragOver={(e) => allowDrop(e, 'unassigned', order.id)}
                          onDrop={(e) => handleDrop(e, 'unassigned', order.id)}
                          className={`mb-1 rounded-lg border-2 border-dashed py-0.5 text-center text-[10px] font-semibold transition ${
                            showTopDrop ? 'border-sky-300 bg-sky-50 text-sky-700' : 'border-transparent text-transparent'
                          }`}
                        >
                          Drop here
                        </div>

                        <div
                          draggable={order.status !== 'completed'}
                          onDragStart={() => handleDragStart(order.id, 'unassigned')}
                          onDragEnd={handleDragEnd}
                          onClick={() => openOrder(order.id)}
                          className="cursor-pointer rounded-xl border border-slate-200 bg-white px-3 py-2 text-left shadow-sm transition hover:shadow-md hover:border-slate-300"
                        >
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className="text-[10px] font-bold text-slate-400">
                              {order.ticket_number || `#${order.id.slice(0, 6)}`}
                            </span>
                            <span className={`rounded-full border px-1.5 py-0.5 text-[9px] font-bold ${statusStyles[order.status || 'unassigned'] || statusStyles.unassigned}`}>
                              {formatStatus(order.status || 'unassigned')}
                            </span>
                          </div>

                          <div className="line-clamp-1 text-sm font-bold text-slate-900">
                            {order.customer_name || 'No customer'}
                          </div>
                          <div className="line-clamp-1 text-xs text-slate-500 mt-0.5">
                            {getOrderDestination(order)}
                          </div>
                          <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-400">
                            {order.order_type && <span className="font-semibold">{order.order_type}</span>}
                            {order.bin_size && <span>{order.bin_size}yd</span>}
                            {(order.service_time || order.service_window) && (
                              <span>{formatServiceTime(order.service_time || order.service_window)}</span>
                            )}
                          </div>

                          <div className="mt-2" onClick={(e) => e.stopPropagation()}>
                            <select
                              value={assignSelections[order.id] || ''}
                              onChange={(e) => {
                                const driverId = e.target.value
                                setAssignSelections((current) => ({ ...current, [order.id]: driverId }))
                                if (driverId) void handleAssign(order.id, driverId)
                              }}
                              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs text-slate-800 outline-none focus:border-slate-400"
                            >
                              <option value="">Assign driver…</option>
                              {assignableDrivers.map((driver) => (
                                <option key={driver.id} value={driver.id}>
                                  {driver.name || 'Unnamed Driver'}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </div>
                    )
                  })}

                  {unassignedOrders.length === 0 && (
                    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-xs text-slate-400">
                      No unassigned orders
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Drivers panel — fills remaining space, scrollable grid */}
            <div className="flex-1 min-w-0 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200">
              <div className="mb-2 flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-600">Drivers</h2>
                <span className="rounded-full bg-white px-2 py-0.5 text-xs font-bold text-slate-700 ring-1 ring-slate-200">
                  {orderedDrivers.length}
                </span>
              </div>

              <div className="h-[calc(100vh-160px)] overflow-y-auto">
                <div className="grid gap-2 grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
                  {orderedDrivers.map((driver) => {
                    const driverOrders = driverOrdersMap[driver.id] || []
                    const lastOrder = driverLastOrderMap[driver.id]
                    const canDropOnDriver = dropTarget?.columnKey === driver.id && dropTarget.beforeId === null
                    const showLastOrder = driverOrders.length === 0 || driver.status === 'heading_back'

                    return (
                      <div key={driver.id}>
                        <div
                          onDragOver={(e) => allowDrop(e, driver.id, null)}
                          onDrop={(e) => handleDrop(e, driver.id, null)}
                          className={`mb-1 rounded-lg border-2 border-dashed py-0.5 text-center text-[10px] font-semibold transition ${
                            canDropOnDriver ? 'border-sky-300 bg-sky-50 text-sky-700' : 'border-transparent text-transparent'
                          }`}
                        >
                          Drop here
                        </div>

                        <div className={`rounded-xl p-2.5 ring-1 ${getDriverColumnStyle(driver.status)}`}>
                          {/* Driver name + status */}
                          <div className="mb-1.5">
                            <div className="line-clamp-1 text-sm font-bold text-slate-900">
                              {driver.name || 'Unnamed'}
                            </div>
                            <div className="flex items-center gap-1 mt-0.5">
                              <span className={`rounded-full border px-1.5 py-0.5 text-[9px] font-bold ${driverStatusStyles[driver.status || 'available'] || driverStatusStyles.available}`}>
                                {formatDriverStatus(driver.status)}
                              </span>
                              <span className="rounded-full border border-slate-200 bg-white px-1.5 py-0.5 text-[9px] font-bold text-slate-600">
                                {driverOrders.length}j
                              </span>
                            </div>
                          </div>

                          {/* HB / Park / STOP — full width, compact */}
                          <div className="grid grid-cols-3 gap-1 mb-2">
                            <button
                              type="button"
                              onClick={() => void setDriverOperationalStatus(driver.id, 'heading_back')}
                              className={`rounded-lg py-1 text-[10px] font-bold transition ${
                                driver.status === 'heading_back'
                                  ? 'bg-blue-600 text-white'
                                  : 'border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100'
                              }`}
                            >
                              HB
                            </button>
                            <button
                              type="button"
                              onClick={() => void setDriverOperationalStatus(driver.id, 'parked')}
                              className={`rounded-lg py-1 text-[10px] font-bold transition ${
                                driver.status === 'parked'
                                  ? 'bg-slate-600 text-white'
                                  : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                              }`}
                            >
                              Park
                            </button>
                            <button
                              type="button"
                              onClick={() => void setDriverOperationalStatus(driver.id, 'available')}
                              className={`rounded-lg py-1 text-[10px] font-bold transition ${
                                driver.status === 'available'
                                  ? 'bg-emerald-600 text-white'
                                  : 'border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                              }`}
                            >
                              STOP
                            </button>
                          </div>

                          {showLastOrder && (
                            <div className="mb-1.5 rounded-lg border border-slate-200 bg-white px-2 py-1">
                              <div className="text-[9px] font-bold uppercase text-slate-400">Last</div>
                              <div className="line-clamp-2 text-[10px] text-slate-600 mt-0.5">
                                {getLastOrderSummary(lastOrder)}
                              </div>
                            </div>
                          )}

                          {/* All orders — no cap */}
                          {driverOrders.length > 0 ? (
                            <div className="space-y-1">
                              {driverOrders.map((order, index) => (
                                <div
                                  key={order.id}
                                  onDragOver={(e) => allowDrop(e, driver.id, order.id)}
                                  onDrop={(e) => handleDrop(e, driver.id, order.id)}
                                  draggable={order.status !== 'completed'}
                                  onDragStart={() => handleDragStart(order.id, driver.id)}
                                  onDragEnd={handleDragEnd}
                                  onClick={() => openOrder(order.id)}
                                  className={`cursor-pointer rounded-lg border px-2 py-1.5 transition hover:border-slate-300 ${
                                    dropTarget?.columnKey === driver.id && dropTarget.beforeId === order.id
                                      ? 'border-sky-300 bg-sky-50'
                                      : 'border-slate-200 bg-white'
                                  }`}
                                >
                                  <div className="flex items-start justify-between gap-1">
                                    <div className="min-w-0 flex-1">
                                      <div className="line-clamp-1 text-[11px] font-semibold text-slate-900">
                                        <span className="text-slate-400 mr-0.5">{index + 1}.</span>
                                        {order.customer_name || 'No customer'}
                                      </div>
                                      <div className="line-clamp-1 text-[10px] text-slate-500 mt-0.5">
                                        {getOrderDestination(order)}
                                      </div>
                                      {order.order_type && (
                                        <div className="text-[9px] font-semibold text-slate-400 mt-0.5">{order.order_type}{order.bin_size ? ` · ${order.bin_size}yd` : ''}</div>
                                      )}
                                    </div>
                                    <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-bold ${statusStyles[order.status || 'assigned'] || statusStyles.assigned}`}>
                                      {formatStatus(order.status)}
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="rounded-lg border border-dashed border-slate-200 bg-white py-3 text-center text-[10px] text-slate-400">
                              No orders
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}

                  {orderedDrivers.length === 0 && (
                    <div className="col-span-full rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-400">
                      No drivers found
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Order detail modal */}
        {modalOpen && selectedOrder ? (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4"
            onClick={closeOrderModal}
          >
            <div
              className="relative flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-[28px] bg-white shadow-2xl ring-1 ring-slate-200"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Ticket Number</div>
                  <div className="mt-1 text-2xl font-bold text-slate-900">
                    {displayValue(selectedOrder.ticket_number || `#${selectedOrder.id.slice(0, 8)}`)}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={closeOrderModal}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Close
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-6 py-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <DetailItem label="Customer" value={selectedOrder.customer_name} />
                  <DetailItem
                    label="Driver"
                    value={selectedOrder.driver_id ? driverMap[selectedOrder.driver_id]?.name || 'Assigned' : 'Unassigned'}
                  />
                  <DetailItem label="Service Address" value={selectedOrder.service_address || selectedOrder.pickup_address} />
                  <DetailItem label="Scheduled Date" value={formatDate(selectedOrder.scheduled_date)} />
                  <DetailItem label="Service Time" value={formatServiceTime(selectedOrder.service_time)} />
                  <DetailItem label="Order Type" value={selectedOrder.order_type} />
                  <DetailItem label="Bin Size" value={selectedOrder.bin_size} />
                  <DetailItem label="Bin Type" value={selectedOrder.bin_type} />
                </div>

                <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Dispatcher Notes
                  </div>
                  <textarea
                    value={modalNoteDraft}
                    onChange={(e) => setModalNoteDraft(e.target.value)}
                    rows={3}
                    placeholder="Add a note for the driver…"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-slate-400 resize-none"
                  />
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="text-xs text-slate-400">
                      {selectedOrder.driver_id ? 'Driver will be notified.' : 'Assign a driver to notify them.'}
                    </span>
                    <button
                      type="button"
                      onClick={saveModalNote}
                      disabled={modalNoteSaving}
                      className="rounded-xl bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
                    >
                      {modalNoteSaving ? 'Saving…' : 'Save & Notify'}
                    </button>
                  </div>
                </div>

                {selectedOrder.driver_notes && (
                  <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-amber-700">Driver Comment</div>
                    <div className="mt-2 whitespace-pre-wrap text-sm text-slate-900">{selectedOrder.driver_notes}</div>
                  </div>
                )}

                {selectedOrder.delivery_photo_url && (
                  <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Delivery Photo</div>
                    <a href={selectedOrder.delivery_photo_url} target="_blank" rel="noreferrer">
                      <img
                        src={selectedOrder.delivery_photo_url}
                        alt="Delivery"
                        className="w-full max-h-56 rounded-xl object-cover border border-slate-200 hover:opacity-90 transition cursor-pointer"
                      />
                    </a>
                    <p className="mt-1 text-xs text-slate-400">Click to open full size</p>
                  </div>
                )}

                <div className="mt-6 grid gap-3 md:grid-cols-2">
                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Assign Driver
                    </label>
                    <select
                      value={selectedOrder.driver_id || ''}
                      onChange={(e) => handleAssign(selectedOrder.id, e.target.value)}
                      disabled={selectedOrder.status === 'completed'}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 outline-none disabled:cursor-not-allowed disabled:opacity-60 focus:border-slate-400"
                    >
                      <option value="">Unassigned</option>
                      {assignableDrivers.map((driver) => (
                        <option key={driver.id} value={driver.id}>
                          {driver.name || 'Unnamed Driver'}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Update Status
                    </label>
                    <select
                      value={selectedOrder.status || 'unassigned'}
                      onChange={async (e) => {
                        const newStatus = e.target.value
                        const ok = await updateOrder(selectedOrder.id, { status: newStatus })
                        if (ok && selectedOrder.driver_id) {
                          sendNotifyPush({
                            driverId: selectedOrder.driver_id,
                            event: 'status_changed',
                            status: newStatus,
                            customerName: selectedOrder.customer_name,
                            address: selectedOrder.service_address || selectedOrder.pickup_address,
                          })
                        }
                      }}
                      disabled={selectedOrder.status === 'completed'}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 outline-none disabled:cursor-not-allowed disabled:opacity-60 focus:border-slate-400"
                    >
                      <option value="unassigned">Unassigned</option>
                      <option value="assigned">Assigned</option>
                      <option value="in_progress">In Progress</option>
                      <option value="completed">Completed</option>
                      <option value="issue">Issue</option>
                    </select>

                    {selectedOrder.status === 'completed' ? (
                      <p className="mt-2 text-xs font-medium text-emerald-700">Completed orders are read-only for dispatch.</p>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-200 bg-slate-50 px-6 py-4">
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={closeOrderModal}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {/* Quick-create order modal */}
        {quickCreateOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
            onClick={() => setQuickCreateOpen(false)}
          >
            <div
              className="w-full max-w-lg rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200 overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Dispatch</div>
                  <h2 className="text-lg font-bold text-slate-900">New Order</h2>
                </div>
                <button
                  type="button"
                  onClick={() => setQuickCreateOpen(false)}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Close
                </button>
              </div>

              <div className="px-5 py-4 space-y-3 max-h-[75vh] overflow-y-auto">
                {quickError && (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                    {quickError}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="mb-1 block text-xs font-semibold text-slate-600">Customer *</label>
                    <select
                      value={quickForm.customer_id}
                      onChange={(e) => handleQuickCustomerChange(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400"
                    >
                      <option value="">— Select customer —</option>
                      {customers.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                    {!quickForm.customer_id && (
                      <input
                        value={quickForm.customer_name}
                        onChange={(e) => setQuickField('customer_name', e.target.value)}
                        placeholder="Or type name manually"
                        className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
                      />
                    )}
                  </div>

                  <div className="col-span-2">
                    <label className="mb-1 block text-xs font-semibold text-slate-600">
                      Job Site Address *
                      {quickForm.job_site_id && (
                        <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">Saved Site</span>
                      )}
                    </label>
                    {quickCustomerJobSites.length > 0 ? (
                      <>
                        <input
                          list="quick-job-sites"
                          value={quickForm.pickup_address}
                          onChange={(e) => handleQuickJobSiteAddressInput(e.target.value)}
                          placeholder="Type or pick a saved site"
                          className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400"
                        />
                        <datalist id="quick-job-sites">
                          {quickCustomerJobSites.map((site) => (
                            <option key={site.id} value={site.address || ''}>{site.site_name}</option>
                          ))}
                        </datalist>
                      </>
                    ) : (
                      <input
                        value={quickForm.pickup_address}
                        onChange={(e) => setQuickField('pickup_address', e.target.value)}
                        placeholder="e.g. 350 Keele St, Toronto"
                        className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400"
                      />
                    )}
                    {quickExistingBins.length > 0 && (
                      <div className="mt-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-800">
                        {quickExistingBins.length === 1
                          ? `Bin on site: #${quickExistingBins[0].bin_number} (${quickExistingBins[0].bin_size} yd) — auto-filled`
                          : `${quickExistingBins.length} bins on site — select below`}
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-600">Order Type</label>
                    <select
                      value={quickForm.order_type}
                      onChange={(e) => setQuickField('order_type', e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400"
                    >
                      <option>DELIVERY</option>
                      <option>EXCHANGE</option>
                      <option>REMOVAL</option>
                      <option>DUMP RETURN</option>
                    </select>
                  </div>

                  {(quickForm.order_type === 'DUMP RETURN' || quickForm.order_type === 'EXCHANGE' || quickForm.order_type === 'REMOVAL') && (
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-slate-600">Bin Number</label>
                      <input
                        type="text"
                        value={quickForm.bin_number}
                        onChange={(e) => setQuickField('bin_number', e.target.value)}
                        placeholder="e.g. 001"
                        className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400"
                      />
                    </div>
                  )}

                  {(quickForm.order_type === 'DUMP RETURN' || quickForm.order_type === 'EXCHANGE' || quickForm.order_type === 'REMOVAL') && (
                    <div className="col-span-2">
                      <label className="mb-1 block text-xs font-semibold text-slate-600">Dump Site Address</label>
                      <input
                        type="text"
                        value={quickForm.dump_site_address}
                        onChange={(e) => setQuickField('dump_site_address', e.target.value)}
                        placeholder="Where is the bin being dumped?"
                        className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400"
                      />
                    </div>
                  )}

                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-600">Bin Size</label>
                    <select
                      value={quickForm.bin_size}
                      onChange={(e) => setQuickField('bin_size', e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400"
                    >
                      {['6','8','10','12','14','15','20','30','40'].map((s) => (
                        <option key={s} value={s}>{s} Yard</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-600">Material</label>
                    <select
                      value={quickForm.bin_type}
                      onChange={(e) => setQuickField('bin_type', e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400"
                    >
                      <option>Garbage</option>
                      <option>Recycling</option>
                      <option>Mixed</option>
                      <option>Clean Fill</option>
                    </select>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-600">Time</label>
                    <input
                      type="time"
                      value={quickForm.service_time}
                      onChange={(e) => setQuickField('service_time', e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-600">Date</label>
                    <div className="flex gap-1.5 mb-1.5">
                      <button type="button" onClick={() => setQuickField('scheduled_date', toLocalDayKeyLocal(new Date()))}
                        className={`flex-1 rounded-lg border px-2 py-1.5 text-xs font-bold transition ${quickForm.scheduled_date === toLocalDayKeyLocal(new Date()) ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-700'}`}>
                        Today
                      </button>
                      <button type="button" onClick={() => { const t = new Date(); t.setDate(t.getDate()+1); setQuickField('scheduled_date', toLocalDayKeyLocal(t)) }}
                        className={`flex-1 rounded-lg border px-2 py-1.5 text-xs font-bold transition ${quickForm.scheduled_date !== toLocalDayKeyLocal(new Date()) ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-700'}`}>
                        Tomorrow
                      </button>
                    </div>
                    <input
                      type="date"
                      value={quickForm.scheduled_date}
                      onChange={(e) => setQuickField('scheduled_date', e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
                    />
                  </div>

                  <div className="col-span-2">
                    <label className="mb-1 block text-xs font-semibold text-slate-600">Assign Driver (optional)</label>
                    <select
                      value={quickForm.driver_id}
                      onChange={(e) => setQuickField('driver_id', e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400"
                    >
                      <option value="">Unassigned</option>
                      {assignableDrivers.map((driver) => (
                        <option key={driver.id} value={driver.id}>
                          {driver.name || 'Unnamed Driver'}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="col-span-2">
                    <label className="mb-1 block text-xs font-semibold text-slate-600">Notes</label>
                    <textarea
                      rows={2}
                      value={quickForm.notes}
                      onChange={(e) => setQuickField('notes', e.target.value)}
                      placeholder="Special instructions…"
                      className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400 resize-none"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
                <button
                  type="button"
                  onClick={() => setQuickCreateOpen(false)}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleQuickCreate}
                  disabled={quickSaving}
                  className="rounded-xl bg-slate-900 px-5 py-2 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-60"
                >
                  {quickSaving ? 'Creating…' : 'Create Order'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
