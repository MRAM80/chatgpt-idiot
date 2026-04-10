'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
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
  status?: string | null
}

type Bin = {
  id: string
  bin_number: string | null
  bin_size: string | null
  status: string | null
  location?: string | null
}

type Profile = {
  id: string
  email: string | null
  role: string | null
  full_name: string | null
  company?: string | null
  is_active?: boolean | null
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
  status?: string | null
  location?: string | null
}

type Order = {
  id: string
  ticket_number: string | null
  customer_id: string | null
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
  driver_id: string | null
  scheduled_date: string | null
  status: string | null
  notes: string | null
  completed_by?: string | null
  completed_at?: string | null
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
  'cancelled',
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

const statusClasses: Record<string, string> = {
  unassigned: 'bg-slate-100 text-slate-700 border-slate-200',
  assigned: 'bg-blue-100 text-blue-700 border-blue-200',
  in_progress: 'bg-amber-100 text-amber-700 border-amber-200',
  completed: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  issue: 'bg-rose-100 text-rose-700 border-rose-200',
  cancelled: 'bg-slate-200 text-slate-700 border-slate-300',
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
  service_time: string
  service_window: string
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
  service_time: '',
  service_window: 'Anytime',
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

function normalizeAddress(value: string | null | undefined) {
  return (value || '').trim().toLowerCase()
}

function generateTicketNumber() {
  return `ST-${Math.random().toString(36).slice(2, 10).toUpperCase()}`
}

function OrdersPageContent() {
  const supabase = createClient()
  const router = useRouter()
  const searchParams = useSearchParams()

  const [orders, setOrders] = useState<Order[]>([])
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [bins, setBins] = useState<Bin[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [pageError, setPageError] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)
  const [currentUser, setCurrentUser] = useState<Profile | null>(null)

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [driverFilter, setDriverFilter] = useState('all')
  const [orderTypeFilter, setOrderTypeFilter] = useState('all')

  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingOrder, setEditingOrder] = useState<Order | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)

  const modalTitleRef = useRef<HTMLInputElement | null>(null)
  const modalCardRef = useRef<HTMLDivElement | null>(null)
  const [modalVisible, setModalVisible] = useState(false)

  const isCompletedEditing = editingOrder?.status === 'completed'
  const isReadOnlyModal = Boolean(isCompletedEditing)

  async function loadOrders() {
    const { data, error } = await supabase
      .from(TABLE_NAME)
      .select(`
        id,
        ticket_number,
        customer_id,
        customer_name,
        pickup_address,
        service_address,
        service_time,
        service_window,
        bin_id,
        old_bin_id,
        bin_size,
        bin_type,
        order_type,
        driver_id,
        scheduled_date,
        status,
        notes,
        completed_by,
        completed_at,
        created_at,
        updated_at,
        customers:customer_id ( id, name, address ),
        drivers:driver_id ( id, name ),
        bins:bin_id ( id, bin_number, bin_size, status, location ),
        old_bin:old_bin_id ( id, bin_number, bin_size, status, location )
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
      .select('id,bin_number,bin_size,status,location')
      .order('bin_number', { ascending: true })

    if (error) {
      setPageError(error.message)
      return
    }

    setBins((data as Bin[]) || [])
  }

  async function loadUserRole() {
    const { data: authData, error: authError } = await supabase.auth.getUser()

    if (authError || !authData?.user) return

    const { data: profile, error } = await supabase
      .from('profiles')
      .select('id,email,role,full_name,company,is_active')
      .eq('id', authData.user.id)
      .single()

    if (error) {
      setPageError((prev) => prev || error.message)
      return
    }

    const typedProfile = profile as Profile
    setCurrentUser(typedProfile)
    setIsAdmin((typedProfile?.role || '').toLowerCase() === 'admin')
  }

  async function refreshAll() {
    setLoading(true)
    setPageError('')
    await Promise.all([
      loadOrders(),
      loadDrivers(),
      loadCustomers(),
      loadBins(),
      loadUserRole(),
    ])
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

  useEffect(() => {
    if (showCreateModal || editingOrder) {
      setModalVisible(false)

      const animationTimer = window.setTimeout(() => {
        setModalVisible(true)
        modalCardRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        })
      }, 20)

      const focusTimer = window.setTimeout(() => {
        if (!isReadOnlyModal) {
          modalTitleRef.current?.focus()
        }
      }, 140)

      return () => {
        window.clearTimeout(animationTimer)
        window.clearTimeout(focusTimer)
      }
    } else {
      setModalVisible(false)
    }
  }, [showCreateModal, editingOrder, isReadOnlyModal])

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
      const serviceAddress = order.service_address || order.pickup_address || ''
      const binLabel = binRelation?.bin_number || ''
      const oldBinLabel = oldBinRelation?.bin_number || ''

      const matchesSearch =
        !query ||
        customerName.toLowerCase().includes(query) ||
        serviceAddress.toLowerCase().includes(query) ||
        (order.bin_type || '').toLowerCase().includes(query) ||
        (order.bin_size || '').toLowerCase().includes(query) ||
        (order.order_type || '').toLowerCase().includes(query) ||
        (order.service_time || '').toLowerCase().includes(query) ||
        (order.service_window || '').toLowerCase().includes(query) ||
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

  const availableBinsForSelectedSize = useMemo(() => {
    return bins.filter((bin) => {
      if (bin.status !== 'available') return false
      if ((bin.bin_size || '') !== form.bin_size) return false
      if (form.order_type === 'EXCHANGE' && form.old_bin_id && bin.id === form.old_bin_id) return false
      return true
    })
  }, [bins, form.bin_size, form.order_type, form.old_bin_id])

  const binsAtSelectedJobSite = useMemo(() => {
    const jobSite = normalizeAddress(form.pickup_address)
    if (!jobSite) return []

    const linkedBinIds = new Set<string>()

    for (const order of orders) {
      const orderAddress = normalizeAddress(order.service_address || order.pickup_address)

      if (orderAddress !== jobSite) continue

      if (order.bin_id) linkedBinIds.add(order.bin_id)
      if (order.old_bin_id) linkedBinIds.add(order.old_bin_id)
    }

    const combined = bins.filter((bin) => {
      const byLocation = normalizeAddress(bin.location) === jobSite
      const byOrderHistory = linkedBinIds.has(bin.id)
      return byLocation || byOrderHistory
    })

    const uniqueMap = new Map<string, Bin>()
    for (const bin of combined) {
      uniqueMap.set(bin.id, bin)
    }

    return Array.from(uniqueMap.values())
  }, [bins, orders, form.pickup_address])

  const jobSiteExistingBins = useMemo(() => {
    return binsAtSelectedJobSite.filter((bin) => {
      if (form.order_type === 'EXCHANGE' || form.order_type === 'REMOVAL') {
        return (
          bin.status === 'in_use' ||
          normalizeAddress(bin.location) === normalizeAddress(form.pickup_address)
        )
      }

      if (form.order_type === 'DUMP RETURN') {
        return true
      }

      return false
    })
  }, [binsAtSelectedJobSite, form.order_type, form.pickup_address])

  const currentAvailableBinCount = useMemo(() => {
    return availableBinsForSelectedSize.length
  }, [availableBinsForSelectedSize])

  function getCompletedByLabel() {
    if (!currentUser) return 'System'
    return currentUser.full_name || currentUser.email || 'System'
  }

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
      pickup_address: order.service_address || order.pickup_address || '',
      service_time: order.service_time || '',
      service_window: order.service_window || 'Anytime',
      bin_size: order.bin_size || binRelation?.bin_size || oldBinRelation?.bin_size || '20',
      bin_type: order.bin_type || 'Garbage',
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

  useEffect(() => {
    const orderId = searchParams.get('orderId')
    if (!orderId || orders.length === 0) return

    const match = orders.find((order) => order.id === orderId)
    if (match) {
      openEditModal(match)
    }
  }, [searchParams, orders])

  function closeModal() {
    setEditingOrder(null)
    setShowCreateModal(false)
    setForm(emptyForm)
    setPageError('')

    const params = new URLSearchParams(searchParams.toString())
    params.delete('orderId')
    const next = params.toString()
    router.replace(next ? `/order?${next}` : '/order')
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

  async function setBinStatus(
    binId: string,
    status: 'available' | 'in_use',
    location?: string | null
  ) {
    const payload: Record<string, string | null> = { status }

    if (typeof location !== 'undefined') {
      payload.location = location
    }

    const { error } = await supabase.from('bins').update(payload).eq('id', binId)

    if (error) {
      throw new Error(error.message)
    }
  }

  async function releaseBin(binId: string | null) {
    if (!binId) return
    await setBinStatus(binId, 'available', 'Yard')
  }

  async function occupyBin(binId: string | null, location?: string | null) {
    if (!binId) return
    await setBinStatus(binId, 'in_use', location ?? undefined)
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

  async function applyWorkflowAndBuildPayload() {
    const orderType = form.order_type || 'DELIVERY'
    const status = form.status || 'unassigned'
    const jobSiteAddress = form.pickup_address.trim() || null

    const completionFields =
      status === 'completed'
        ? {
            completed_by: editingOrder?.completed_by || getCompletedByLabel(),
            completed_at: editingOrder?.completed_at || new Date().toISOString(),
          }
        : {
            completed_by: editingOrder?.completed_by || null,
            completed_at: editingOrder?.completed_at || null,
          }

    const basePayload = {
      customer_id: form.customer_id || null,
      customer_name: form.customer_name || null,
      pickup_address: jobSiteAddress,
      service_address: jobSiteAddress,
      service_time: form.service_time || null,
      service_window: form.service_window || null,
      bin_size: form.bin_size || null,
      bin_type: form.bin_type || null,
      order_type: orderType,
      driver_id: form.driver_id || null,
      scheduled_date: form.scheduled_date || null,
      status,
      notes: form.notes || null,
      ...completionFields,
    }

    if (orderType === 'DELIVERY') {
      if (!form.bin_id) {
        throw new Error('Please select an available bin.')
      }

      const selectedBin = await validateSelectedAvailableBin(form.bin_id, form.bin_size)

      return {
        payload: {
          ...basePayload,
          bin_id: selectedBin.id,
          old_bin_id: null,
        },
        assignedBinId: selectedBin.id,
        releasedBinId:
          editingOrder?.bin_id && editingOrder.bin_id !== selectedBin.id ? editingOrder.bin_id : null,
      }
    }

    if (orderType === 'EXCHANGE') {
      if (!form.old_bin_id) {
        throw new Error('Exchange requires the current bin from this Job Site.')
      }

      if (!form.bin_id) {
        throw new Error('Please select the replacement bin.')
      }

      const selectedBin = await validateSelectedAvailableBin(
        form.bin_id,
        form.bin_size,
        form.old_bin_id
      )

      return {
        payload: {
          ...basePayload,
          bin_id: selectedBin.id,
          old_bin_id: form.old_bin_id,
        },
        assignedBinId: selectedBin.id,
        releasedBinId: form.old_bin_id,
      }
    }

    if (orderType === 'REMOVAL') {
      if (!form.old_bin_id) {
        throw new Error('Removal requires the current bin from this Job Site.')
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
      const sameBinId = form.old_bin_id || editingOrder?.bin_id || null

      if (!sameBinId) {
        throw new Error('Dump return requires the existing bin from this Job Site.')
      }

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
    if (isReadOnlyModal) {
      closeModal()
      return
    }

    setSaving(true)
    setPageError('')

    try {
      if (!form.customer_id && !form.customer_name.trim()) {
        throw new Error('Customer is required.')
      }

      if (!form.pickup_address.trim()) {
        throw new Error('Job Site Address is required.')
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
          await occupyBin(
            previousOldBinId,
            editingOrder?.service_address || editingOrder?.pickup_address || null
          )
        }

        if (releasedBinId && releasedBinId !== assignedBinId) {
          await releaseBin(releasedBinId)
        }

        if (assignedBinId) {
          await occupyBin(assignedBinId, form.pickup_address.trim() || null)
        }

        if (
          payload.status === 'completed' ||
          payload.status === 'issue' ||
          payload.status === 'cancelled'
        ) {
          if (payload.order_type === 'REMOVAL') {
            await releaseBin(payload.old_bin_id)
          } else if (payload.order_type === 'EXCHANGE') {
            await releaseBin(payload.old_bin_id)
            if (payload.status !== 'cancelled') {
              await occupyBin(payload.bin_id, form.pickup_address.trim() || null)
            } else if (payload.bin_id) {
              await releaseBin(payload.bin_id)
            }
          } else if (payload.order_type === 'DELIVERY') {
            if (payload.status === 'cancelled') {
              await releaseBin(payload.bin_id)
            } else {
              await occupyBin(payload.bin_id, form.pickup_address.trim() || null)
            }
          } else if (payload.order_type === 'DUMP RETURN') {
            if (payload.bin_id) {
              await occupyBin(payload.bin_id, form.pickup_address.trim() || null)
            }
          }
        }

        await refreshAll()
        closeModal()
      } else {
        const insertPayload = {
          ...payload,
          ticket_number: generateTicketNumber(),
        }

        const { error } = await supabase.from(TABLE_NAME).insert([insertPayload])

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
          await occupyBin(assignedBinId, form.pickup_address.trim() || null)
        }

        if (
          (payload.status === 'completed' ||
            payload.status === 'issue' ||
            payload.status === 'cancelled') &&
          payload.order_type === 'REMOVAL'
        ) {
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
    const orderToDelete = orders.find((item) => item.id === orderId)

    if (orderToDelete?.status === 'completed' && !isAdmin) {
      setPageError('Only admin can delete completed orders.')
      return
    }

    const confirmed = window.confirm('Delete this order?')
    if (!confirmed) return

    setDeletingId(orderId)
    setPageError('')

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
        if (oldBinId) {
          await occupyBin(
            oldBinId,
            orderToDelete.service_address || orderToDelete.pickup_address || null
          )
        }
      }

      if (orderToDelete?.order_type === 'REMOVAL' && oldBinId) {
        await occupyBin(
          oldBinId,
          orderToDelete.service_address || orderToDelete.pickup_address || null
        )
      }

      if (orderToDelete?.order_type === 'DUMP RETURN' && binId) {
        await occupyBin(
          binId,
          orderToDelete.service_address || orderToDelete.pickup_address || null
        )
      }

      await refreshAll()
    } catch (error: any) {
      setPageError(error.message || 'Failed while cleaning workflow after delete.')
    }

    setDeletingId(null)
  }

  async function handleQuickStatus(order: Order, value: string) {
    if (order.status === 'completed') {
      setPageError('Completed orders are locked and cannot be edited.')
      return
    }

    setPageError('')

    const updatePayload: Record<string, string | null> = { status: value }

    if (value === 'completed') {
      updatePayload.completed_by = order.completed_by || getCompletedByLabel()
      updatePayload.completed_at = order.completed_at || new Date().toISOString()
    }

    const { error } = await supabase
      .from(TABLE_NAME)
      .update(updatePayload)
      .eq('id', order.id)

    if (error) {
      setPageError(error.message)
      return
    }

    try {
      if (order.driver_id) {
        await syncDriverStatuses(order.driver_id)
      }

      if (value === 'completed' || value === 'issue' || value === 'cancelled') {
        if (order.order_type === 'REMOVAL' && order.old_bin_id) {
          await releaseBin(order.old_bin_id)
        } else if (order.order_type === 'EXCHANGE') {
          if (order.old_bin_id && order.old_bin_id !== order.bin_id) {
            await releaseBin(order.old_bin_id)
          }
          if (value === 'cancelled') {
            if (order.bin_id) {
              await releaseBin(order.bin_id)
            }
          } else if (order.bin_id) {
            await occupyBin(order.bin_id, order.service_address || order.pickup_address || null)
          }
        } else if (order.order_type === 'DELIVERY' && order.bin_id) {
          if (value === 'cancelled') {
            await releaseBin(order.bin_id)
          } else {
            await occupyBin(order.bin_id, order.service_address || order.pickup_address || null)
          }
        } else if (order.order_type === 'DUMP RETURN' && order.bin_id) {
          await occupyBin(order.bin_id, order.service_address || order.pickup_address || null)
        }
      }

      await refreshAll()
    } catch (workflowError: any) {
      setPageError(workflowError.message || 'Status changed, but workflow update failed.')
    }
  }

  async function handleCancelOrder() {
    if (!editingOrder) return

    const confirmed = window.confirm('Cancel this order?')
    if (!confirmed) return

    setSaving(true)
    setPageError('')

    try {
      await handleQuickStatus(editingOrder, 'cancelled')
      closeModal()
    } catch (error: any) {
      setPageError(error.message || 'Failed to cancel order.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="mx-auto max-w-[96rem] p-4 md:p-6">
        <div className="mb-6 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">Orders</h1>
              <p className="mt-1 text-sm text-slate-500">
                Create orders with selected bin assignment, active customers only, Job Site Address, and service time requests
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
              placeholder="Search ticket, customer, job site address, driver, notes"
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
              <table className="min-w-[1360px] divide-y divide-slate-200">
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
                      Service Time
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                      Date
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                      Bin Size
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                      Material
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                      Driver
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                      Status
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100 bg-white">
                  {filteredOrders.map((order) => {
                    const driverRelation = firstRelation(order.drivers)
                    const customerRelation = firstRelation(order.customers)

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
                      <tr
                        key={order.id}
                        className="cursor-pointer hover:bg-slate-50/80"
                        onClick={() => openEditModal(order)}
                      >
                        <td className="px-4 py-4 align-top">
                          <div className="font-semibold text-slate-900">
                            {order.ticket_number || 'Pending'}
                          </div>
                          <div className="mt-1 text-xs text-slate-500">#{order.id.slice(0, 8)}</div>
                        </td>

                        <td className="px-4 py-4 align-top text-sm text-slate-700">
                          <span
                            className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${orderTypeClass}`}
                          >
                            {formatOrderType(order.order_type)}
                          </span>
                        </td>

                        <td className="px-4 py-4 align-top">
                          <div className="font-semibold text-slate-900">{customer}</div>
                        </td>

                        <td className="px-4 py-4 align-top text-sm text-slate-700">
                          {order.service_address || order.pickup_address || '—'}
                        </td>

                        <td className="px-4 py-4 align-top text-sm text-slate-700 whitespace-nowrap">
                          {formatServiceTime(order.service_time)}
                        </td>

                        <td className="px-4 py-4 align-top text-sm text-slate-700 whitespace-nowrap">
                          {formatDate(order.scheduled_date)}
                        </td>

                        <td className="px-4 py-4 align-top text-sm text-slate-700 whitespace-nowrap">
                          {order.bin_size ? `${order.bin_size}Y` : '—'}
                        </td>

                        <td className="px-4 py-4 align-top text-sm text-slate-700">
                          {order.bin_type || '—'}
                        </td>

                        <td className="px-4 py-4 align-top text-sm text-slate-700">{driver}</td>

                        <td className="px-4 py-4 align-top">
                          <span
                            className={`inline-flex w-fit rounded-full border px-2.5 py-1 text-xs font-semibold ${badgeClass}`}
                          >
                            {formatStatus(order.status || 'unassigned')}
                          </span>
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
        <div
          className={`fixed inset-0 z-50 flex items-center justify-center p-4 transition-all duration-300 ease-out ${
            modalVisible ? 'bg-slate-900/40 opacity-100' : 'bg-slate-900/0 opacity-0'
          }`}
        >
          <div
            ref={modalCardRef}
            className={`w-full max-w-3xl rounded-3xl bg-white p-6 shadow-2xl transition-all duration-300 ease-out ${
              modalVisible
                ? 'translate-y-0 scale-100 opacity-100'
                : 'translate-y-4 scale-[0.985] opacity-0'
            }`}
          >
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {editingOrder?.ticket_number || 'New Order'}
                </div>
                <h2 className="mt-1 text-xl font-bold text-slate-900">
                  {editingOrder
                    ? isReadOnlyModal
                      ? 'Order Details'
                      : 'Edit Order'
                    : 'Create Order'}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {isReadOnlyModal
                    ? 'This completed order is locked. You can view it, but you cannot edit anything.'
                    : 'Customer company info stays on the customer record. Enter the actual Job Site Address and requested service time here.'}
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
                  disabled={isReadOnlyModal}
                  onChange={(e) => handleCustomerChange(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-slate-400 disabled:bg-slate-50 disabled:text-slate-500"
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
                  ref={modalTitleRef}
                  value={form.customer_name}
                  disabled={isReadOnlyModal}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, customer_name: e.target.value }))
                  }
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-slate-400 disabled:bg-slate-50 disabled:text-slate-500"
                  placeholder="Customer name"
                />
              </div>

              {selectedCustomer?.address ? (
                <div className="md:col-span-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  <div className="font-semibold text-slate-900">Company / Billing Address</div>
                  <div className="mt-1">{selectedCustomer.address}</div>
                  <div className="mt-2 text-slate-500">
                    This is only a reference. Enter the real Job Site Address below.
                  </div>
                </div>
              ) : null}

              <div className="md:col-span-2">
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Job Site Address
                </label>
                <input
                  value={form.pickup_address}
                  disabled={isReadOnlyModal}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, pickup_address: e.target.value }))
                  }
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-slate-400 disabled:bg-slate-50 disabled:text-slate-500"
                  placeholder="Address where the bin will be delivered, exchanged, removed, or returned"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Service Time
                </label>
                <input
                  type="time"
                  value={form.service_time}
                  disabled={isReadOnlyModal}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, service_time: e.target.value }))
                  }
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-slate-400 disabled:bg-slate-50 disabled:text-slate-500"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Service Window
                </label>
                <select
                  value={form.service_window}
                  disabled={isReadOnlyModal}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, service_window: e.target.value }))
                  }
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-slate-400 disabled:bg-slate-50 disabled:text-slate-500"
                >
                  {SERVICE_WINDOWS.map((windowOption) => (
                    <option key={windowOption} value={windowOption}>
                      {windowOption}
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
                  disabled={isReadOnlyModal}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      bin_size: e.target.value,
                      bin_id: '',
                    }))
                  }
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-slate-400 disabled:bg-slate-50 disabled:text-slate-500"
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
                  Material / Bin Type
                </label>
                <select
                  value={form.bin_type}
                  disabled={isReadOnlyModal}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, bin_type: e.target.value }))
                  }
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-slate-400 disabled:bg-slate-50 disabled:text-slate-500"
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
                  Order Type
                </label>
                <select
                  value={form.order_type}
                  disabled={isReadOnlyModal}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      order_type: e.target.value,
                      bin_id: '',
                      old_bin_id: '',
                    }))
                  }
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-slate-400 disabled:bg-slate-50 disabled:text-slate-500"
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
                  disabled={isReadOnlyModal}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, driver_id: e.target.value }))
                  }
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-slate-400 disabled:bg-slate-50 disabled:text-slate-500"
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
                    {form.order_type === 'DUMP RETURN'
                      ? 'Bin at this Job Site'
                      : 'Old / Existing Bin at this Job Site'}
                  </label>
                  <select
                    value={form.old_bin_id}
                    disabled={isReadOnlyModal}
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
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-slate-400 disabled:bg-slate-50 disabled:text-slate-500"
                  >
                    <option value="">Select bin from this Job Site</option>
                    {jobSiteExistingBins.map((bin) => (
                      <option key={bin.id} value={bin.id}>
                        {bin.bin_number || 'Bin'} • {bin.bin_size || ''}Y
                        {bin.location ? ` • ${bin.location}` : ''}
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
                      disabled={isReadOnlyModal}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, bin_id: e.target.value }))
                      }
                      className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-slate-400 disabled:bg-slate-50 disabled:text-slate-500"
                    >
                      <option value="">
                        {form.order_type === 'EXCHANGE'
                          ? 'Select replacement bin'
                          : 'Select available bin'}
                      </option>
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
                    <span className="font-semibold">{currentAvailableBinCount}</span>
                  </div>
                </>
              )}

              {form.order_type === 'DUMP RETURN' && (
                <div className="md:col-span-2 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
                  DUMP RETURN uses the same bin already at the client Job Site. No replacement bin is needed.
                </div>
              )}

              {(form.order_type === 'EXCHANGE' || form.order_type === 'DUMP RETURN') && (
                <div className="md:col-span-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  Bins found at this Job Site:{' '}
                  <span className="font-semibold">{jobSiteExistingBins.length}</span>
                </div>
              )}

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Scheduled Date
                </label>
                <input
                  type="date"
                  value={form.scheduled_date}
                  disabled={isReadOnlyModal}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, scheduled_date: e.target.value }))
                  }
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-slate-400 disabled:bg-slate-50 disabled:text-slate-500"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Status
                </label>
                <select
                  value={form.status}
                  disabled={isReadOnlyModal}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, status: e.target.value }))
                  }
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-slate-400 disabled:bg-slate-50 disabled:text-slate-500"
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
                  disabled={isReadOnlyModal}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, notes: e.target.value }))
                  }
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-slate-400 disabled:bg-slate-50 disabled:text-slate-500"
                  placeholder="Special instructions, gate code, contact notes..."
                />
              </div>

              <div className="md:col-span-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                <div className="font-semibold text-slate-900">Workflow preview</div>
                <div className="mt-2 space-y-1">
                  {form.order_type === 'DELIVERY' && (
                    <p>• Uses the selected available bin and marks it in use.</p>
                  )}
                  {form.order_type === 'EXCHANGE' && (
                    <p>• Uses the selected replacement bin and releases the old bin from this Job Site.</p>
                  )}
                  {form.order_type === 'REMOVAL' && (
                    <p>• Releases the old bin and does not assign a new one.</p>
                  )}
                  {form.order_type === 'DUMP RETURN' && (
                    <p>• Uses the same bin already at this Job Site and keeps it cycling in use.</p>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              {editingOrder && !isReadOnlyModal && (
                <button
                  onClick={handleCancelOrder}
                  disabled={saving}
                  className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                >
                  Cancel Order
                </button>
              )}

              {editingOrder && isAdmin && (
                <button
                  onClick={() =>
                    handleDelete(
                      editingOrder.id,
                      editingOrder.driver_id,
                      editingOrder.bin_id,
                      editingOrder.old_bin_id
                    )
                  }
                  disabled={deletingId === editingOrder.id}
                  className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                >
                  {deletingId === editingOrder.id ? 'Deleting...' : 'Delete'}
                </button>
              )}

              <button
                onClick={closeModal}
                className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                {isReadOnlyModal ? 'Close' : 'Cancel'}
              </button>

              {!isReadOnlyModal && (
                <button
                  onClick={handleCreateOrUpdate}
                  disabled={saving}
                  className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
                >
                  {saving ? 'Saving...' : editingOrder ? 'Save Changes' : 'Create Order'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function OrdersPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-100">
          <div className="mx-auto max-w-7xl p-4 md:p-6">
            <div className="rounded-3xl bg-white p-10 text-center text-sm text-slate-500 shadow-sm ring-1 ring-slate-200">
              Loading orders...
            </div>
          </div>
        </div>
      }
    >
      <OrdersPageContent />
    </Suspense>
  )
}