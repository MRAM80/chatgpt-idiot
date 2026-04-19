'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
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

function getWorkflowLabel(step?: string | null) {
  if (step === 'DUMP') return { label: 'Dump Site', color: 'bg-orange-100 text-orange-700' }
  if (step === 'RETURN') return { label: 'Return', color: 'bg-blue-100 text-blue-700' }
  return { label: 'Job Site', color: 'bg-emerald-100 text-emerald-700' }
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

function DragHandleIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
      <path d="M7 4.5A1.5 1.5 0 1 1 4 4.5a1.5 1.5 0 0 1 3 0Zm0 5.5A1.5 1.5 0 1 1 4 10a1.5 1.5 0 0 1 3 0Zm-1.5 7A1.5 1.5 0 1 0 5.5 14a1.5 1.5 0 0 0 0 3Zm10-12.5a1.5 1.5 0 1 1-3 0a1.5 1.5 0 0 1 3 0Zm-1.5 7a1.5 1.5 0 1 0 0-3a1.5 1.5 0 0 0 0 3Zm1.5 4a1.5 1.5 0 1 1-3 0a1.5 1.5 0 0 1 3 0Z" />
    </svg>
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

export default function DispatchBoardPage() {
  const supabase = useMemo(() => createClient(), [])

  const [orders, setOrders] = useState<Order[]>([])
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [loading, setLoading] = useState(true)
  const [pageError, setPageError] = useState('')
  const [search, setSearch] = useState('')
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [dragState, setDragState] = useState<DragState>(null)
  const [dropTarget, setDropTarget] = useState<{ columnKey: string; beforeId: string | null } | null>(null)
  const [assignSelections, setAssignSelections] = useState<Record<string, string>>({})
  const [selectedDayKey, setSelectedDayKey] = useState(getTodayKey())

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
      .select('id,ticket_number,customer_name,pickup_address,service_address,service_time,workflow_step,parent_order_id,dump_site_address,service_window,bin_id,old_bin_id,bin_size,bin_type,order_type,scheduled_date,driver_id,route_position,status,notes,created_at,updated_at,completed_by,completed_at')
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

  async function refreshAll() {
    setPageError('')
    await Promise.all([loadDrivers(), loadOrders()])
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
        return (
          driver.status === 'available' ||
          driver.status === 'busy'
        )
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

    if (driverId) {
      const canAssignToday =
        selectedDayKey !== todayKey ||
        selectedDriver?.status === 'available' ||
        selectedDriver?.status === 'busy'

      if (!canAssignToday) {
        setPageError('Today orders can only be assigned to available drivers.')
        return
      }
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
    const total = boardOrders.length
    const unassigned = boardOrders.filter((order) => !order.driver_id && order.status !== 'completed').length
    const activeDriverIds = new Set(
      boardOrders.filter((order) => order.driver_id && order.status !== 'completed').map((order) => order.driver_id as string)
    )
    const inProgress = boardOrders.filter((order) => order.status === 'in_progress').length
    const completed = boardOrders.filter((order) => order.status === 'completed').length
    return { total, unassigned, activeDrivers: activeDriverIds.size, inProgress, completed }
  }, [boardOrders])

  function openOrder(orderId: string) {
    setSelectedOrderId(orderId)
    setModalOpen(true)
  }

  function closeOrderModal() {
    setModalOpen(false)
    setSelectedOrderId(null)
  }

  function handleDragStart(event: React.DragEvent<HTMLButtonElement>, orderId: string, fromColumnKey: string) {
    event.stopPropagation()
    setDragState({ orderId, fromColumnKey })
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', orderId)
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

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="mx-auto max-w-[1800px] p-4 md:p-6">
        <div className="mb-6 flex flex-col gap-4 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">Dispatch Board</h1>
              <p className="text-sm text-slate-500">Driver-based route planning and daily workflow monitoring</p>
              <p className="mt-1 text-xs font-medium text-slate-400">Planning day: {formatBoardDayLabel(selectedDayKey)}</p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Link
                href="/dashboard"
                className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Back to Dashboard
              </Link>

              <Link
                href="/order?newOrder=1"
                className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
              >
                New Order
              </Link>

              <button
                onClick={refreshAll}
                className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Refresh
              </button>
            </div>
          </div>

          {pageError ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {pageError}
            </div>
          ) : null}

          <div className="grid gap-4 md:grid-cols-5">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Total Orders</div>
              <div className="mt-2 text-2xl font-bold text-slate-900">{stats.total}</div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Unassigned</div>
              <div className="mt-2 text-2xl font-bold text-slate-900">{stats.unassigned}</div>
            </div>

            <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
              <div className="text-xs font-medium uppercase tracking-wide text-blue-700">Active Drivers</div>
              <div className="mt-2 text-2xl font-bold text-blue-900">{stats.activeDrivers}</div>
            </div>

            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <div className="text-xs font-medium uppercase tracking-wide text-amber-700">In Progress</div>
              <div className="mt-2 text-2xl font-bold text-amber-900">{stats.inProgress}</div>
            </div>

            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <div className="text-xs font-medium uppercase tracking-wide text-emerald-700">Completed</div>
              <div className="mt-2 text-2xl font-bold text-emerald-900">{stats.completed}</div>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search ticket, customer, address, or driver"
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none ring-0 placeholder:text-slate-400 focus:border-slate-400"
            />

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setSelectedDayKey(todayKey)}
                className={`rounded-2xl border px-4 py-3 text-sm font-semibold transition ${
                  selectedDayKey === todayKey
                    ? 'border-slate-900 bg-slate-900 text-white'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                Today · {formatBoardDayLabel(todayKey)}
              </button>
              <button
                type="button"
                onClick={() => setSelectedDayKey(tomorrowKey)}
                className={`rounded-2xl border px-4 py-3 text-sm font-semibold transition ${
                  selectedDayKey === tomorrowKey
                    ? 'border-slate-900 bg-slate-900 text-white'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                Tomorrow · {formatBoardDayLabel(tomorrowKey)}
              </button>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="rounded-3xl bg-white p-10 text-center text-sm text-slate-500 shadow-sm ring-1 ring-slate-200">
            Loading dispatch board...
          </div>
        ) : (
          <div
            className="grid gap-4"
            style={{ gridTemplateColumns: `repeat(${Math.max(boardColumns.length, 1)}, minmax(300px, 1fr))` }}
          >
            {boardColumns.map((column) => {
              const columnOrders = groupedOrders[column.key] || []

              return (
                <div
                  key={column.key}
                  className={`min-h-[420px] rounded-3xl p-4 shadow-sm ring-1 ${
                    column.type === 'driver'
                      ? getDriverColumnStyle(driverMap[column.key]?.status)
                      : 'bg-white ring-slate-200'
                  }`}
                >
                  <div className="mb-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-800">{column.label}</h2>
                          {column.type === 'driver' ? (
                            <span
                              className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${
                                driverStatusStyles[driverMap[column.key]?.status || 'available'] || driverStatusStyles.available
                              }`}
                            >
                              {formatDriverStatus(driverMap[column.key]?.status)}
                            </span>
                          ) : null}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {column.type === 'driver' ? (
                          <>
                            <button
                              type="button"
                              onClick={() => void setDriverOperationalStatus(column.key, 'heading_back')}
                              className="rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-bold text-blue-700 transition hover:bg-blue-100"
                              title="Heading Back"
                            >
                              HB
                            </button>
                            <button
                              type="button"
                              onClick={() => void setDriverOperationalStatus(column.key, 'parked')}
                              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-700 transition hover:bg-slate-100"
                              title="Park"
                            >
                              Park
                            </button>
                          </>
                        ) : null}

                        <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
                          {columnOrders.length}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div
                    className={`space-y-2 rounded-2xl p-1 transition ${
                      dropTarget?.columnKey === column.key && dropTarget.beforeId === null ? 'bg-sky-50' : ''
                    }`}
                    onDragOver={(e) => allowDrop(e, column.key, null)}
                    onDrop={(e) => handleDrop(e, column.key, null)}
                  >
                    {columnOrders.map((order) => {
                      const assignedDriver = order.driver_id ? driverMap[order.driver_id] : null
                      const showTopDrop = dropTarget?.columnKey === column.key && dropTarget.beforeId === order.id

                      return (
                        <div key={order.id}>
                          <div
                            onDragOver={(e) => allowDrop(e, column.key, order.id)}
                            onDrop={(e) => handleDrop(e, column.key, order.id)}
                            className={`mb-2 rounded-xl border-2 border-dashed px-2 py-1 text-center text-[11px] font-semibold transition ${
                              showTopDrop ? 'border-sky-300 bg-sky-50 text-sky-700' : 'border-transparent bg-transparent text-transparent'
                            }`}
                          >
                            Drop here
                          </div>

                          <div
                            onClick={() => openOrder(order.id)}
                            className="cursor-pointer rounded-2xl border border-slate-200 bg-white px-3 py-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                          >
                            <div className="flex items-start gap-3">
                              <button
                                type="button"
                                draggable={order.status !== 'completed'}
                                onClick={(e) => e.stopPropagation()}
                                onDragStart={(e) => handleDragStart(e, order.id, column.key)}
                                onDragEnd={handleDragEnd}
                                disabled={order.status === 'completed'}
                                className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-500 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                                title={order.status === 'completed' ? 'Completed orders cannot be reordered' : 'Drag to reorder or move to another driver'}
                              >
                                <DragHandleIcon />
                              </button>

                              <div className="min-w-0 flex-1 space-y-2">
                                <div className="grid gap-2 sm:grid-cols-2">
                                  <div>
                                    <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Client</div>
                                    <div className="mt-1 line-clamp-1 text-base font-semibold text-slate-900">
                                      {order.customer_name || 'No customer'}
                                    </div>
                                  </div>

                                  <div>
                                    <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Driver</div>
                                    <div className="mt-1 text-sm text-slate-700">
                                      {assignedDriver?.name || '—'}
                                    </div>
                                  </div>

                                  <div>
                                    <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Destination</div>
                                    <div className="mt-1 line-clamp-2 text-sm text-slate-700">
                                      {order.workflow_step === 'DUMP' ? order.dump_site_address || 'No dump site address' : order.service_address || order.pickup_address || 'No service address'}
                                    </div>
                                  </div>

                                  <div>
                                    <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Time of Delivery</div>
                                    <div className="mt-1 text-sm text-slate-700">
                                      {displayValue(formatServiceTime(order.service_time || order.service_window))}
                                    </div>
                                  </div>

                                  <div className="grid grid-cols-2 gap-4">
                                    <div>
                                      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                                        Order Type
                                      </div>
                                      <div className="mt-1 text-sm text-slate-700">
                                        {displayValue(order.order_type)}
                                      </div>
                                    </div>

                                    <div>
                                      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                                        Bin Size
                                      </div>
                                      <div className="mt-1 text-sm text-slate-700">
                                        {order.bin_size ? `${order.bin_size} Yard` : '—'}
                                      </div>
                                    </div>
                                  </div>
                                </div>

                                <div className="flex items-center justify-between gap-2 pt-1">
                                  {column.key !== 'unassigned' ? (
                                    <span
                                      className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                                        statusStyles[order.status || 'unassigned'] || statusStyles.unassigned
                                      }`}
                                    >
                                      {formatStatus(order.status || 'unassigned')}
                                    </span>
                                  ) : <span />}

                                  <span className="text-[11px] text-slate-400">
                                    {order.ticket_number || `#${order.id.slice(0, 8)}`}
                                  </span>
                                </div>

                                {!order.driver_id ? (
                                  <div onClick={(e) => e.stopPropagation()}>
                                    <select
                                      value={assignSelections[order.id] || ''}
                                      onChange={(e) => {
                                        const driverId = e.target.value
                                        setAssignSelections((current) => ({ ...current, [order.id]: driverId }))
                                        if (driverId) {
                                          void handleAssign(order.id, driverId)
                                        }
                                      }}
                                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 outline-none focus:border-slate-400"
                                    >
                                      <option value="">Set Driver</option>
                                        {assignableDrivers.map((driver) => (
                                        <option key={driver.id} value={driver.id}>
                                          {driver.name || 'Unnamed Driver'}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                    })}

                    {columnOrders.length === 0 && (
                      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-400">
                        No orders here
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

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
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Notes</div>
                  <div className="mt-2 whitespace-pre-wrap text-sm text-slate-900">{displayValue(selectedOrder.notes)}</div>
                </div>

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
                      onChange={(e) => updateOrder(selectedOrder.id, { status: e.target.value })}
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
      </div>
    </div>
  )
}
