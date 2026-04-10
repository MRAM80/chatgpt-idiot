'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Driver = {
  id: string
  name: string | null
  email: string | null
  phone: string | null
  status: string | null
}

type Customer = {
  id: string
  name: string | null
  phone: string | null
  email: string | null
  address: string | null
}

type Bin = {
  id: string
  bin_number: string | null
  bin_size: string | null
  bin_type: string | null
  status: string | null
}

type OrderCustomerRelation = {
  id: string
  name: string | null
  address: string | null
}

type OrderDriverRelation = {
  id: string
  name: string | null
  email?: string | null
}

type OrderBinRelation = {
  id: string
  bin_number: string | null
  bin_size: string | null
  bin_type: string | null
}

type Order = {
  id: string
  ticket_number: string | null
  customer_id: string | null
  customer_name: string | null
  pickup_address: string | null
  bin_id: string | null
  old_bin_id: string | null
  bin_size: string | null
  bin_type: string | null
  order_type: string | null
  driver_id: string | null
  scheduled_date: string | null
  status: string | null
  notes: string | null
  created_at: string | null
  updated_at: string | null
  customers?: OrderCustomerRelation[] | null
  drivers?: OrderDriverRelation[] | null
  bins?: OrderBinRelation[] | null
  old_bin?: OrderBinRelation[] | null
}

const TABLE_NAME = 'order'

const ORDER_STATUSES = [
  'unassigned',
  'assigned',
  'in_progress',
  'completed',
  'issue',
] as const

const ORDER_TYPES = ['DELIVERY', 'EXCHANGE', 'REMOVAL', 'DUMP RETURN'] as const
const BIN_SIZES = ['6', '8', '15', '20', '30', '40'] as const
const BIN_TYPES = ['Garbage', 'Recycling', 'Mixed', 'Clean Fill'] as const

const statusClasses: Record<string, string> = {
  unassigned: 'bg-slate-100 text-slate-700 border-slate-200',
  assigned: 'bg-blue-100 text-blue-700 border-blue-200',
  in_progress: 'bg-amber-100 text-amber-700 border-amber-200',
  completed: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  issue: 'bg-rose-100 text-rose-700 border-rose-200',
}

const orderTypeClasses: Record<string, string> = {
  DELIVERY: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  EXCHANGE: 'bg-amber-100 text-amber-700 border-amber-200',
  REMOVAL: 'bg-rose-100 text-rose-700 border-rose-200',
  'DUMP RETURN': 'bg-sky-100 text-sky-700 border-sky-200',
}

type FormState = {
  customer_id: string
  customer_name: string
  pickup_address: string
  bin_size: string
  bin_type: string
  order_type: string
  driver_id: string
  scheduled_date: string
  status: string
  bin_id: string
  old_bin_id: string
  notes: string
}

const emptyForm: FormState = {
  customer_id: '',
  customer_name: '',
  pickup_address: '',
  bin_size: '20',
  bin_type: 'Garbage',
  order_type: 'DELIVERY',
  driver_id: '',
  scheduled_date: '',
  status: 'unassigned',
  bin_id: '',
  old_bin_id: '',
  notes: '',
}

function formatStatus(status: string | null | undefined) {
  if (!status) return 'Unassigned'
  return status
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

function formatDate(date: string | null) {
  if (!date) return '—'
  const parsed = new Date(date)
  if (Number.isNaN(parsed.getTime())) return date
  return parsed.toLocaleDateString()
}

function formatOrderType(orderType: string | null | undefined) {
  return orderType || 'DELIVERY'
}

function firstRelation<T>(value?: T[] | null): T | null {
  return Array.isArray(value) && value.length > 0 ? value[0] : null
}

export default function OrdersPage() {
  const supabase = createClient()

  const [orders, setOrders] = useState<Order[]>([])
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [bins, setBins] = useState<Bin[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [pageError, setPageError] = useState('')

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [driverFilter, setDriverFilter] = useState('all')
  const [orderTypeFilter, setOrderTypeFilter] = useState('all')

  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingOrder, setEditingOrder] = useState<Order | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)

  async function loadOrders() {
    const { data, error } = await supabase
      .from(TABLE_NAME)
      .select(`
        id,
        ticket_number,
        customer_id,
        customer_name,
        pickup_address,
        bin_id,
        old_bin_id,
        bin_size,
        bin_type,
        order_type,
        driver_id,
        scheduled_date,
        status,
        notes,
        created_at,
        updated_at,
        customers:customer_id ( id, name, address ),
        drivers:driver_id ( id, name ),
        bins:bin_id ( id, bin_number, bin_size, bin_type ),
        old_bin:old_bin_id ( id, bin_number, bin_size, bin_type )
      `)
      .order('created_at', { ascending: false })

    if (error) {
      setPageError(error.message)
      return
    }

    setOrders(((data ?? []) as unknown) as Order[])
  }

  async function loadDrivers() {
    const { data, error } = await supabase
      .from('drivers')
      .select('id,name,email,phone,status')
      .order('name', { ascending: true })

    if (error) {
      setPageError(error.message)
      return
    }

    setDrivers((data as Driver[]) || [])
  }

  async function loadCustomers() {
    const { data, error } = await supabase
      .from('customers')
      .select('id,name,phone,email,address,status')
      .eq('status', 'active')
      .order('name', { ascending: true })

    if (error) {
      setPageError(error.message)
      return
    }

    setCustomers((data as Customer[]) || [])
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

  async function refreshAll() {
    setLoading(true)
    setPageError('')
    await Promise.all([loadOrders(), loadDrivers(), loadCustomers(), loadBins()])
    setLoading(false)
  }

  useEffect(() => {
    void refreshAll()

    const channel = supabase
      .channel('orders-page-realtime')
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
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'customers' },
        async () => {
          await loadCustomers()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  const driverMap = useMemo(() => {
    return drivers.reduce<Record<string, Driver>>((acc, driver) => {
      acc[driver.id] = driver
      return acc
    }, {})
  }, [drivers])

  const selectedCustomer = useMemo(() => {
    return customers.find((customer) => customer.id === form.customer_id) || null
  }, [customers, form.customer_id])

  const filteredOrders = useMemo(() => {
    const query = search.trim().toLowerCase()

    return orders.filter((order) => {
      const driverRelation = firstRelation(order.drivers)
      const customerRelation = firstRelation(order.customers)
      const binRelation = firstRelation(order.bins)
      const oldBinRelation = firstRelation(order.old_bin)

      const driverName =
        driverRelation?.name || (order.driver_id ? driverMap[order.driver_id]?.name || '' : '')
      const customerName = customerRelation?.name || order.customer_name || ''
      const binLabel = binRelation?.bin_number || ''
      const oldBinLabel = oldBinRelation?.bin_number || ''

      const matchesSearch =
        !query ||
        customerName.toLowerCase().includes(query) ||
        (order.pickup_address || '').toLowerCase().includes(query) ||
        (order.bin_type || '').toLowerCase().includes(query) ||
        (order.bin_size || '').toLowerCase().includes(query) ||
        (order.order_type || '').toLowerCase().includes(query) ||
        driverName.toLowerCase().includes(query) ||
        (order.notes || '').toLowerCase().includes(query) ||
        (order.ticket_number || '').toLowerCase().includes(query) ||
        binLabel.toLowerCase().includes(query) ||
        oldBinLabel.toLowerCase().includes(query)

      const matchesStatus =
        statusFilter === 'all' || (order.status || 'unassigned') === statusFilter

      const matchesDriver =
        driverFilter === 'all' || (order.driver_id || '') === driverFilter

      const matchesOrderType =
        orderTypeFilter === 'all' || (order.order_type || 'DELIVERY') === orderTypeFilter

      return matchesSearch && matchesStatus && matchesDriver && matchesOrderType
    })
  }, [orders, search, statusFilter, driverFilter, orderTypeFilter, driverMap])

  const counts = useMemo(() => {
    return {
      total: orders.length,
      unassigned: orders.filter((order) => (order.status || 'unassigned') === 'unassigned').length,
      assigned: orders.filter((order) => order.status === 'assigned').length,
      in_progress: orders.filter((order) => order.status === 'in_progress').length,
      completed: orders.filter((order) => order.status === 'completed').length,
    }
  }, [orders])

  const assignableDrivers = useMemo(() => {
    return drivers.filter((driver) => driver.status !== 'offline')
  }, [drivers])

  const inUseBins = useMemo(() => {
    return bins.filter((bin) => bin.status === 'in_use')
  }, [bins])

  const currentAvailableBinCount = useMemo(() => {
    return bins.filter(
      (bin) =>
        bin.status === 'available' &&
        bin.bin_size === form.bin_size &&
        bin.bin_type === form.bin_type &&
        bin.id !== form.old_bin_id
    ).length
  }, [bins, form.bin_size, form.bin_type, form.old_bin_id])

  function openCreateModal() {
    setEditingOrder(null)
    setForm(emptyForm)
    setShowCreateModal(true)
    setPageError('')
  }

  function openEditModal(order: Order) {
    const customerRelation = firstRelation(order.customers)
    const binRelation = firstRelation(order.bins)
    const oldBinRelation = firstRelation(order.old_bin)

    setEditingOrder(order)
    setShowCreateModal(false)
    setPageError('')
    setForm({
      customer_id: order.customer_id || '',
      customer_name: customerRelation?.name || order.customer_name || '',
      pickup_address: order.pickup_address || '',
      bin_size: order.bin_size || binRelation?.bin_size || oldBinRelation?.bin_size || '20',
      bin_type: order.bin_type || binRelation?.bin_type || oldBinRelation?.bin_type || 'Garbage',
      order_type: order.order_type || 'DELIVERY',
      driver_id: order.driver_id || '',
      scheduled_date: order.scheduled_date
        ? new Date(order.scheduled_date).toISOString().slice(0, 10)
        : '',
      status: order.status || 'unassigned',
      bin_id: order.bin_id || '',
      old_bin_id: order.old_bin_id || '',
      notes: order.notes || '',
    })
  }

  function closeModal() {
    setEditingOrder(null)
    setShowCreateModal(false)
    setForm(emptyForm)
    setPageError('')
  }

  function handleCustomerChange(customerId: string) {
    const customer = customers.find((item) => item.id === customerId)

    setForm((prev) => ({
      ...prev,
      customer_id: customerId,
      customer_name: customer?.name || prev.customer_name,
    }))
  }

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

  async function reserveMatchingBin(
    size: string,
    type: string,
    excludeBinId?: string | null,
    keepCurrentBinId?: string | null
  ): Promise<Bin | null> {
    if (keepCurrentBinId) {
      const keepBin = bins.find((bin) => bin.id === keepCurrentBinId)
      if (keepBin && keepBin.bin_size === size && keepBin.bin_type === type) {
        await occupyBin(keepBin.id)
        return keepBin
      }
    }

    const { data, error } = await supabase
      .from('bins')
      .select('id,bin_number,bin_size,bin_type,status')
      .eq('bin_size', size)
      .eq('bin_type', type)
      .eq('status', 'available')
      .order('bin_number', { ascending: true })
      .limit(20)

    if (error) {
      throw new Error(error.message)
    }

    const found =
      ((data as Bin[] | null) || []).find((bin) => bin.id !== excludeBinId) || null

    if (!found) return null

    await occupyBin(found.id)
    return found
  }

  async function applyWorkflowAndBuildPayload() {
    const orderType = form.order_type || 'DELIVERY'
    const status = form.status || 'unassigned'

    const basePayload = {
      customer_id: form.customer_id || null,
      customer_name: form.customer_name || null,
      pickup_address: form.pickup_address.trim() || null,
      bin_size: form.bin_size || null,
      bin_type: form.bin_type || null,
      order_type: orderType,
      driver_id: form.driver_id || null,
      scheduled_date: form.scheduled_date || null,
      status,
      notes: form.notes || null,
    }

    if (orderType === 'DELIVERY') {
      const matchedBin = await reserveMatchingBin(
        form.bin_size,
        form.bin_type,
        null,
        editingOrder?.bin_id || null
      )

      if (!matchedBin) {
        throw new Error(`No available ${form.bin_size} yard ${form.bin_type} bin found.`)
      }

      return {
        payload: {
          ...basePayload,
          bin_id: matchedBin.id,
          old_bin_id: null,
        },
        assignedBinId: matchedBin.id,
        releasedBinId:
          editingOrder?.bin_id && editingOrder.bin_id !== matchedBin.id ? editingOrder.bin_id : null,
      }
    }

    if (orderType === 'EXCHANGE') {
      if (!form.old_bin_id) {
        throw new Error('Exchange requires an old bin.')
      }

      const matchedBin = await reserveMatchingBin(
        form.bin_size,
        form.bin_type,
        form.old_bin_id,
        editingOrder?.bin_id && editingOrder.bin_id !== form.old_bin_id ? editingOrder.bin_id : null
      )

      if (!matchedBin) {
        throw new Error(`No available ${form.bin_size} yard ${form.bin_type} bin found for exchange.`)
      }

      return {
        payload: {
          ...basePayload,
          bin_id: matchedBin.id,
          old_bin_id: form.old_bin_id,
        },
        assignedBinId: matchedBin.id,
        releasedBinId: form.old_bin_id,
      }
    }

    if (orderType === 'REMOVAL') {
      if (!form.old_bin_id) {
        throw new Error('Removal requires an old bin.')
      }

      return {
        payload: {
          ...basePayload,
          bin_id: null,
          old_bin_id: form.old_bin_id,
        },
        assignedBinId: null,
        releasedBinId: form.old_bin_id,
      }
    }

    if (orderType === 'DUMP RETURN') {
      const sameBinId = form.old_bin_id || form.bin_id || editingOrder?.bin_id || null

      if (!sameBinId) {
        throw new Error('Dump return requires an existing bin.')
      }

      await occupyBin(sameBinId)

      return {
        payload: {
          ...basePayload,
          bin_id: sameBinId,
          old_bin_id: sameBinId,
        },
        assignedBinId: sameBinId,
        releasedBinId: null,
      }
    }

    throw new Error('Invalid order type.')
  }

  async function handleCreateOrUpdate() {
    setSaving(true)
    setPageError('')

    try {
      if (!form.customer_id && !form.customer_name.trim()) {
        throw new Error('Customer is required.')
      }

      if (!form.pickup_address.trim()) {
        throw new Error('Service / job site address is required.')
      }

      const previousDriverId = editingOrder?.driver_id || null
      const previousBinId = editingOrder?.bin_id || null
      const previousOldBinId = editingOrder?.old_bin_id || null

      const { payload, assignedBinId, releasedBinId } = await applyWorkflowAndBuildPayload()

      if (editingOrder) {
        const { error } = await supabase
          .from(TABLE_NAME)
          .update(payload)
          .eq('id', editingOrder.id)

        if (error) {
          throw new Error(error.message)
        }

        if (previousDriverId && previousDriverId !== payload.driver_id) {
          await syncDriverStatuses(previousDriverId)
        }

        if (payload.driver_id) {
          await syncDriverStatuses(payload.driver_id)
        }

        if (
          previousBinId &&
          previousBinId !== assignedBinId &&
          previousBinId !== releasedBinId &&
          previousBinId !== previousOldBinId
        ) {
          await releaseBin(previousBinId)
        }

        if (
          previousOldBinId &&
          previousOldBinId !== releasedBinId &&
          previousOldBinId !== assignedBinId
        ) {
          await occupyBin(previousOldBinId)
        }

        if (releasedBinId && releasedBinId !== assignedBinId) {
          await releaseBin(releasedBinId)
        }

        if (assignedBinId) {
          await occupyBin(assignedBinId)
        }

        if (payload.status === 'completed' || payload.status === 'issue') {
          if (payload.order_type === 'REMOVAL') {
            await releaseBin(payload.old_bin_id)
          } else if (payload.order_type === 'EXCHANGE') {
            await releaseBin(payload.old_bin_id)
            await occupyBin(payload.bin_id)
          } else if (payload.order_type === 'DELIVERY') {
            await occupyBin(payload.bin_id)
          } else if (payload.order_type === 'DUMP RETURN') {
            await occupyBin(payload.bin_id)
          }
        }

        await refreshAll()
        closeModal()
      } else {
        const { error } = await supabase.from(TABLE_NAME).insert([payload])

        if (error) {
          throw new Error(error.message)
        }

        if (payload.driver_id) {
          await syncDriverStatuses(payload.driver_id)
        }

        if (releasedBinId && releasedBinId !== assignedBinId) {
          await releaseBin(releasedBinId)
        }

        if (assignedBinId) {
          await occupyBin(assignedBinId)
        }

        if ((payload.status === 'completed' || payload.status === 'issue') && payload.order_type === 'REMOVAL') {
          await releaseBin(payload.old_bin_id)
        }

        await refreshAll()
        closeModal()
      }
    } catch (error: any) {
      setPageError(error.message || 'Failed to save order.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(
    orderId: string,
    driverId?: string | null,
    binId?: string | null,
    oldBinId?: string | null
  ) {
    const confirmed = window.confirm('Delete this order?')
    if (!confirmed) return

    setDeletingId(orderId)
    setPageError('')

    const orderToDelete = orders.find((item) => item.id === orderId)

    const { error } = await supabase.from(TABLE_NAME).delete().eq('id', orderId)

    if (error) {
      setPageError(error.message)
      setDeletingId(null)
      return
    }

    try {
      if (driverId) {
        await syncDriverStatuses(driverId)
      }

      if (orderToDelete?.order_type === 'DELIVERY' && binId) {
        await releaseBin(binId)
      }

      if (orderToDelete?.order_type === 'EXCHANGE') {
        if (binId) await releaseBin(binId)
        if (oldBinId) await occupyBin(oldBinId)
      }

      if (orderToDelete?.order_type === 'REMOVAL' && oldBinId) {
        await occupyBin(oldBinId)
      }

      if (orderToDelete?.order_type === 'DUMP RETURN' && binId) {
        await occupyBin(binId)
      }

      await refreshAll()
    } catch (error: any) {
      setPageError(error.message || 'Failed while cleaning workflow after delete.')
    }

    setDeletingId(null)
  }

  async function handleQuickStatus(order: Order, value: string) {
    setPageError('')

    const { error } = await supabase
      .from(TABLE_NAME)
      .update({ status: value })
      .eq('id', order.id)

    if (error) {
      setPageError(error.message)
      return
    }

    try {
      if (order.driver_id) {
        await syncDriverStatuses(order.driver_id)
      }

      if (value === 'completed' || value === 'issue') {
        if (order.order_type === 'REMOVAL' && order.old_bin_id) {
          await releaseBin(order.old_bin_id)
        } else if (order.order_type === 'EXCHANGE') {
          if (order.old_bin_id && order.old_bin_id !== order.bin_id) {
            await releaseBin(order.old_bin_id)
          }
          if (order.bin_id) {
            await occupyBin(order.bin_id)
          }
        } else if (order.order_type === 'DELIVERY' && order.bin_id) {
          await occupyBin(order.bin_id)
        } else if (order.order_type === 'DUMP RETURN' && order.bin_id) {
          await occupyBin(order.bin_id)
        }
      }

      await refreshAll()
    } catch (workflowError: any) {
      setPageError(workflowError.message || 'Status changed, but workflow update failed.')
    }
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="mx-auto max-w-7xl p-4 md:p-6">
        <div className="mb-6 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">Orders</h1>
              <p className="mt-1 text-sm text-slate-500">
                Create orders with workflow-based bin assignment and separate job site addresses
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                onClick={refreshAll}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Refresh
              </button>
              <button
                onClick={openCreateModal}
                className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90"
              >
                New Order
              </button>
            </div>
          </div>

          {pageError ? (
            <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {pageError}
            </div>
          ) : null}

          <div className="mt-6 grid gap-4 md:grid-cols-5">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Total
              </div>
              <div className="mt-2 text-2xl font-bold text-slate-900">{counts.total}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Unassigned
              </div>
              <div className="mt-2 text-2xl font-bold text-slate-900">{counts.unassigned}</div>
            </div>
            <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-blue-700">
                Assigned
              </div>
              <div className="mt-2 text-2xl font-bold text-blue-900">{counts.assigned}</div>
            </div>
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                In Progress
              </div>
              <div className="mt-2 text-2xl font-bold text-amber-900">{counts.in_progress}</div>
            </div>
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                Completed
              </div>
              <div className="mt-2 text-2xl font-bold text-emerald-900">{counts.completed}</div>
            </div>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-4">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search ticket, customer, job site address, driver, bin, notes"
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-slate-400"
            />

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-slate-400"
            >
              <option value="all">All Statuses</option>
              {ORDER_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {formatStatus(status)}
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
          </div>
        </div>

        <div className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-slate-200">
          {loading ? (
            <div className="p-10 text-center text-sm text-slate-500">Loading orders...</div>
          ) : filteredOrders.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">No orders found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                      Ticket
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                      Order Type
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                      Customer
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                      Job Site Address
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                      Bin
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                      Old Bin
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                      Driver
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                      Date
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                      Status
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wide text-slate-500">
                      Actions
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100 bg-white">
                  {filteredOrders.map((order) => {
                    const driverRelation = firstRelation(order.drivers)
                    const customerRelation = firstRelation(order.customers)
                    const bin = firstRelation(order.bins)
                    const oldBin = firstRelation(order.old_bin)

                    const driver =
                      driverRelation?.name ||
                      (order.driver_id ? driverMap[order.driver_id]?.name : null) ||
                      'Unassigned'
                    const customer = customerRelation?.name || order.customer_name || 'No customer'

                    const badgeClass =
                      statusClasses[order.status || 'unassigned'] || statusClasses.unassigned

                    const orderTypeClass =
                      orderTypeClasses[order.order_type || 'DELIVERY'] ||
                      'bg-slate-100 text-slate-700 border-slate-200'

                    return (
                      <tr key={order.id} className="hover:bg-slate-50/80">
                        <td className="px-4 py-4 align-top">
                          <div className="font-semibold text-slate-900">
                            {order.ticket_number || 'Pending'}
                          </div>
                          <div className="mt-1 text-xs text-slate-500">#{order.id.slice(0, 8)}</div>
                        </td>

                        <td className="px-4 py-4 align-top text-sm text-slate-700">
                          <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${orderTypeClass}`}>
                            {formatOrderType(order.order_type)}
                          </span>
                        </td>

                        <td className="px-4 py-4 align-top">
                          <div className="font-semibold text-slate-900">{customer}</div>
                        </td>

                        <td className="px-4 py-4 align-top text-sm text-slate-700">
                          {order.pickup_address || '—'}
                        </td>

                        <td className="px-4 py-4 align-top text-sm text-slate-700">
                          {bin
                            ? `${bin.bin_number || 'Bin'} • ${bin.bin_size || order.bin_size || ''}Y ${bin.bin_type || order.bin_type || ''}`
                            : '—'}
                        </td>

                        <td className="px-4 py-4 align-top text-sm text-slate-700">
                          {oldBin
                            ? `${oldBin.bin_number || 'Bin'} • ${oldBin.bin_size || ''}Y ${oldBin.bin_type || ''}`
                            : '—'}
                        </td>

                        <td className="px-4 py-4 align-top text-sm text-slate-700">{driver}</td>

                        <td className="px-4 py-4 align-top text-sm text-slate-700">
                          {formatDate(order.scheduled_date)}
                        </td>

                        <td className="px-4 py-4 align-top">
                          <div className="flex flex-col gap-2">
                            <span
                              className={`inline-flex w-fit rounded-full border px-2.5 py-1 text-xs font-semibold ${badgeClass}`}
                            >
                              {formatStatus(order.status || 'unassigned')}
                            </span>

                            <select
                              value={order.status || 'unassigned'}
                              onChange={(e) => handleQuickStatus(order, e.target.value)}
                              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-slate-400"
                            >
                              {ORDER_STATUSES.map((status) => (
                                <option key={status} value={status}>
                                  {formatStatus(status)}
                                </option>
                              ))}
                            </select>
                          </div>
                        </td>

                        <td className="px-4 py-4 align-top">
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => openEditModal(order)}
                              className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition hover:opacity-90"
                            >
                              Edit
                            </button>

                            <button
                              onClick={() =>
                                handleDelete(order.id, order.driver_id, order.bin_id, order.old_bin_id)
                              }
                              disabled={deletingId === order.id}
                              className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                            >
                              {deletingId === order.id ? 'Deleting...' : 'Delete'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="mt-6 flex justify-center">
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            Back to Dashboard
          </Link>
        </div>
      </div>

      {(showCreateModal || editingOrder) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-3xl rounded-3xl bg-white p-6 shadow-2xl">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-slate-900">
                  {editingOrder ? 'Edit Order' : 'Create Order'}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Customer company info stays on the customer record. Enter the actual bin placement address here.
                </p>
              </div>

              <button
                onClick={closeModal}
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
                  Customer
                </label>
                <select
                  value={form.customer_id}
                  onChange={(e) => handleCustomerChange(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-slate-400"
                >
                  <option value="">Select customer</option>
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name || 'Unnamed Customer'}
                    </option>
                  ))}
                </select>
              </div>

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
                  placeholder="Customer name"
                />
              </div>

              {selectedCustomer?.address ? (
                <div className="md:col-span-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  <div className="font-semibold text-slate-900">Customer company / billing address</div>
                  <div className="mt-1">{selectedCustomer.address}</div>
                  <div className="mt-2 text-slate-500">
                    This is only a reference. Enter the real bin placement address below.
                  </div>
                </div>
              ) : null}

              <div className="md:col-span-2">
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Service / Job Site Address
                </label>
                <input
                  value={form.pickup_address}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, pickup_address: e.target.value }))
                  }
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-slate-400"
                  placeholder="Address where the bin will be delivered, exchanged, removed, or returned"
                />
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
                  Bin Type
                </label>
                <select
                  value={form.bin_type}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, bin_type: e.target.value, bin_id: '' }))
                  }
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-slate-400"
                >
                  {BIN_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
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
                  {assignableDrivers.map((driver) => (
                    <option key={driver.id} value={driver.id}>
                      {driver.name || 'Unnamed Driver'}
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
                        bin_id: prev.order_type === 'DUMP RETURN' ? e.target.value : prev.bin_id,
                      }))
                    }
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-slate-400"
                  >
                    <option value="">Select current bin</option>
                    {inUseBins.map((bin) => (
                      <option key={bin.id} value={bin.id}>
                        {bin.bin_number || 'Bin'} • {bin.bin_size || ''}Y {bin.bin_type || ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {(form.order_type === 'DELIVERY' || form.order_type === 'EXCHANGE') && (
                <div className="md:col-span-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  Matching available bins:{' '}
                  <span className="font-semibold">{currentAvailableBinCount}</span>
                </div>
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
                  {ORDER_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {formatStatus(status)}
                    </option>
                  ))}
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
                  placeholder="Special instructions, gate code, contact notes..."
                />
              </div>

              <div className="md:col-span-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                <div className="font-semibold text-slate-900">Workflow preview</div>
                <div className="mt-2 space-y-1">
                  {form.order_type === 'DELIVERY' && (
                    <p>• Assigns a new available matching bin and marks it in use.</p>
                  )}
                  {form.order_type === 'EXCHANGE' && (
                    <p>• Assigns a new available matching bin and releases the old bin.</p>
                  )}
                  {form.order_type === 'REMOVAL' && (
                    <p>• Releases the old bin and does not assign a new one.</p>
                  )}
                  {form.order_type === 'DUMP RETURN' && (
                    <p>• Keeps the same bin cycling back in use.</p>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={closeModal}
                className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>

              <button
                onClick={handleCreateOrUpdate}
                disabled={saving}
                className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
              >
                {saving ? 'Saving...' : editingOrder ? 'Save Changes' : 'Create Order'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}