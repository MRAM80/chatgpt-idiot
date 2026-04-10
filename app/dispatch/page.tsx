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
  status: string | null
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

const ORDER_TYPES = ['DELIVERY', 'EXCHANGE', 'REMOVAL', 'DUMP RETURN'] as const
const BIN_SIZES = ['6', '8', '10', '12', '14', '15', '20', '30', '40'] as const
const MATERIAL_TYPES = ['Garbage', 'Recycling', 'Mixed', 'Clean Fill'] as const
const SERVICE_WINDOWS = [
  'Anytime',
  '7:00 AM - 9:00 AM',
  '8:00 AM - 12:00 PM',
  '9:00 AM - 1:00 PM',
  '12:00 PM - 4:00 PM',
  '1:00 PM - 5:00 PM',
  'After 5:00 PM',
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

const orderTypeStyles: Record<string, string> = {
  DELIVERY: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  EXCHANGE: 'border-amber-200 bg-amber-50 text-amber-700',
  REMOVAL: 'border-rose-200 bg-rose-50 text-rose-700',
  'DUMP RETURN': 'border-sky-200 bg-sky-50 text-sky-700',
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
  const supabase = useMemo(() => createClient(), [])

  const [orders, setOrders] = useState<Order[]>([])
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [bins, setBins] = useState<Bin[]>([])
  const [loading, setLoading] = useState(true)
  const [pageError, setPageError] = useState('')
  const [draggingOrderId, setDraggingOrderId] = useState<string | null>(null)
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null)
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
  const [saving, setSaving] = useState(false)

  const [search, setSearch] = useState('')
  const [driverFilter, setDriverFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [orderTypeFilter, setOrderTypeFilter] = useState('all')

  const [form, setForm] = useState({
    customer_name: '',
    pickup_address: '',
    service_time: '',
    service_window: 'Anytime',
    bin_size: '20',
    bin_type: 'Garbage',
    order_type: 'DELIVERY',
    scheduled_date: '',
    driver_id: '',
    status: 'unassigned',
    bin_id: '',
    old_bin_id: '',
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
      .select('id,bin_number,bin_size,status,location')
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
    await Promise.all([loadDrivers(), loadBins(), loadOrders()])
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

  const inUseBins = useMemo(() => {
    return bins.filter((bin) => bin.status === 'in_use')
  }, [bins])

  const availableBinsForSelectedSize = useMemo(() => {
    return bins.filter((bin) => {
      if (bin.status !== 'available') return false
      if ((bin.bin_size || '') !== form.bin_size) return false
      if (form.order_type === 'EXCHANGE' && form.old_bin_id && bin.id === form.old_bin_id) return false
      return true
    })
  }, [bins, form.bin_size, form.order_type, form.old_bin_id])

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

  async function setBinStatus(binId: string, status: 'available' | 'in_use') {
    const { error } = await supabase
      .from('bins')
      .update({ status })
      .eq('id', binId)

    if (error) {
      throw new Error(error.message)
    }
  }

  async function releaseBin(binId: string | null) {
    if (!binId) return
    await setBinStatus(binId, 'available')
  }

  async function occupyBin(binId: string | null) {
    if (!binId) return
    await setBinStatus(binId, 'in_use')
  }

  async function validateSelectedAvailableBin(
    selectedBinId: string,
    expectedSize: string,
    excludeBinId?: string | null
  ): Promise<Bin> {
    const { data, error } = await supabase
      .from('bins')
      .select('id,bin_number,bin_size,status,location')
      .eq('id', selectedBinId)
      .single()

    if (error || !data) {
      throw new Error('Selected bin could not be found.')
    }

    const selected = data as Bin

    if (excludeBinId && selected.id === excludeBinId) {
      throw new Error('The new bin cannot be the same as the old bin.')
    }

    if ((selected.bin_size || '') !== expectedSize) {
      throw new Error('The selected bin does not match the chosen size.')
    }

    if (selected.status !== 'available') {
      throw new Error('The selected bin is no longer available.')
    }

    return selected
  }

  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      const q = search.trim().toLowerCase()
      const driverName = driverMap[order.driver_id || '']?.name || ''
      const binLabel = order.bin_id ? binMap[order.bin_id]?.bin_number || '' : ''
      const oldBinLabel = order.old_bin_id ? binMap[order.old_bin_id]?.bin_number || '' : ''
      const serviceAddress = order.service_address || order.pickup_address || ''

      const matchesSearch =
        !q ||
        (order.ticket_number || '').toLowerCase().includes(q) ||
        (order.customer_name || '').toLowerCase().includes(q) ||
        serviceAddress.toLowerCase().includes(q) ||
        (order.bin_type || '').toLowerCase().includes(q) ||
        (order.bin_size || '').toLowerCase().includes(q) ||
        (order.order_type || '').toLowerCase().includes(q) ||
        (order.service_time || '').toLowerCase().includes(q) ||
        (order.service_window || '').toLowerCase().includes(q) ||
        driverName.toLowerCase().includes(q) ||
        binLabel.toLowerCase().includes(q) ||
        oldBinLabel.toLowerCase().includes(q)

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
      pickup_address: order.service_address || order.pickup_address || '',
      service_time: order.service_time || '',
      service_window: order.service_window || 'Anytime',
      bin_size: order.bin_size || '20',
      bin_type: order.bin_type || 'Garbage',
      order_type: order.order_type || 'DELIVERY',
      scheduled_date: order.scheduled_date
        ? new Date(order.scheduled_date).toISOString().slice(0, 10)
        : '',
      driver_id: order.driver_id || '',
      status: order.status || 'unassigned',
      bin_id: order.bin_id || '',
      old_bin_id: order.old_bin_id || '',
      notes: order.notes || '',
    })
  }

  function closeEditModal() {
    setSelectedOrder(null)
    setPageError('')
  }

  async function applyWorkflowForUpdate(currentOrder: Order, values: Partial<Order>) {
    const nextOrderType = values.order_type ?? currentOrder.order_type ?? 'DELIVERY'
    const nextBinSize = values.bin_size ?? currentOrder.bin_size ?? '20'
    const nextBinId = values.bin_id ?? currentOrder.bin_id ?? null
    const nextOldBinId = values.old_bin_id ?? currentOrder.old_bin_id ?? null
    const nextStatus = values.status ?? currentOrder.status ?? 'unassigned'

    let finalBinId = nextBinId
    let finalOldBinId = nextOldBinId

    if (nextOrderType === 'DELIVERY') {
      if (!finalBinId) {
        throw new Error('Please select an available bin.')
      }

      const selectedBin = await validateSelectedAvailableBin(finalBinId, nextBinSize)
      finalBinId = selectedBin.id
      finalOldBinId = null
      await occupyBin(finalBinId)
    }

    if (nextOrderType === 'EXCHANGE') {
      if (!finalOldBinId) {
        throw new Error('Exchange requires an old bin.')
      }

      if (!finalBinId) {
        throw new Error('Please select the replacement bin.')
      }

      const selectedBin = await validateSelectedAvailableBin(
        finalBinId,
        nextBinSize,
        finalOldBinId
      )

      finalBinId = selectedBin.id

      if (nextStatus === 'completed' || nextStatus === 'issue') {
        await releaseBin(finalOldBinId)
        await occupyBin(finalBinId)
      }
    }

    if (nextOrderType === 'REMOVAL') {
      if (!finalOldBinId) {
        throw new Error('Removal requires an old bin.')
      }

      finalBinId = null

      if (nextStatus === 'completed' || nextStatus === 'issue') {
        await releaseBin(finalOldBinId)
      }
    }

    if (nextOrderType === 'DUMP RETURN') {
      const sameBinId = finalOldBinId || finalBinId || currentOrder.bin_id || null

      if (!sameBinId) {
        throw new Error('Dump return requires an existing bin.')
      }

      finalBinId = sameBinId
      finalOldBinId = sameBinId
      await occupyBin(sameBinId)
    }

    return {
      ...values,
      bin_id: finalBinId,
      old_bin_id: finalOldBinId,
    }
  }

  async function updateOrder(id: string, values: Partial<Order>) {
    setPageError('')

    const currentOrder = orders.find((order) => order.id === id)
    if (!currentOrder) return false

    const previousDriverId = currentOrder.driver_id
    const previousBinId = currentOrder.bin_id
    const previousOldBinId = currentOrder.old_bin_id

    let nextValues: Partial<Order> = values

    try {
      nextValues = await applyWorkflowForUpdate(currentOrder, values)
    } catch (error: any) {
      setPageError(error.message || 'Workflow update failed.')
      return false
    }

    const { error } = await supabase.from(TABLE_NAME).update(nextValues).eq('id', id)

    if (error) {
      setPageError(error.message)
      return false
    }

    if (previousDriverId && previousDriverId !== nextValues.driver_id) {
      await syncDriverStatuses(previousDriverId)
    }

    if (nextValues.driver_id) {
      await syncDriverStatuses(nextValues.driver_id)
    }

    const nextStatus = nextValues.status ?? currentOrder.status
    const nextOrderType = nextValues.order_type ?? currentOrder.order_type
    const nextBinId = nextValues.bin_id ?? currentOrder.bin_id
    const nextOldBinId = nextValues.old_bin_id ?? currentOrder.old_bin_id

    if (
      previousBinId &&
      previousBinId !== nextBinId &&
      previousBinId !== nextOldBinId &&
      previousBinId !== previousOldBinId
    ) {
      await releaseBin(previousBinId)
    }

    if (nextStatus === 'completed' || nextStatus === 'issue') {
      if (nextOrderType === 'REMOVAL' && nextOldBinId) {
        await releaseBin(nextOldBinId)
      }

      if (nextOrderType === 'EXCHANGE') {
        if (nextOldBinId && nextOldBinId !== nextBinId) {
          await releaseBin(nextOldBinId)
        }
        if (nextBinId) {
          await occupyBin(nextBinId)
        }
      }

      if (nextOrderType === 'DELIVERY' && nextBinId) {
        await occupyBin(nextBinId)
      }

      if (nextOrderType === 'DUMP RETURN' && nextBinId) {
        await occupyBin(nextBinId)
      }
    }

    setOrders((current) =>
      current.map((order) => (order.id === id ? { ...order, ...nextValues } : order))
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

  async function handleSave() {
    if (!selectedOrder) return
    setSaving(true)

    const success = await updateOrder(selectedOrder.id, {
      customer_name: form.customer_name || null,
      pickup_address: form.pickup_address || null,
      service_address: form.pickup_address || null,
      service_time: form.service_time || null,
      service_window: form.service_window || null,
      bin_size: form.bin_size || null,
      bin_type: form.bin_type || null,
      order_type: form.order_type || 'DELIVERY',
      scheduled_date: form.scheduled_date || null,
      driver_id: form.driver_id || null,
      status:
        form.driver_id && form.status === 'unassigned'
          ? 'in_progress'
          : form.status || 'unassigned',
      bin_id: form.bin_id || null,
      old_bin_id: form.old_bin_id || null,
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

  const availableMatchingCount = useMemo(() => {
    return availableBinsForSelectedSize.length
  }, [availableBinsForSelectedSize])

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
                Manage driver assignments, requested service time, and Job Site dispatch stages in real time
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
              placeholder="Search ticket, customer, job site address, time, window, bin, driver, or order type"
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
                    isHighlighted
                      ? highlightClass
                      : 'bg-white ring-slate-200'
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
                    <div className={`mb-3 rounded-2xl border border-dashed px-3 py-2 text-center text-xs font-semibold ${dropHintClass}`}>
                      Drop here to move order to {column.label}
                    </div>
                  )}

                  <div className="space-y-3">
                    {(groupedOrders[column.key] || []).map((order) => {
                      const assignedDriver = order.driver_id ? driverMap[order.driver_id] : null
                      const assignedBin = order.bin_id ? binMap[order.bin_id] : null
                      const oldBin = order.old_bin_id ? binMap[order.old_bin_id] : null
                      const badgeClass =
                        statusStyles[order.status || 'unassigned'] || statusStyles.unassigned
                      const orderTypeClass =
                        orderTypeStyles[order.order_type || 'DELIVERY'] ||
                        'border-slate-200 bg-slate-50 text-slate-700'

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
                            <span
                              className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${orderTypeClass}`}
                            >
                              {formatOrderType(order.order_type)}
                            </span>
                          </div>

                          <div className="space-y-2 text-sm text-slate-600">
                            <div>
                              <span className="font-medium text-slate-800">Job Site:</span>{' '}
                              {order.service_address || order.pickup_address || 'Not set'}
                            </div>

                            <div>
                              <span className="font-medium text-slate-800">Service Time:</span>{' '}
                              {formatServiceTime(order.service_time)}
                            </div>

                            <div>
                              <span className="font-medium text-slate-800">Window:</span>{' '}
                              {order.service_window || '—'}
                            </div>

                            <div>
                              <span className="font-medium text-slate-800">Bin:</span>{' '}
                              {assignedBin
                                ? `${assignedBin.bin_number || 'Bin'} • ${assignedBin.bin_size || order.bin_size || ''}Y`
                                : order.order_type === 'REMOVAL'
                                  ? 'No new bin'
                                  : `${order.bin_size || '—'}Y`}
                            </div>

                            {(order.order_type === 'EXCHANGE' ||
                              order.order_type === 'REMOVAL' ||
                              order.order_type === 'DUMP RETURN') && (
                              <div>
                                <span className="font-medium text-slate-800">Old Bin:</span>{' '}
                                {oldBin
                                  ? `${oldBin.bin_number || 'Bin'} • ${oldBin.bin_size || ''}Y`
                                  : 'Not set'}
                              </div>
                            )}

                            <div>
                              <span className="font-medium text-slate-800">Material:</span>{' '}
                              {order.bin_type || '—'}
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
                    setForm((prev) => ({
                      ...prev,
                      order_type: e.target.value,
                      bin_id: '',
                    }))
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
                  Material / Bin Type
                </label>
                <select
                  value={form.bin_type}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, bin_type: e.target.value }))
                  }
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-slate-400"
                >
                  {MATERIAL_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Bin Size
                </label>
                <select
                  value={form.bin_size}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, bin_size: e.target.value, bin_id: '' }))
                  }
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-slate-400"
                >
                  {BIN_SIZES.map((size) => (
                    <option key={size} value={size}>
                      {size} Yard
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Service Time
                </label>
                <input
                  type="time"
                  value={form.service_time}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, service_time: e.target.value }))
                  }
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-slate-400"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Service Window
                </label>
                <select
                  value={form.service_window}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, service_window: e.target.value }))
                  }
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-slate-400"
                >
                  {SERVICE_WINDOWS.map((windowOption) => (
                    <option key={windowOption} value={windowOption}>
                      {windowOption}
                    </option>
                  ))}
                </select>
              </div>

              {(form.order_type === 'EXCHANGE' ||
                form.order_type === 'REMOVAL' ||
                form.order_type === 'DUMP RETURN') && (
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Old / Existing Bin
                  </label>
                  <select
                    value={form.old_bin_id}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        old_bin_id: e.target.value,
                        bin_id:
                          prev.order_type === 'DUMP RETURN'
                            ? e.target.value
                            : prev.bin_id === e.target.value
                              ? ''
                              : prev.bin_id,
                      }))
                    }
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-slate-400"
                  >
                    <option value="">Select current bin</option>
                    {inUseBins.map((bin) => (
                      <option key={bin.id} value={bin.id}>
                        {bin.bin_number || 'Bin'} • {bin.bin_size || ''}Y
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {(form.order_type === 'DELIVERY' || form.order_type === 'EXCHANGE') && (
                <>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">
                      Available Bin
                    </label>
                    <select
                      value={form.bin_id}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, bin_id: e.target.value }))
                      }
                      className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-slate-400"
                    >
                      <option value="">Select available bin</option>
                      {availableBinsForSelectedSize.map((bin) => (
                        <option key={bin.id} value={bin.id}>
                          {bin.bin_number || 'Bin'} • {bin.bin_size || ''}Y
                          {bin.location ? ` • ${bin.location}` : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="md:col-span-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                    Available bins for selected size:{' '}
                    <span className="font-semibold">{availableBinsForSelectedSize.length}</span>
                  </div>
                </>
              )}

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
                  Job Site Address
                </label>
                <input
                  value={form.pickup_address}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, pickup_address: e.target.value }))
                  }
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-slate-400"
                  placeholder="Actual address where the bin work happens"
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

              <div className="md:col-span-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                <div className="font-semibold text-slate-900">Workflow preview</div>
                <div className="mt-2 space-y-1">
                  {form.order_type === 'DELIVERY' && (
                    <p>• Uses the selected available bin and keeps it in use.</p>
                  )}
                  {form.order_type === 'EXCHANGE' && (
                    <p>• Uses the selected replacement bin and releases the old bin when completed.</p>
                  )}
                  {form.order_type === 'REMOVAL' && (
                    <p>• Removes the current bin and releases it when completed.</p>
                  )}
                  {form.order_type === 'DUMP RETURN' && (
                    <p>• Keeps the same bin cycling back into use.</p>
                  )}
                </div>
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