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

type Bin = {
  id: string
  bin_number: string | null
  bin_size: string | null
  bin_type: string | null
  status: string | null
}

type Order = {
  id: string
  ticket_number: string | null
  customer_name: string | null
  pickup_address: string | null
  bin_id: string | null
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

const ORDER_TYPES = ['DELIVERY', 'EXCHANGE', 'REMOVAL', 'DUMP RETURN'] as const

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

function formatDate(date: string | null) {
  if (!date) return 'No date'
  const parsed = new Date(date)
  if (Number.isNaN(parsed.getTime())) return date
  return parsed.toLocaleDateString()
}

function formatOrderType(orderType: string | null | undefined) {
  return orderType || 'DELIVERY'
}

export default function DispatchBoardPage() {
  const supabase = useMemo(() => createClient(), [])

  const [orders, setOrders] = useState<Order[]>([])
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [bins, setBins] = useState<Bin[]>([])
  const [loading, setLoading] = useState(true)
  const [pageError, setPageError] = useState('')
  const [draggingOrderId, setDraggingOrderId] = useState<string | null>(null)
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
  const [saving, setSaving] = useState(false)

  const [search, setSearch] = useState('')
  const [driverFilter, setDriverFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [orderTypeFilter, setOrderTypeFilter] = useState('all')

  const [form, setForm] = useState({
    customer_name: '',
    pickup_address: '',
    bin_size: '20',
    bin_type: 'Garbage',
    order_type: 'DELIVERY',
    scheduled_date: '',
    driver_id: '',
    status: 'unassigned',
    notes: '',
  })

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

  async function loadBins() {
    const { data, error } = await supabase
      .from('bins')
      .select('id,bin_number,bin_size,bin_type,status')
      .order('bin_number', { ascending: true })

    if (error) {
      setPageError(error.message)
      return
    }

    setBins((data as Bin[]) || [])
  }

  async function loadOrders() {
    setLoading(true)

    const { data, error } = await supabase
      .from(TABLE_NAME)
      .select(
        'id,ticket_number,customer_name,pickup_address,bin_id,bin_size,bin_type,order_type,scheduled_date,driver_id,status,notes,created_at,updated_at'
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
    await Promise.all([loadDrivers(), loadBins(), loadOrders()])
  }

  useEffect(() => {
    refreshAll()

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
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bins' },
        async () => {
          await loadBins()
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

  const binMap = useMemo(() => {
    return bins.reduce<Record<string, Bin>>((acc, bin) => {
      acc[bin.id] = bin
      return acc
    }, {})
  }, [bins])

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

  async function releaseBin(binId: string | null) {
    if (!binId) return

    const { data, error } = await supabase
      .from(TABLE_NAME)
      .select('id,status')
      .eq('bin_id', binId)

    if (error) {
      setPageError(error.message)
      return
    }

    const hasActiveOrders = (data || []).some((order) =>
      ['unassigned', 'assigned', 'in_progress'].includes(order.status || '')
    )

    if (!hasActiveOrders) {
      const { error: updateError } = await supabase
        .from('bins')
        .update({ status: 'available' })
        .eq('id', binId)

      if (updateError) {
        setPageError(updateError.message)
      }
    }
  }

  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      const q = search.trim().toLowerCase()
      const driverName = driverMap[order.driver_id || '']?.name || ''
      const binLabel = order.bin_id ? binMap[order.bin_id]?.bin_number || '' : ''

      const matchesSearch =
        !q ||
        (order.ticket_number || '').toLowerCase().includes(q) ||
        (order.customer_name || '').toLowerCase().includes(q) ||
        (order.pickup_address || '').toLowerCase().includes(q) ||
        (order.bin_type || '').toLowerCase().includes(q) ||
        (order.bin_size || '').toLowerCase().includes(q) ||
        (order.order_type || '').toLowerCase().includes(q) ||
        driverName.toLowerCase().includes(q) ||
        binLabel.toLowerCase().includes(q)

      const matchesDriver =
        driverFilter === 'all' || (order.driver_id || '') === driverFilter

      const normalizedStatus = order.status || 'unassigned'
      const matchesStatus =
        statusFilter === 'all' || normalizedStatus === statusFilter

      const matchesOrderType =
        orderTypeFilter === 'all' || (order.order_type || 'DELIVERY') === orderTypeFilter

      return matchesSearch && matchesDriver && matchesStatus && matchesOrderType
    })
  }, [orders, search, driverFilter, statusFilter, orderTypeFilter, driverMap, binMap])

  const groupedOrders = useMemo(() => {
    return BOARD_COLUMNS.reduce<Record<string, Order[]>>((acc, column) => {
      acc[column.key] = filteredOrders.filter(
        (order) => (order.status || 'unassigned') === column.key
      )
      return acc
    }, {})
  }, [filteredOrders])

  function openEditModal(order: Order) {
    setSelectedOrder(order)
    setForm({
      customer_name: order.customer_name || '',
      pickup_address: order.pickup_address || '',
      bin_size: order.bin_size || '20',
      bin_type: order.bin_type || 'Garbage',
      order_type: order.order_type || 'DELIVERY',
      scheduled_date: order.scheduled_date
        ? new Date(order.scheduled_date).toISOString().slice(0, 10)
        : '',
      driver_id: order.driver_id || '',
      status: order.status || 'unassigned',
      notes: order.notes || '',
    })
  }

  function closeEditModal() {
    setSelectedOrder(null)
    setPageError('')
  }

  async function updateOrder(id: string, values: Partial<Order>) {
    setPageError('')

    const currentOrder = orders.find((order) => order.id === id)
    if (!currentOrder) return false

    const previousDriverId = currentOrder.driver_id
    const previousBinId = currentOrder.bin_id

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

    const nextStatus = values.status ?? currentOrder.status

    if ((nextStatus === 'completed' || nextStatus === 'issue') && previousBinId) {
      await releaseBin(previousBinId)
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
  }

  async function handleQuickAssign(orderId: string, driverId: string) {
    await updateOrder(orderId, {
      driver_id: driverId || null,
      status: driverId ? 'assigned' : 'unassigned',
    })
  }

  async function handleSave() {
    if (!selectedOrder) return
    setSaving(true)

    const success = await updateOrder(selectedOrder.id, {
      customer_name: form.customer_name || null,
      pickup_address: form.pickup_address || null,
      bin_size: form.bin_size || null,
      bin_type: form.bin_type || null,
      order_type: form.order_type || 'DELIVERY',
      scheduled_date: form.scheduled_date || null,
      driver_id: form.driver_id || null,
      status: form.status || 'unassigned',
      notes: form.notes || null,
    })

    setSaving(false)

    if (success) {
      closeEditModal()
    }
  }

  const stats = useMemo(() => {
    const total = orders.length
    const unassigned = orders.filter((order) => (order.status || 'unassigned') === 'unassigned').length
    const assigned = orders.filter((order) => order.status === 'assigned').length
    const inProgress = orders.filter((order) => order.status === 'in_progress').length
    const completed = orders.filter((order) => order.status === 'completed').length

    return { total, unassigned, assigned, inProgress, completed }
  }, [orders])

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
                Move orders across dispatch stages and manage assignments in real time
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

          <div className="grid gap-3 md:grid-cols-4">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search ticket, customer, address, bin, driver, or order type"
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

            <select
              value={orderTypeFilter}
              onChange={(e) => setOrderTypeFilter(e.target.value)}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-slate-400"
            >
              <option value="all">All Order Types</option>
              {ORDER_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
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
            {BOARD_COLUMNS.map((column) => (
              <div
                key={column.key}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => handleDrop(column.key)}
                className="min-h-[520px] rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-200"
              >
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">
                    {column.label}
                  </h2>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                    {groupedOrders[column.key]?.length || 0}
                  </span>
                </div>

                <div className="space-y-3">
                  {(groupedOrders[column.key] || []).map((order) => {
                    const assignedDriver = order.driver_id ? driverMap[order.driver_id] : null
                    const assignedBin = order.bin_id ? binMap[order.bin_id] : null
                    const badgeClass =
                      statusStyles[order.status || 'unassigned'] || statusStyles.unassigned

                    return (
                      <div
                        key={order.id}
                        draggable
                        onDragStart={() => setDraggingOrderId(order.id)}
                        className="cursor-grab rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                      >
                        <div className="mb-3 flex items-start justify-between gap-2">
                          <div>
                            <div className="text-sm font-semibold text-slate-900">
                              {order.customer_name || 'No customer'}
                            </div>
                            <div className="mt-1 text-xs font-medium text-slate-500">
                              {order.ticket_number || `#${order.id.slice(0, 8)}`}
                            </div>
                          </div>

                          <span
                            className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${badgeClass}`}
                          >
                            {formatStatus(order.status || 'unassigned')}
                          </span>
                        </div>

                        <div className="mb-3">
                          <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                            {formatOrderType(order.order_type)}
                          </span>
                        </div>

                        <div className="space-y-2 text-sm text-slate-600">
                          <div>
                            <span className="font-medium text-slate-800">Address:</span>{' '}
                            {order.pickup_address || 'Not set'}
                          </div>
                          <div>
                            <span className="font-medium text-slate-800">Bin:</span>{' '}
                            {assignedBin
                              ? `${assignedBin.bin_number || 'Bin'} • ${order.bin_size || ''}Y ${order.bin_type || ''}`
                              : `${order.bin_size || '—'}Y ${order.bin_type || ''}`}
                          </div>
                          <div>
                            <span className="font-medium text-slate-800">Date:</span>{' '}
                            {formatDate(order.scheduled_date)}
                          </div>
                          <div>
                            <span className="font-medium text-slate-800">Driver:</span>{' '}
                            {assignedDriver?.name || 'Unassigned'}
                          </div>
                        </div>

                        <div className="mt-4">
                          <select
                            value={order.driver_id || ''}
                            onChange={(e) => handleQuickAssign(order.id, e.target.value)}
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
                        </div>

                        <div className="mt-3 flex gap-2">
                          <button
                            onClick={() => openEditModal(order)}
                            className="flex-1 rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition hover:opacity-90"
                          >
                            Edit
                          </button>

                          <select
                            value={order.status || 'unassigned'}
                            onChange={(e) =>
                              updateOrder(order.id, { status: e.target.value })
                            }
                            className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-slate-400"
                          >
                            <option value="unassigned">Unassigned</option>
                            <option value="assigned">Assigned</option>
                            <option value="in_progress">In Progress</option>
                            <option value="completed">Completed</option>
                            <option value="issue">Issue</option>
                          </select>
                        </div>
                      </div>
                    )
                  })}

                  {(!groupedOrders[column.key] || groupedOrders[column.key].length === 0) && (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-400">
                      No orders here
                    </div>
                  )}
                </div>
              </div>
            ))}
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

      {selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-2xl rounded-3xl bg-white p-6 shadow-2xl">
            <div className="mb-6 flex items-start justify-between">
              <div>
                <h3 className="text-xl font-bold text-slate-900">Edit Order</h3>
                <p className="text-sm text-slate-500">
                  {selectedOrder.ticket_number || `Order #${selectedOrder.id.slice(0, 8)}`}
                </p>
              </div>

              <button
                onClick={closeEditModal}
                className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200"
              >
                Close
              </button>
            </div>

            {pageError ? (
              <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {pageError}
              </div>
            ) : null}

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Customer Name
                </label>
                <input
                  value={form.customer_name}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, customer_name: e.target.value }))
                  }
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-slate-400"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Order Type
                </label>
                <select
                  value={form.order_type}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, order_type: e.target.value }))
                  }
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-slate-400"
                >
                  {ORDER_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Bin Type
                </label>
                <input
                  value={form.bin_type}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, bin_type: e.target.value }))
                  }
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-slate-400"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Bin Size
                </label>
                <input
                  value={form.bin_size}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, bin_size: e.target.value }))
                  }
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-slate-400"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Scheduled Date
                </label>
                <input
                  type="date"
                  value={form.scheduled_date}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, scheduled_date: e.target.value }))
                  }
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-slate-400"
                />
              </div>

              <div className="md:col-span-2">
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Pickup Address
                </label>
                <input
                  value={form.pickup_address}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, pickup_address: e.target.value }))
                  }
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-slate-400"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Driver
                </label>
                <select
                  value={form.driver_id}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, driver_id: e.target.value }))
                  }
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-slate-400"
                >
                  <option value="">Unassigned</option>
                  {drivers
                    .filter((driver) => driver.status !== 'offline')
                    .map((driver) => (
                      <option key={driver.id} value={driver.id}>
                        {driver.name || 'Unnamed Driver'}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Status
                </label>
                <select
                  value={form.status}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, status: e.target.value }))
                  }
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-slate-400"
                >
                  <option value="unassigned">Unassigned</option>
                  <option value="assigned">Assigned</option>
                  <option value="in_progress">In Progress</option>
                  <option value="completed">Completed</option>
                  <option value="issue">Issue</option>
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Notes
                </label>
                <textarea
                  rows={4}
                  value={form.notes}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, notes: e.target.value }))
                  }
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-slate-400"
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={closeEditModal}
                className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}