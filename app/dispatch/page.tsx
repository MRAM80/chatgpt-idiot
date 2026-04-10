'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
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
  bin_id: string | null
  old_bin_id: string | null
  bin_size: string | null
  bin_type: string | null
  order_type: string | null
  scheduled_date: string | null
  driver_id: string | null
  status: string | null
  notes: string | null
  created_at: string | null
  updated_at: string | null
}

const TABLE_NAME = 'order'

const BOARD_COLUMNS = [
  { key: 'unassigned', label: 'Unassigned' },
  { key: 'assigned', label: 'Assigned' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'completed', label: 'Completed' },
  { key: 'issue', label: 'Issue' },
] as const

const statusStyles: Record<string, string> = {
  unassigned: 'border-slate-200 bg-slate-50 text-slate-700',
  assigned: 'border-blue-200 bg-blue-50 text-blue-700',
  in_progress: 'border-amber-200 bg-amber-50 text-amber-700',
  completed: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  issue: 'border-rose-200 bg-rose-50 text-rose-700',
}

const columnHeaderStyles: Record<string, string> = {
  unassigned: 'border-slate-200 bg-slate-100 text-slate-700',
  assigned: 'border-blue-200 bg-blue-100 text-blue-700',
  in_progress: 'border-amber-200 bg-amber-100 text-amber-700',
  completed: 'border-emerald-200 bg-emerald-100 text-emerald-700',
  issue: 'border-rose-200 bg-rose-100 text-rose-700',
}

const columnHighlightStyles: Record<string, string> = {
  unassigned: 'bg-slate-50 ring-slate-400 shadow-lg',
  assigned: 'bg-blue-50 ring-blue-400 shadow-lg',
  in_progress: 'bg-amber-50 ring-amber-400 shadow-lg',
  completed: 'bg-emerald-50 ring-emerald-400 shadow-lg',
  issue: 'bg-rose-50 ring-rose-400 shadow-lg',
}

const dropHintStyles: Record<string, string> = {
  unassigned: 'border-slate-300 bg-white/70 text-slate-700',
  assigned: 'border-blue-300 bg-white/70 text-blue-700',
  in_progress: 'border-amber-300 bg-white/70 text-amber-700',
  completed: 'border-emerald-300 bg-white/70 text-emerald-700',
  issue: 'border-rose-300 bg-white/70 text-rose-700',
}

function formatStatus(status: string | null | undefined) {
  if (!status) return 'Unassigned'
  if (status === 'in_progress') return 'In Progress'
  return status
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

function StatusHeaderIcon({ statusKey }: { statusKey: string }) {
  const common = 'h-4 w-4 shrink-0'

  if (statusKey === 'unassigned') {
    return (
      <svg viewBox="0 0 20 20" fill="currentColor" className={common} aria-hidden="true">
        <circle cx="10" cy="10" r="5.5" />
      </svg>
    )
  }

  if (statusKey === 'assigned') {
    return (
      <svg viewBox="0 0 20 20" fill="currentColor" className={common} aria-hidden="true">
        <path d="M10 2.5a3.25 3.25 0 1 1 0 6.5a3.25 3.25 0 0 1 0-6.5Z" />
        <path d="M4.5 15.25c0-2.15 2.36-3.75 5.5-3.75s5.5 1.6 5.5 3.75v.75H4.5v-.75Z" />
      </svg>
    )
  }

  if (statusKey === 'in_progress') {
    return (
      <svg viewBox="0 0 20 20" fill="currentColor" className={common} aria-hidden="true">
        <path
          fillRule="evenodd"
          d="M10 3.25a6.75 6.75 0 1 0 6.75 6.75A6.758 6.758 0 0 0 10 3.25Zm.75 2.75a.75.75 0 0 0-1.5 0v4.25c0 .24.115.465.31.606l2.5 1.8a.75.75 0 1 0 .88-1.214l-2.19-1.577V6Z"
          clipRule="evenodd"
        />
      </svg>
    )
  }

  if (statusKey === 'completed') {
    return (
      <svg viewBox="0 0 20 20" fill="currentColor" className={common} aria-hidden="true">
        <path
          fillRule="evenodd"
          d="M16.704 5.29a.75.75 0 0 1 .006 1.06l-7.2 7.286a.75.75 0 0 1-1.07.002L4.79 9.977a.75.75 0 1 1 1.06-1.06l3.116 3.115l6.678-6.758a.75.75 0 0 1 1.06.016Z"
          clipRule="evenodd"
        />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className={common} aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M10 2.75a7.25 7.25 0 1 0 0 14.5a7.25 7.25 0 0 0 0-14.5Zm0 3a.75.75 0 0 1 .75.75v4a.75.75 0 0 1-1.5 0v-4A.75.75 0 0 1 10 5.75Zm0 7a1 1 0 1 0 0 2a1 1 0 0 0 0-2Z"
        clipRule="evenodd"
      />
    </svg>
  )
}

export default function DispatchBoardPage() {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  const [orders, setOrders] = useState<Order[]>([])
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [loading, setLoading] = useState(true)
  const [pageError, setPageError] = useState('')
  const [draggingOrderId, setDraggingOrderId] = useState<string | null>(null)
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null)
  const [openingOrderId, setOpeningOrderId] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [driverFilter, setDriverFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')

  async function loadDrivers() {
    const { data, error } = await supabase
      .from('drivers')
      .select('id,name,phone,status')
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
        'id,ticket_number,customer_name,pickup_address,service_address,service_time,service_window,bin_id,old_bin_id,bin_size,bin_type,order_type,scheduled_date,driver_id,status,notes,created_at,updated_at'
      )
      .order('scheduled_date', { ascending: true })

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

  const driverMap = useMemo(() => {
    return drivers.reduce<Record<string, Driver>>((acc, driver) => {
      acc[driver.id] = driver
      return acc
    }, {})
  }, [drivers])

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

  async function handleDrop(newStatus: string) {
    if (!draggingOrderId) return
    await updateOrder(draggingOrderId, { status: newStatus })
    setDraggingOrderId(null)
    setDragOverColumn(null)
  }

  async function handleQuickAssign(orderId: string, driverId: string) {
    await updateOrder(orderId, {
      driver_id: driverId || null,
      status: driverId ? 'in_progress' : 'unassigned',
    })
  }

  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      const q = search.trim().toLowerCase()
      const driverName = driverMap[order.driver_id || '']?.name || ''

      const matchesSearch =
        !q ||
        (order.ticket_number || '').toLowerCase().includes(q) ||
        (order.customer_name || '').toLowerCase().includes(q) ||
        driverName.toLowerCase().includes(q)

      const matchesDriver =
        driverFilter === 'all' || (order.driver_id || '') === driverFilter

      const normalizedStatus = order.status || 'unassigned'
      const matchesStatus =
        statusFilter === 'all' || normalizedStatus === statusFilter

      return matchesSearch && matchesDriver && matchesStatus
    })
  }, [orders, search, driverFilter, statusFilter, driverMap])

  const groupedOrders = useMemo(() => {
    return BOARD_COLUMNS.reduce<Record<string, Order[]>>((acc, column) => {
      acc[column.key] = filteredOrders.filter(
        (order) => (order.status || 'unassigned') === column.key
      )
      return acc
    }, {})
  }, [filteredOrders])

  const stats = useMemo(() => {
    const total = orders.length
    const unassigned = orders.filter((order) => (order.status || 'unassigned') === 'unassigned').length
    const assigned = orders.filter((order) => order.status === 'assigned').length
    const inProgress = orders.filter((order) => order.status === 'in_progress').length
    const completed = orders.filter((order) => order.status === 'completed').length

    return { total, unassigned, assigned, inProgress, completed }
  }, [orders])

  function openOrder(orderId: string) {
    setOpeningOrderId(orderId)
    router.push(`/order?orderId=${encodeURIComponent(orderId)}`)
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="mx-auto max-w-7xl p-4 md:p-6">
        <div className="mb-6 flex flex-col gap-4 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                Dispatch Board
              </h1>
              <p className="text-sm text-slate-500">
                Cleaner dispatch view for high-volume daily operations
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
                Assigned
              </div>
              <div className="mt-2 text-2xl font-bold text-blue-900">{stats.assigned}</div>
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

          <div className="grid gap-3 md:grid-cols-3">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search ticket, customer, or driver"
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none ring-0 placeholder:text-slate-400 focus:border-slate-400"
            />

            <select
              value={driverFilter}
              onChange={(e) => setDriverFilter(e.target.value)}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-slate-400"
            >
              <option value="all">All Drivers</option>
              {drivers.map((driver) => (
                <option key={driver.id} value={driver.id}>
                  {driver.name || 'Unnamed Driver'}
                </option>
              ))}
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-slate-400"
            >
              <option value="all">All Statuses</option>
              {BOARD_COLUMNS.map((column) => (
                <option key={column.key} value={column.key}>
                  {column.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {loading ? (
          <div className="rounded-3xl bg-white p-10 text-center text-sm text-slate-500 shadow-sm ring-1 ring-slate-200">
            Loading dispatch board...
          </div>
        ) : (
          <div className="grid gap-4 xl:grid-cols-5">
            {BOARD_COLUMNS.map((column) => {
              const isHighlighted = !!draggingOrderId && dragOverColumn === column.key
              const headerClass =
                columnHeaderStyles[column.key] || columnHeaderStyles.unassigned
              const highlightClass =
                columnHighlightStyles[column.key] || 'bg-sky-50 ring-sky-400 shadow-lg'
              const dropHintClass =
                dropHintStyles[column.key] || 'border-sky-300 bg-white/70 text-sky-700'

              return (
                <div
                  key={column.key}
                  onDragOver={(e) => {
                    e.preventDefault()
                    if (dragOverColumn !== column.key) {
                      setDragOverColumn(column.key)
                    }
                  }}
                  onDragEnter={(e) => {
                    e.preventDefault()
                    setDragOverColumn(column.key)
                  }}
                  onDragLeave={() => {
                    if (dragOverColumn === column.key) {
                      setDragOverColumn(null)
                    }
                  }}
                  onDrop={() => handleDrop(column.key)}
                  className={`min-h-[520px] rounded-3xl p-4 shadow-sm ring-1 transition-all duration-150 ${
                    isHighlighted ? highlightClass : 'bg-white ring-slate-200'
                  }`}
                >
                  <div
                    className={`mb-4 flex items-center justify-between rounded-2xl border px-3 py-3 ${headerClass}`}
                  >
                    <div className="flex items-center gap-2">
                      <StatusHeaderIcon statusKey={column.key} />
                      <h2 className="text-sm font-semibold uppercase tracking-wide">
                        {column.label}
                      </h2>
                    </div>

                    <span className="rounded-full bg-white/70 px-2.5 py-1 text-xs font-semibold">
                      {groupedOrders[column.key]?.length || 0}
                    </span>
                  </div>

                  {isHighlighted && (
                    <div
                      className={`mb-3 rounded-2xl border border-dashed px-3 py-2 text-center text-xs font-semibold ${dropHintClass}`}
                    >
                      Drop here to move order to {column.label}
                    </div>
                  )}

                  <div className="space-y-3">
                    {(groupedOrders[column.key] || []).map((order) => {
                      const assignedDriver = order.driver_id ? driverMap[order.driver_id] : null
                      const badgeClass =
                        statusStyles[order.status || 'unassigned'] || statusStyles.unassigned
                      const isOpening = openingOrderId === order.id

                      return (
                        <div
                          key={order.id}
                          draggable
                          onDragStart={() => setDraggingOrderId(order.id)}
                          onDragEnd={() => {
                            setDraggingOrderId(null)
                            setDragOverColumn(null)
                          }}
                          className={`rounded-2xl border bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
                            draggingOrderId === order.id
                              ? 'cursor-grabbing border-sky-300 opacity-60 ring-2 ring-sky-200'
                              : 'cursor-grab border-slate-200'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => openOrder(order.id)}
                            className={`w-full rounded-xl text-left outline-none transition ${
                              isOpening ? 'opacity-70' : ''
                            }`}
                          >
                            <div className="mb-3 flex items-start justify-between gap-2">
                              <div>
                                <div className="text-sm font-semibold text-slate-900">
                                  {order.ticket_number || `#${order.id.slice(0, 8)}`}
                                </div>
                                <div className="mt-1 text-sm text-slate-600">
                                  {order.customer_name || 'No customer'}
                                </div>
                              </div>

                              <span
                                className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${badgeClass}`}
                              >
                                {formatStatus(order.status || 'unassigned')}
                              </span>
                            </div>

                            <div className="text-sm text-slate-600">
                              <span className="font-medium text-slate-800">Driver:</span>{' '}
                              {assignedDriver?.name || 'Unassigned'}
                            </div>

                            <div className="mt-3 text-xs font-medium text-slate-400">
                              {isOpening ? 'Opening order...' : 'Click to open full order'}
                            </div>
                          </button>

                          <div className="mt-4 space-y-2">
                            <select
                              value={order.driver_id || ''}
                              onChange={(e) => handleQuickAssign(order.id, e.target.value)}
                              onClick={(e) => e.stopPropagation()}
                              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 outline-none focus:border-slate-400"
                            >
                              <option value="">Assign driver</option>
                              {drivers
                                .filter((driver) => driver.status !== 'offline')
                                .map((driver) => (
                                  <option key={driver.id} value={driver.id}>
                                    {driver.name || 'Unnamed Driver'}
                                  </option>
                                ))}
                            </select>

                            <div className="grid grid-cols-2 gap-2">
                              <button
                                type="button"
                                onClick={() => openOrder(order.id)}
                                className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition hover:opacity-90"
                              >
                                Open Order
                              </button>

                              <select
                                value={order.status || 'unassigned'}
                                onChange={(e) => updateOrder(order.id, { status: e.target.value })}
                                onClick={(e) => e.stopPropagation()}
                                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-slate-400"
                              >
                                <option value="unassigned">Unassigned</option>
                                <option value="assigned">Assigned</option>
                                <option value="in_progress">In Progress</option>
                                <option value="completed">Completed</option>
                                <option value="issue">Issue</option>
                              </select>
                            </div>
                          </div>
                        </div>
                      )
                    })}

                    {(!groupedOrders[column.key] || groupedOrders[column.key].length === 0) && (
                      <div
                        className={`rounded-2xl border border-dashed p-6 text-center text-sm transition ${
                          isHighlighted
                            ? dropHintClass
                            : 'border-slate-200 bg-slate-50 text-slate-400'
                        }`}
                      >
                        {isHighlighted ? `Drop order in ${column.label}` : 'No orders here'}
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
    </div>
  )
}