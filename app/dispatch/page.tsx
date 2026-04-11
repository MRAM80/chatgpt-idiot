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
  status: string | null
  notes: string | null
  created_at: string | null
  updated_at: string | null
  completed_by?: string | null
  completed_at?: string | null
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
const ROUTE_STORAGE_KEY = 'simpliitrash_dispatch_route_order_v1'

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

function formatDateTime(dateValue: string | null | undefined) {
  if (!dateValue) return '—'
  const date = new Date(dateValue)
  if (Number.isNaN(date.getTime())) return String(dateValue)
  return date.toLocaleString()
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

function loadStoredRouteOrder(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(ROUTE_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : []
  } catch {
    return []
  }
}

function persistRouteOrder(orderIds: string[]) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(ROUTE_STORAGE_KEY, JSON.stringify(orderIds))
}

function mergeRouteOrder(storedIds: string[], currentOrders: Order[]) {
  const currentIds = currentOrders.map((order) => order.id)
  const validStored = storedIds.filter((id) => currentIds.includes(id))
  const missing = currentIds.filter((id) => !validStored.includes(id))
  return [...validStored, ...missing]
}

function reorderIds(orderIds: string[], movingId: string, beforeId?: string | null) {
  const withoutMoving = orderIds.filter((id) => id !== movingId)

  if (!beforeId) {
    return [...withoutMoving, movingId]
  }

  const insertIndex = withoutMoving.indexOf(beforeId)
  if (insertIndex === -1) {
    return [...withoutMoving, movingId]
  }

  return [
    ...withoutMoving.slice(0, insertIndex),
    movingId,
    ...withoutMoving.slice(insertIndex),
  ]
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

  const [routeOrder, setRouteOrder] = useState<string[]>([])
  const [dragState, setDragState] = useState<DragState>(null)
  const [dropTarget, setDropTarget] = useState<{ columnKey: string; beforeId: string | null } | null>(null)

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
      .select(
        'id,ticket_number,customer_name,pickup_address,service_address,service_time,service_window,bin_id,old_bin_id,bin_size,bin_type,order_type,scheduled_date,driver_id,status,notes,created_at,updated_at,completed_by,completed_at'
      )
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

    const channel = supabase
      .channel('dispatch-board-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: TABLE_NAME },
        async () => {
          await loadOrders()
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'drivers' },
        async () => {
          await loadDrivers()
        }
      )
      .subscribe()

    return () => {
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

  useEffect(() => {
    const stored = loadStoredRouteOrder()
    setRouteOrder((current) => {
      if (current.length > 0) return current
      return mergeRouteOrder(stored, orders)
    })
  }, [orders])

  useEffect(() => {
    if (routeOrder.length > 0) {
      persistRouteOrder(routeOrder)
    }
  }, [routeOrder])

  const driverMap = useMemo(() => {
    return drivers.reduce<Record<string, Driver>>((acc, driver) => {
      acc[driver.id] = driver
      return acc
    }, {})
  }, [drivers])

  const activeDrivers = useMemo(() => {
    return drivers.filter((driver) => driver.status !== 'offline')
  }, [drivers])

  const selectedOrder = useMemo(() => {
    if (!selectedOrderId) return null
    return orders.find((order) => order.id === selectedOrderId) || null
  }, [orders, selectedOrderId])

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
      .select('status')
      .eq('driver_id', driverId)

    if (ordersError) {
      setPageError(ordersError.message)
      return
    }

    const activeStatuses = ['assigned', 'in_progress']
    const hasActiveOrders = (orderData || []).some((order) =>
      activeStatuses.includes(order.status || '')
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

    const { error: updateError } = await supabase
      .from('drivers')
      .update({ status: hasActiveOrders ? 'busy' : 'available' })
      .eq('id', driverId)

    if (updateError) {
      setPageError(updateError.message)
    }
  }

  async function updateOrder(id: string, values: Partial<Order>) {
    setPageError('')

    const currentOrder = orders.find((order) => order.id === id)
    if (!currentOrder) return false

    if (
      currentOrder.status === 'completed' &&
      Object.prototype.hasOwnProperty.call(values, 'status')
    ) {
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

    setOrders((current) =>
      current.map((order) => (order.id === id ? { ...order, ...values } : order))
    )

    await refreshAll()
    return true
  }

  async function handleAssignFromModal(orderId: string, driverId: string) {
    const currentOrder = orders.find((order) => order.id === orderId)
    if (!currentOrder || currentOrder.status === 'completed') return

    await updateOrder(orderId, {
      driver_id: driverId || null,
      status: driverId ? 'assigned' : 'unassigned',
    })
  }

  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      const q = search.trim().toLowerCase()
      const driverName = driverMap[order.driver_id || '']?.name || ''

      return (
        !q ||
        (order.ticket_number || '').toLowerCase().includes(q) ||
        (order.customer_name || '').toLowerCase().includes(q) ||
        driverName.toLowerCase().includes(q)
      )
    })
  }, [orders, search, driverMap])

  const mergedRouteOrder = useMemo(() => {
    return mergeRouteOrder(routeOrder, filteredOrders)
  }, [routeOrder, filteredOrders])

  const routeIndexMap = useMemo(() => {
    return mergedRouteOrder.reduce<Record<string, number>>((acc, id, index) => {
      acc[id] = index
      return acc
    }, {})
  }, [mergedRouteOrder])

  const groupedOrders = useMemo(() => {
    return boardColumns.reduce<Record<string, Order[]>>((acc, column) => {
      const matchingOrders = filteredOrders.filter((order) => {
        if (column.key === 'unassigned') return !order.driver_id
        return order.driver_id === column.key
      })

      acc[column.key] = [...matchingOrders].sort((a, b) => {
        const aIndex = routeIndexMap[a.id] ?? Number.MAX_SAFE_INTEGER
        const bIndex = routeIndexMap[b.id] ?? Number.MAX_SAFE_INTEGER
        return aIndex - bIndex
      })

      return acc
    }, {})
  }, [filteredOrders, boardColumns, routeIndexMap])

  const stats = useMemo(() => {
    const total = orders.length
    const unassigned = orders.filter((order) => !order.driver_id).length
    const assignedDrivers = activeDrivers.length
    const inProgress = orders.filter((order) => order.status === 'in_progress').length
    const completed = orders.filter((order) => order.status === 'completed').length

    return { total, unassigned, assignedDrivers, inProgress, completed }
  }, [orders, activeDrivers])

  function openOrder(orderId: string) {
    setSelectedOrderId(orderId)
    setModalOpen(true)
  }

  function closeOrderModal() {
    setModalOpen(false)
    setSelectedOrderId(null)
  }

  function handleDragStart(
    event: React.DragEvent<HTMLButtonElement>,
    orderId: string,
    fromColumnKey: string
  ) {
    event.stopPropagation()
    setDragState({ orderId, fromColumnKey })
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', orderId)
  }

  function handleDragEnd() {
    setDragState(null)
    setDropTarget(null)
  }

  function allowDrop(
    event: React.DragEvent<HTMLDivElement>,
    columnKey: string,
    beforeId: string | null
  ) {
    event.preventDefault()
    if (!dragState) return
    setDropTarget({ columnKey, beforeId })
  }

  async function moveOrderToColumn(
    movingOrderId: string,
    targetColumnKey: string,
    beforeId: string | null
  ) {
    const movingOrder = orders.find((order) => order.id === movingOrderId)
    if (!movingOrder || movingOrder.status === 'completed') return

    const nextDriverId = targetColumnKey === 'unassigned' ? null : targetColumnKey
    const driverChanged = movingOrder.driver_id !== nextDriverId

    if (driverChanged) {
      const ok = await updateOrder(movingOrderId, {
        driver_id: nextDriverId,
        status: nextDriverId ? 'assigned' : 'unassigned',
      })
      if (!ok) return
    }

    const currentBaseOrder = mergeRouteOrder(routeOrder, orders)
    const nextOrder = reorderIds(currentBaseOrder, movingOrderId, beforeId)
    setRouteOrder(nextOrder)
  }

  async function handleDrop(
    event: React.DragEvent<HTMLDivElement>,
    targetColumnKey: string,
    beforeId: string | null
  ) {
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
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                Dispatch Board
              </h1>
              <p className="text-sm text-slate-500">
                Driver-based route planning and daily workflow monitoring
              </p>
            </div>

            <button
              onClick={refreshAll}
              className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
            >
              Refresh
            </button>
          </div>

          {pageError ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {pageError}
            </div>
          ) : null}

          <div className="grid gap-4 md:grid-cols-5">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Total Orders
              </div>
              <div className="mt-2 text-2xl font-bold text-slate-900">{stats.total}</div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Unassigned
              </div>
              <div className="mt-2 text-2xl font-bold text-slate-900">{stats.unassigned}</div>
            </div>

            <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
              <div className="text-xs font-medium uppercase tracking-wide text-blue-700">
                Active Drivers
              </div>
              <div className="mt-2 text-2xl font-bold text-blue-900">{stats.assignedDrivers}</div>
            </div>

            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <div className="text-xs font-medium uppercase tracking-wide text-amber-700">
                In Progress
              </div>
              <div className="mt-2 text-2xl font-bold text-amber-900">{stats.inProgress}</div>
            </div>

            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <div className="text-xs font-medium uppercase tracking-wide text-emerald-700">
                Completed
              </div>
              <div className="mt-2 text-2xl font-bold text-emerald-900">{stats.completed}</div>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-1">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search ticket, customer, or driver"
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none ring-0 placeholder:text-slate-400 focus:border-slate-400"
            />
          </div>
        </div>

        {loading ? (
          <div className="rounded-3xl bg-white p-10 text-center text-sm text-slate-500 shadow-sm ring-1 ring-slate-200">
            Loading dispatch board...
          </div>
        ) : (
          <div
            className="grid gap-4"
            style={{
              gridTemplateColumns: `repeat(${Math.max(boardColumns.length, 1)}, minmax(260px, 1fr))`,
            }}
          >
            {boardColumns.map((column) => {
              const columnOrders = groupedOrders[column.key] || []

              return (
                <div
                  key={column.key}
                  className="min-h-[520px] rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-200"
                >
                  <div className="mb-4 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-800">
                        {column.label}
                      </h2>

                      <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
                        {columnOrders.length}
                      </span>
                    </div>

                    <div className="mt-2 text-xs text-slate-500">
                      {column.key === 'unassigned' ? 'Waiting for driver' : 'Route for today'}
                    </div>
                  </div>

                  <div
                    className={`space-y-2 rounded-2xl p-1 transition ${
                      dropTarget?.columnKey === column.key && dropTarget.beforeId === null
                        ? 'bg-sky-50'
                        : ''
                    }`}
                    onDragOver={(e) => allowDrop(e, column.key, null)}
                    onDrop={(e) => handleDrop(e, column.key, null)}
                  >
                    {columnOrders.map((order) => {
                      const assignedDriver = order.driver_id ? driverMap[order.driver_id] : null
                      const showTopDrop =
                        dropTarget?.columnKey === column.key && dropTarget.beforeId === order.id

                      return (
                        <div key={order.id}>
                          <div
                            onDragOver={(e) => allowDrop(e, column.key, order.id)}
                            onDrop={(e) => handleDrop(e, column.key, order.id)}
                            className={`mb-2 rounded-xl border-2 border-dashed px-2 py-1 text-center text-[11px] font-semibold transition ${
                              showTopDrop
                                ? 'border-sky-300 bg-sky-50 text-sky-700'
                                : 'border-transparent bg-transparent text-transparent'
                            }`}
                          >
                            Drop here
                          </div>

                          <div
                            onClick={() => openOrder(order.id)}
                            className="cursor-pointer rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
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
                                title={
                                  order.status === 'completed'
                                    ? 'Completed orders cannot be reordered'
                                    : 'Drag to reorder or move to another driver'
                                }
                              >
                                <DragHandleIcon />
                              </button>

                              <div className="min-w-0 flex-1 space-y-2">
                                <div>
                                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                                    Client
                                  </div>
                                  <div className="mt-1 line-clamp-2 text-sm font-semibold text-slate-900">
                                    {order.customer_name || 'No customer'}
                                  </div>
                                </div>

                                {column.key === 'unassigned' ? (
                                  <div>
                                    <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                                      Driver
                                    </div>
                                    <div className="mt-1 line-clamp-1 text-sm text-slate-700">
                                      {assignedDriver?.name || 'Unassigned'}
                                    </div>
                                  </div>
                                ) : null}

                                <div className="flex items-center justify-between gap-2 pt-1">
                                  <span
                                    className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                                      statusStyles[order.status || 'unassigned'] || statusStyles.unassigned
                                    }`}
                                  >
                                    {formatStatus(order.status || 'unassigned')}
                                  </span>

                                  <span className="text-[11px] text-slate-400">
                                    {order.ticket_number || `#${order.id.slice(0, 8)}`}
                                  </span>
                                </div>
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

        <div className="mt-6 flex justify-center">
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            Back to Dashboard
          </Link>
        </div>
      </div>

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
                <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                  Ticket Number
                </div>
                <div className="mt-1 text-2xl font-bold text-slate-900">
                  {displayValue(selectedOrder.ticket_number || `#${selectedOrder.id.slice(0, 8)}`)}
                </div>
                <div className="mt-2 text-sm text-slate-500">
                  Order details opened from Dispatch Board
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
              <div className="mb-6 flex flex-wrap items-center gap-3">
                <span
                  className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                    statusStyles[selectedOrder.status || 'unassigned'] || statusStyles.unassigned
                  }`}
                >
                  {formatStatus(selectedOrder.status || 'unassigned')}
                </span>

                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
                  Driver:{' '}
                  {displayValue(
                    selectedOrder.driver_id
                      ? driverMap[selectedOrder.driver_id]?.name || 'Assigned'
                      : 'Unassigned'
                  )}
                </span>

                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
                  Type: {displayValue(selectedOrder.order_type)}
                </span>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <DetailItem label="Customer" value={selectedOrder.customer_name} />
                <DetailItem
                  label="Driver"
                  value={
                    selectedOrder.driver_id
                      ? driverMap[selectedOrder.driver_id]?.name || 'Assigned'
                      : 'Unassigned'
                  }
                />
                <DetailItem label="Pickup Address" value={selectedOrder.pickup_address} />
                <DetailItem label="Service Address" value={selectedOrder.service_address} />
                <DetailItem label="Scheduled Date" value={formatDate(selectedOrder.scheduled_date)} />
                <DetailItem label="Service Time" value={selectedOrder.service_time} />
                <DetailItem label="Service Window" value={selectedOrder.service_window} />
                <DetailItem label="Order Type" value={selectedOrder.order_type} />
                <DetailItem label="Bin Size" value={selectedOrder.bin_size} />
                <DetailItem label="Bin Type" value={selectedOrder.bin_type} />
                <DetailItem label="Bin ID" value={selectedOrder.bin_id} />
                <DetailItem label="Old Bin ID" value={selectedOrder.old_bin_id} />
                <DetailItem label="Created At" value={formatDateTime(selectedOrder.created_at)} />
                <DetailItem label="Updated At" value={formatDateTime(selectedOrder.updated_at)} />
                <DetailItem label="Completed By" value={selectedOrder.completed_by} />
                <DetailItem label="Completed At" value={formatDateTime(selectedOrder.completed_at)} />
              </div>

              <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Notes
                </div>
                <div className="mt-2 whitespace-pre-wrap text-sm text-slate-900">
                  {displayValue(selectedOrder.notes)}
                </div>
              </div>

              <div className="mt-6 grid gap-3 md:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Assign Driver
                  </label>
                  <select
                    value={selectedOrder.driver_id || ''}
                    onChange={(e) => handleAssignFromModal(selectedOrder.id, e.target.value)}
                    disabled={selectedOrder.status === 'completed'}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 outline-none disabled:cursor-not-allowed disabled:opacity-60 focus:border-slate-400"
                  >
                    <option value="">Unassigned</option>
                    {activeDrivers.map((driver) => (
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
                    <p className="mt-2 text-xs font-medium text-emerald-700">
                      Completed orders are read-only for dispatch.
                    </p>
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
  )
}