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

type DumpSite = {
  id: string
  name: string | null
  address: string | null
}

type JobSite = {
  id: string
  customer_id: string | null
  site_name: string | null
  address: string | null
  notes?: string | null
  is_active?: boolean | null
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
  job_site_id?: string | null
  pickup_address: string | null
  service_address?: string | null
  service_time?: string | null
  service_window?: string | null
  bin_id: string | null
  old_bin_id: string | null
  dump_site_id?: string | null
  dump_site_address?: string | null
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
  parent_order_id?: string | null
  workflow_step?: string | null
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
const ACTIVE_BIN_ORDER_STATUSES = ['unassigned', 'assigned', 'in_progress'] as const

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
  job_site_id: string
  pickup_address: string
  scheduled_date: string
  service_time: string
  bin_size: string
  bin_type: string
  order_type: string
  driver_id: string
  status: string
  bin_id: string
  old_bin_id: string
  dump_site_id: string
  notes: string
}

const emptyForm: FormState = {
  customer_id: '',
  customer_name: '',
  job_site_id: '',
  pickup_address: '',
  scheduled_date: generateQuickDate(0),
  service_time: '',
  bin_size: '20',
  bin_type: 'Garbage',
  order_type: 'DELIVERY',
  driver_id: '',
  status: 'unassigned',
  bin_id: '',
  old_bin_id: '',
  dump_site_id: '',
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

function formatDateTime(date: string | null | undefined) {
  if (!date) return '—'
  const parsed = new Date(date)
  if (Number.isNaN(parsed.getTime())) return date
  return parsed.toLocaleString([], {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
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
  return String(value || '').trim().toLowerCase()
}

function includesText(value: unknown, query: string) {
  if (!query) return true
  return String(value ?? '').toLowerCase().includes(query)
}

function generateTicketNumber() {
  return `ST-${Math.random().toString(36).slice(2, 10).toUpperCase()}`
}


function generateQuickDate(offsetDays = 0) {
  const date = new Date()
  date.setHours(0, 0, 0, 0)
  date.setDate(date.getDate() + offsetDays)

  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

function getTodayKey() {
  return generateQuickDate(0)
}

function isOverdueOrder(order: Order) {
  const status = order.status || 'unassigned'
  if (status === 'completed' || status === 'cancelled') return false
  if (!order.scheduled_date) return false

  return order.scheduled_date < getTodayKey()
}

function buildTimeOptions() {
  const options: string[] = []
  for (let hour = 5; hour <= 20; hour += 1) {
    for (const minute of [0, 30]) {
      options.push(`${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`)
    }
  }
  return options
}

const QUICK_TIME_OPTIONS = buildTimeOptions()

function ReadOnlyField({
  label,
  value,
  className = '',
}: {
  label: string
  value: string
  className?: string
}) {
  return (
    <div className={className}>
      <label className="mb-2 block text-sm font-medium text-slate-700">{label}</label>
      <div className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
        {value || '—'}
      </div>
    </div>
  )
}

function OrdersPageContent() {
  const supabase = createClient()
  const router = useRouter()
  const searchParams = useSearchParams()

  const [orders, setOrders] = useState<Order[]>([])
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [jobSites, setJobSites] = useState<JobSite[]>([])
  const [bins, setBins] = useState<Bin[]>([])
  const [dumpSites, setDumpSites] = useState<DumpSite[]>([])
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

  const modalTitleRef = useRef<HTMLSelectElement | null>(null)
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
        job_site_id,
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
        driver_id,
        scheduled_date,
        status,
        notes,
        completed_by,
        completed_at,
        created_at,
        updated_at,
        parent_order_id,
        workflow_step,
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

  async function loadJobSites() {
    const { data, error } = await supabase
      .from('job_sites')
      .select('id,customer_id,site_name,address,notes,is_active')
      .eq('is_active', true)
      .order('site_name', { ascending: true })

    if (error) {
      setPageError(error.message)
      return
    }

    setJobSites((data as JobSite[]) || [])
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

  async function loadDumpSites() {
    const { data, error } = await supabase
      .from('dump_sites')
      .select('id,name,address')
      .order('name', { ascending: true })

    if (error) {
      setPageError(error.message)
      return
    }

    setDumpSites((data as DumpSite[]) || [])
  }

  async function loadUserRole() {
    const { data: authData, error: authError } = await supabase.auth.getUser()
    if (authError || !authData?.user) return

    const { data: profileById, error: profileError } = await supabase
      .from('profiles')
      .select('id,email,role,full_name,company,is_active')
      .eq('id', authData.user.id)
      .maybeSingle()

    let profile = profileById as Profile | null

    if (!profile && authData.user.email) {
      const { data: profileByEmail } = await supabase
        .from('profiles')
        .select('id,email,role,full_name,company,is_active')
        .eq('email', authData.user.email)
        .maybeSingle()

      profile = (profileByEmail as Profile | null) || null
    }

    if (profileError && !profile) {
      setPageError((prev) => prev || profileError.message)
      return
    }

    setCurrentUser(profile)
    setIsAdmin((profile?.role || '').toLowerCase() === 'admin')
  }

  async function refreshAll() {
    setLoading(true)
    setPageError('')
    await Promise.all([
      loadOrders(),
      loadDrivers(),
      loadCustomers(),
      loadJobSites(),
      loadBins(),
      loadDumpSites(),
      loadUserRole(),
    ])
    setLoading(false)
  }

  useEffect(() => {
    void refreshAll()

    const channel = supabase
      .channel('orders-page-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: TABLE_NAME }, async () => {
        await loadOrders()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'drivers' }, async () => {
        await loadDrivers()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bins' }, async () => {
        await loadBins()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'customers' }, async () => {
        await loadCustomers()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'job_sites' }, async () => {
        await loadJobSites()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dump_sites' }, async () => {
        await loadDumpSites()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  useEffect(() => {
    setModalVisible(Boolean(showCreateModal || editingOrder))
  }, [showCreateModal, editingOrder])

  const driverMap = useMemo(() => {
    return drivers.reduce<Record<string, Driver>>((acc, driver) => {
      acc[driver.id] = driver
      return acc
    }, {})
  }, [drivers])

  const selectedCustomer = useMemo(() => {
    return customers.find((customer) => customer.id === form.customer_id) || null
  }, [customers, form.customer_id])

  const selectedCustomerJobSites = useMemo(() => {
    return jobSites.filter((site) => site.customer_id === form.customer_id)
  }, [jobSites, form.customer_id])

  const selectedDumpSite = useMemo(() => {
    return dumpSites.find((site) => site.id === form.dump_site_id) || null
  }, [dumpSites, form.dump_site_id])

  const currentAssignedBin = useMemo(() => {
    return bins.find((bin) => bin.id === form.bin_id) || null
  }, [bins, form.bin_id])

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
      const dumpSiteAddress = order.dump_site_address || ''

      const matchesSearch =
        !query ||
        includesText(customerName, query) ||
        includesText(serviceAddress, query) ||
        includesText(dumpSiteAddress, query) ||
        includesText(order.bin_type, query) ||
        includesText(order.bin_size, query) ||
        includesText(order.order_type, query) ||
        includesText(order.service_time, query) ||
        includesText(driverName, query) ||
        includesText(order.notes, query) ||
        includesText(order.ticket_number, query) ||
        includesText(binLabel, query) ||
        includesText(oldBinLabel, query)

      const matchesStatus = statusFilter === 'all' || (order.status || 'unassigned') === statusFilter
      const matchesDriver = driverFilter === 'all' || (order.driver_id || '') === driverFilter
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

  const groupedFilteredOrders = useMemo(() => {
    const sortedOrders = [...filteredOrders].sort((a, b) => {
      const aDate = a.scheduled_date || '9999-12-31'
      const bDate = b.scheduled_date || '9999-12-31'
      if (aDate !== bDate) return aDate.localeCompare(bDate)

      const aTime = a.service_time || '99:99'
      const bTime = b.service_time || '99:99'
      if (aTime !== bTime) return aTime.localeCompare(bTime)

      return String(a.created_at || '').localeCompare(String(b.created_at || ''))
    })

    const groups: Array<{ dateKey: string; orders: Order[] }> = []

    for (const order of sortedOrders) {
      const dateKey = order.scheduled_date || 'No Delivery Date'
      const lastGroup = groups[groups.length - 1]

      if (!lastGroup || lastGroup.dateKey !== dateKey) {
        groups.push({ dateKey, orders: [order] })
      } else {
        lastGroup.orders.push(order)
      }
    }

    return groups
  }, [filteredOrders])

  const binsAtSelectedJobSite = useMemo(() => {
    const jobSite = normalizeAddress(form.pickup_address)
    if (!jobSite) return []

    return bins.filter((bin) => {
      const sameLocation = normalizeAddress(bin.location) === jobSite
      const onHoldAtSite = sameLocation && (bin.status || '') === 'in_use'
      return onHoldAtSite
    })
  }, [bins, form.pickup_address])

  const jobSiteExistingBins = useMemo(() => {
    if (form.order_type === 'EXCHANGE' || form.order_type === 'REMOVAL' || form.order_type === 'DUMP RETURN') {
      return binsAtSelectedJobSite
    }

    return []
  }, [binsAtSelectedJobSite, form.order_type])

  const selectedExistingJobSiteBin = useMemo(() => {
    return jobSiteExistingBins.find((bin) => bin.id === form.old_bin_id) || null
  }, [jobSiteExistingBins, form.old_bin_id])

  const selectedExistingBinMaterial = useMemo(() => {
    if (!form.old_bin_id) return ''

    const linkedOrders = orders
      .filter((order) => order.bin_id === form.old_bin_id || order.old_bin_id === form.old_bin_id)
      .sort((a, b) => {
        const aTime = new Date(a.updated_at || a.created_at || a.scheduled_date || 0).getTime()
        const bTime = new Date(b.updated_at || b.created_at || b.scheduled_date || 0).getTime()
        return bTime - aTime
      })

    return linkedOrders.find((order) => order.bin_type)?.bin_type || ''
  }, [orders, form.old_bin_id])

  function getActiveBinConflict(binId: string | null | undefined, currentOrderId?: string | null) {
    if (!binId) return null

    return (
      orders.find((order) => {
        if (currentOrderId && order.id === currentOrderId) return false
        if (!ACTIVE_BIN_ORDER_STATUSES.includes((order.status || 'unassigned') as (typeof ACTIVE_BIN_ORDER_STATUSES)[number])) return false

        return order.bin_id === binId || order.old_bin_id === binId
      }) || null
    )
  }

  function getConflictMessage(conflictOrder: Order) {
    return `This bin is still linked to active order ${conflictOrder.ticket_number || conflictOrder.id.slice(0, 8)}. Finish that order first.`
  }

  useEffect(() => {
    if (!form.old_bin_id) return
    if (
      form.order_type !== 'REMOVAL' &&
      form.order_type !== 'DUMP RETURN' &&
      form.order_type !== 'EXCHANGE'
    ) {
      return
    }

    setForm((prev) => {
      const nextBinSize = selectedExistingJobSiteBin?.bin_size || prev.bin_size
      const nextBinType = selectedExistingBinMaterial || prev.bin_type

      return {
        ...prev,
        bin_size: nextBinSize,
        bin_type: nextBinType,
        bin_id: prev.order_type === 'DUMP RETURN' ? prev.old_bin_id : prev.bin_id,
      }
    })
  }, [form.old_bin_id, form.order_type, selectedExistingJobSiteBin, selectedExistingBinMaterial])

  function getCompletedByLabel() {
    if (!currentUser) return 'System'
    return currentUser.full_name || currentUser.email || 'System'
  }

  function openCreateModal() {
    setEditingOrder(null)
    setForm({
      ...emptyForm,
      scheduled_date: generateQuickDate(0),
    })
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
      job_site_id: order.job_site_id || '',
      pickup_address: order.service_address || order.pickup_address || '',
      scheduled_date: order.scheduled_date ? new Date(order.scheduled_date).toISOString().slice(0, 10) : '',
      service_time: order.service_time || '',
      bin_size: order.bin_size || binRelation?.bin_size || oldBinRelation?.bin_size || '20',
      bin_type: order.bin_type || 'Garbage',
      order_type: order.order_type || 'DELIVERY',
      driver_id: order.driver_id || '',
      status: order.status || 'unassigned',
      bin_id: order.bin_id || '',
      old_bin_id: order.old_bin_id || '',
      dump_site_id: order.dump_site_id || '',
      notes: order.notes || '',
    })
  }

  useEffect(() => {
    const orderId = searchParams.get('orderId')
    if (!orderId || orders.length === 0) return

    const match = orders.find((order) => order.id === orderId)
    if (match) openEditModal(match)
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
      job_site_id: '',
      pickup_address: '',
    }))
  }

  function handleJobSiteAddressInput(address: string) {
    const matchedSite = selectedCustomerJobSites.find(
      (site) => normalizeAddress(site.address) === normalizeAddress(address)
    )

    setForm((prev) => ({
      ...prev,
      job_site_id: matchedSite?.id || '',
      pickup_address: address,
    }))
  }

  useEffect(() => {
    if (
      form.order_type !== 'REMOVAL' &&
      form.order_type !== 'DUMP RETURN' &&
      form.order_type !== 'EXCHANGE'
    ) {
      return
    }

    if (jobSiteExistingBins.length !== 1) return
    if (form.old_bin_id) return

    const onlyBin = jobSiteExistingBins[0]

    setForm((prev) => ({
      ...prev,
      old_bin_id: onlyBin.id,
      bin_id: prev.order_type === 'DUMP RETURN' ? onlyBin.id : prev.bin_id,
      bin_size: onlyBin.bin_size || prev.bin_size,
      bin_type: selectedExistingBinMaterial || prev.bin_type,
    }))
  }, [form.order_type, form.old_bin_id, jobSiteExistingBins])


  async function ensureJobSiteForOrder(customerId: string, address: string) {
    const trimmedAddress = address.trim()
    if (!customerId || !trimmedAddress) return null

    const existing = jobSites.find(
      (site) =>
        site.customer_id === customerId &&
        normalizeAddress(site.address) === normalizeAddress(trimmedAddress)
    )

    if (existing) return existing.id

    const insertPayload = {
      customer_id: customerId,
      site_name: trimmedAddress,
      address: trimmedAddress,
      is_active: true,
    }

    const { data, error } = await supabase
      .from('job_sites')
      .insert([insertPayload])
      .select('id')
      .single()

    if (error) {
      throw new Error(error.message)
    }

    await loadJobSites()
    return (data as { id: string } | null)?.id || null
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
      activeStatuses.includes((order as { status?: string | null }).status || '')
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

    if ((driver as { status?: string | null })?.status === 'offline') return

    const { error: updateError } = await supabase
      .from('drivers')
      .update({ status: hasActiveOrders ? 'busy' : 'available' })
      .eq('id', driverId)

    if (updateError) {
      setPageError(updateError.message)
    }
  }

  async function setBinStatus(binId: string, status: 'available' | 'in_use', location?: string | null) {
    const payload: Record<string, string | null> = { status }
    if (typeof location !== 'undefined') {
      payload.location = location
    }

    const { error } = await supabase.from('bins').update(payload).eq('id', binId)
    if (error) throw new Error(error.message)
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

    if (error || !data) throw new Error('Selected bin could not be found.')

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
    const isEditing = Boolean(editingOrder)
    const status = isEditing ? form.status || 'unassigned' : 'unassigned'
    const jobSiteAddress = form.pickup_address.trim() || null
    const dumpSite = dumpSites.find((site) => site.id === form.dump_site_id) || null
    const ensuredJobSiteId =
      form.customer_id && jobSiteAddress ? await ensureJobSiteForOrder(form.customer_id, jobSiteAddress) : null

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
      job_site_id: ensuredJobSiteId,
      pickup_address: jobSiteAddress,
      service_address: jobSiteAddress,
      service_time: form.service_time || null,
      service_window: null,
      bin_size: form.bin_size || null,
      bin_type: form.bin_type || null,
      order_type: orderType,
      driver_id: isEditing ? form.driver_id || null : null,
      scheduled_date: form.scheduled_date || null,
      status,
      dump_site_id:
        orderType === 'REMOVAL' || orderType === 'EXCHANGE' || orderType === 'DUMP RETURN'
          ? form.dump_site_id || null
          : null,
      dump_site_address:
        orderType === 'REMOVAL' || orderType === 'EXCHANGE' || orderType === 'DUMP RETURN'
          ? dumpSite?.address || null
          : null,
      notes: form.notes || null,
      parent_order_id: editingOrder?.parent_order_id || null,
      workflow_step: editingOrder?.workflow_step || 'MAIN',
      ...completionFields,
    }

    if (
      (orderType === 'REMOVAL' || orderType === 'EXCHANGE' || orderType === 'DUMP RETURN') &&
      !form.dump_site_id
    ) {
      throw new Error('Please select a dump site.')
    }

    if (orderType === 'DELIVERY') {
      if (isEditing && form.bin_id) {
        const selectedBin = await validateSelectedAvailableBin(form.bin_id, form.bin_size)
        return {
          payload: { ...basePayload, bin_id: selectedBin.id, old_bin_id: null },
          assignedBinId: selectedBin.id,
          releasedBinId:
            editingOrder?.bin_id && editingOrder.bin_id !== selectedBin.id ? editingOrder.bin_id : null,
        }
      }

      return {
        payload: { ...basePayload, bin_id: editingOrder?.bin_id || null, old_bin_id: null },
        assignedBinId: null,
        releasedBinId: null,
      }
    }

    if (orderType === 'EXCHANGE') {
      if (!form.old_bin_id) throw new Error('Exchange requires the current bin from this Job Site.')

      if (isEditing && form.bin_id) {
        const selectedBin = await validateSelectedAvailableBin(form.bin_id, form.bin_size, form.old_bin_id)
        return {
          payload: { ...basePayload, bin_id: selectedBin.id, old_bin_id: form.old_bin_id },
          assignedBinId: selectedBin.id,
          releasedBinId: form.old_bin_id,
        }
      }

      return {
        payload: { ...basePayload, bin_id: editingOrder?.bin_id || null, old_bin_id: form.old_bin_id },
        assignedBinId: null,
        releasedBinId: null,
      }
    }

    if (orderType === 'REMOVAL') {
      if (!form.old_bin_id) throw new Error('Removal requires the current bin from this Job Site.')

      return {
        payload: { ...basePayload, bin_id: null, old_bin_id: form.old_bin_id },
        assignedBinId: null,
        releasedBinId: form.old_bin_id,
      }
    }

    if (orderType === 'DUMP RETURN') {
      const sameBinId = form.old_bin_id || editingOrder?.bin_id || null
      if (!sameBinId) throw new Error('Dump return requires the existing bin from this Job Site.')

      return {
        payload: { ...basePayload, bin_id: sameBinId, old_bin_id: sameBinId },
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

      if (!form.scheduled_date) {
        throw new Error('Delivery date is required.')
      }

      const previousDriverId = editingOrder?.driver_id || null
      const previousBinId = editingOrder?.bin_id || null
      const previousOldBinId = editingOrder?.old_bin_id || null

      const { payload, assignedBinId, releasedBinId } = await applyWorkflowAndBuildPayload()

      const conflictIds = Array.from(new Set([payload.bin_id, payload.old_bin_id].filter(Boolean))) as string[]
      for (const binId of conflictIds) {
        const conflictOrder = getActiveBinConflict(binId, editingOrder?.id)
        if (conflictOrder) {
          throw new Error(getConflictMessage(conflictOrder))
        }
      }

      if (editingOrder) {
        const { error } = await supabase.from(TABLE_NAME).update(payload).eq('id', editingOrder.id)
        if (error) throw new Error(error.message)

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
          previousBinId !== previousOldBinId &&
          payload.order_type !== 'DELIVERY' &&
          payload.order_type !== 'EXCHANGE'
        ) {
          await releaseBin(previousBinId)
        }

        if (
          previousOldBinId &&
          previousOldBinId !== releasedBinId &&
          previousOldBinId !== assignedBinId &&
          payload.order_type === 'EXCHANGE'
        ) {
          await occupyBin(previousOldBinId, editingOrder?.service_address || editingOrder?.pickup_address || null)
        }

        if (releasedBinId && releasedBinId !== assignedBinId && payload.status !== 'cancelled') {
          await releaseBin(releasedBinId)
        }

        if (assignedBinId) {
          await occupyBin(assignedBinId, form.pickup_address.trim() || null)
        }

        if (payload.status === 'completed' || payload.status === 'issue' || payload.status === 'cancelled') {
          if (payload.order_type === 'REMOVAL') {
            await releaseBin(payload.old_bin_id)
          } else if (payload.order_type === 'EXCHANGE') {
            if (payload.old_bin_id) await releaseBin(payload.old_bin_id)
            if (payload.status !== 'cancelled' && payload.bin_id) {
              await occupyBin(payload.bin_id, form.pickup_address.trim() || null)
            }
          } else if (payload.order_type === 'DELIVERY') {
            if (payload.status === 'cancelled' && payload.bin_id) {
              await releaseBin(payload.bin_id)
            } else if (payload.bin_id) {
              await occupyBin(payload.bin_id, form.pickup_address.trim() || null)
            }
          } else if (payload.order_type === 'DUMP RETURN' && payload.bin_id) {
            await occupyBin(payload.bin_id, form.pickup_address.trim() || null)
          }
        }

        await refreshAll()
        closeModal()
        return
      }

      const insertPayload = {
        ...payload,
        ticket_number: generateTicketNumber(),
      }

      const { error } = await supabase.from(TABLE_NAME).insert([insertPayload])
      if (error) throw new Error(error.message)

      await refreshAll()
      closeModal()
    } catch (error: any) {
      setPageError(error.message || 'Failed to save order.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(orderId: string, driverId?: string | null, binId?: string | null, oldBinId?: string | null) {
    const orderToDelete = orders.find((item) => item.id === orderId)

    if (orderToDelete?.status === 'completed' && !isAdmin) {
      setPageError('Only admin can delete completed orders.')
      return false
    }

    const confirmed = window.confirm('Delete this order?')
    if (!confirmed) return false

    setDeletingId(orderId)
    setPageError('')

    const { error } = await supabase.from(TABLE_NAME).delete().eq('id', orderId)
    if (error) {
      setPageError(error.message)
      setDeletingId(null)
      return false
    }

    try {
      if (driverId) await syncDriverStatuses(driverId)

      if (orderToDelete?.order_type === 'DELIVERY' && binId) await releaseBin(binId)

      if (orderToDelete?.order_type === 'EXCHANGE') {
        if (binId) await releaseBin(binId)
        if (oldBinId) {
          await occupyBin(oldBinId, orderToDelete.service_address || orderToDelete.pickup_address || null)
        }
      }

      if (orderToDelete?.order_type === 'REMOVAL' && oldBinId) {
        await occupyBin(oldBinId, orderToDelete.service_address || orderToDelete.pickup_address || null)
      }

      if (orderToDelete?.order_type === 'DUMP RETURN' && binId) {
        await occupyBin(binId, orderToDelete.service_address || orderToDelete.pickup_address || null)
      }

      await refreshAll()
      closeModal()
      setDeletingId(null)
      return true
    } catch (error: any) {
      setPageError(error.message || 'Failed while cleaning workflow after delete.')
      setDeletingId(null)
      return false
    }
  }

  async function createLinkedWorkflowOrders(order: Order) {
    const workflowStep = order.workflow_step || 'MAIN'
    if (order.order_type === 'DELIVERY') return

    if (
      !order.dump_site_address &&
      (order.order_type === 'REMOVAL' || order.order_type === 'EXCHANGE' || order.order_type === 'DUMP RETURN')
    ) {
      throw new Error('Dump site address is missing for this workflow.')
    }

    if (order.order_type === 'REMOVAL') {
      if (workflowStep !== 'MAIN') return

      const dumpOrder = {
        ticket_number: generateTicketNumber(),
        customer_id: order.customer_id,
        customer_name: order.customer_name,
        job_site_id: order.job_site_id || null,
        pickup_address: order.service_address || order.pickup_address,
        service_address: order.dump_site_address,
        service_time: null,
        service_window: null,
        bin_id: order.old_bin_id,
        old_bin_id: null,
        dump_site_id: order.dump_site_id || null,
        dump_site_address: order.dump_site_address || null,
        parent_order_id: order.id,
        workflow_step: 'DUMP',
        bin_size: order.bin_size,
        bin_type: order.bin_type,
        order_type: 'REMOVAL',
        driver_id: order.driver_id,
        scheduled_date: order.scheduled_date,
        status: 'assigned',
        notes: `Auto-created dump stop for removal order ${order.ticket_number || order.id}`,
      }

      const { error } = await supabase.from(TABLE_NAME).insert([dumpOrder])
      if (error) throw new Error(error.message)
      return
    }

    if (order.order_type === 'EXCHANGE') {
      if (workflowStep !== 'MAIN') return

      const dumpOrder = {
        ticket_number: generateTicketNumber(),
        customer_id: order.customer_id,
        customer_name: order.customer_name,
        job_site_id: order.job_site_id || null,
        pickup_address: order.service_address || order.pickup_address,
        service_address: order.dump_site_address,
        service_time: null,
        service_window: null,
        bin_id: order.old_bin_id,
        old_bin_id: null,
        dump_site_id: order.dump_site_id || null,
        dump_site_address: order.dump_site_address || null,
        parent_order_id: order.id,
        workflow_step: 'DUMP',
        bin_size: order.bin_size,
        bin_type: order.bin_type,
        order_type: 'EXCHANGE',
        driver_id: order.driver_id,
        scheduled_date: order.scheduled_date,
        status: 'assigned',
        notes: `Auto-created dump stop for exchange order ${order.ticket_number || order.id}`,
      }

      const { error } = await supabase.from(TABLE_NAME).insert([dumpOrder])
      if (error) throw new Error(error.message)
      return
    }

    if (order.order_type === 'DUMP RETURN') {
      if (workflowStep === 'MAIN') {
        const dumpOrder = {
          ticket_number: generateTicketNumber(),
          customer_id: order.customer_id,
          customer_name: order.customer_name,
          job_site_id: order.job_site_id || null,
          pickup_address: order.service_address || order.pickup_address,
          service_address: order.dump_site_address,
          service_time: null,
          service_window: null,
          bin_id: order.bin_id,
          old_bin_id: null,
          dump_site_id: order.dump_site_id || null,
          dump_site_address: order.dump_site_address || null,
          parent_order_id: order.id,
          workflow_step: 'DUMP',
          bin_size: order.bin_size,
          bin_type: order.bin_type,
          order_type: 'DUMP RETURN',
          driver_id: order.driver_id,
          scheduled_date: order.scheduled_date,
          status: 'assigned',
          notes: `Auto-created dump stop for dump return order ${order.ticket_number || order.id}`,
        }

        const { error } = await supabase.from(TABLE_NAME).insert([dumpOrder])
        if (error) throw new Error(error.message)
        return
      }

      if (workflowStep === 'DUMP') {
        const returnOrder = {
          ticket_number: generateTicketNumber(),
          customer_id: order.customer_id,
          customer_name: order.customer_name,
          job_site_id: order.job_site_id || null,
          pickup_address: order.dump_site_address,
          service_address: order.pickup_address || order.service_address,
          service_time: null,
          service_window: null,
          bin_id: order.bin_id,
          old_bin_id: null,
          dump_site_id: order.dump_site_id || null,
          dump_site_address: order.dump_site_address || null,
          parent_order_id: order.parent_order_id || order.id,
          workflow_step: 'RETURN',
          bin_size: order.bin_size,
          bin_type: order.bin_type,
          order_type: 'DUMP RETURN',
          driver_id: order.driver_id,
          scheduled_date: order.scheduled_date,
          status: 'assigned',
          notes: `Auto-created return stop for dump return order ${order.ticket_number || order.id}`,
        }

        const { error } = await supabase.from(TABLE_NAME).insert([returnOrder])
        if (error) throw new Error(error.message)
      }
    }
  }

  async function handleQuickStatus(order: Order, value: string) {
    if (order.status === 'completed') {
      setPageError('Completed orders are locked and cannot be edited.')
      return
    }

    setPageError('')

    if (value === 'completed') {
      const conflictIds = Array.from(new Set([order.bin_id, order.old_bin_id].filter(Boolean))) as string[]
      for (const binId of conflictIds) {
        const conflictOrder = getActiveBinConflict(binId, order.id)
        if (conflictOrder) {
          setPageError(getConflictMessage(conflictOrder))
          return
        }
      }
    }

    const updatePayload: Record<string, string | null> = { status: value }
    if (value === 'completed') {
      updatePayload.completed_by = order.completed_by || getCompletedByLabel()
      updatePayload.completed_at = order.completed_at || new Date().toISOString()
    }

    const { error } = await supabase.from(TABLE_NAME).update(updatePayload).eq('id', order.id)
    if (error) {
      setPageError(error.message)
      return
    }

    try {
      if (order.driver_id) await syncDriverStatuses(order.driver_id)

      if (value === 'completed' || value === 'issue' || value === 'cancelled') {
        const workflowStep = order.workflow_step || 'MAIN'

        if (value === 'completed') {
          if (workflowStep === 'MAIN') {
            if (order.order_type === 'DELIVERY' && order.bin_id) {
              await occupyBin(order.bin_id, order.service_address || order.pickup_address || null)
            }

            if (order.order_type === 'EXCHANGE') {
              if (order.bin_id) {
                await occupyBin(order.bin_id, order.service_address || order.pickup_address || null)
              }
              await createLinkedWorkflowOrders(order)
            }

            if (order.order_type === 'REMOVAL' || order.order_type === 'DUMP RETURN') {
              await createLinkedWorkflowOrders(order)
            }
          }

          if (workflowStep === 'DUMP') {
            if (order.order_type === 'DUMP RETURN' && order.bin_id) {
              await occupyBin(order.bin_id, order.service_address || order.pickup_address || null)
              await createLinkedWorkflowOrders(order)
            } else if (order.bin_id) {
              await releaseBin(order.bin_id)
            }
          }

          if (workflowStep === 'RETURN' && order.bin_id) {
            await occupyBin(order.bin_id, order.service_address || order.pickup_address || null)
          }
        }

        if (value === 'cancelled') {
          if (order.order_type === 'DELIVERY' && order.bin_id) {
            await releaseBin(order.bin_id)
          }

          if (order.order_type === 'EXCHANGE') {
            if (order.bin_id) await releaseBin(order.bin_id)
            if (order.old_bin_id) {
              await occupyBin(order.old_bin_id, order.service_address || order.pickup_address || null)
            }
          }

          if (order.order_type === 'REMOVAL' && order.old_bin_id) {
            await occupyBin(order.old_bin_id, order.service_address || order.pickup_address || null)
          }

          if (order.order_type === 'DUMP RETURN' && order.bin_id) {
            await occupyBin(order.bin_id, order.service_address || order.pickup_address || null)
          }
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
    <div className="light min-h-screen bg-slate-100 text-slate-900" style={{ colorScheme: 'light' }}>
      <div className="mx-auto max-w-[92rem] p-4 md:p-6">
        <div className="mb-6 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">Orders</h1>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Link
                href="/dashboard"
                className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-center text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Back to Dashboard
              </Link>
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
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total</div>
              <div className="mt-2 text-2xl font-bold text-slate-900">{counts.total}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Unassigned</div>
              <div className="mt-2 text-2xl font-bold text-slate-900">{counts.unassigned}</div>
            </div>
            <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-blue-700">Assigned</div>
              <div className="mt-2 text-2xl font-bold text-blue-900">{counts.assigned}</div>
            </div>
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-amber-700">In Progress</div>
              <div className="mt-2 text-2xl font-bold text-amber-900">{counts.in_progress}</div>
            </div>
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Completed</div>
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

          <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-slate-600">
            <span className="inline-flex rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 font-semibold text-rose-700">
              Overdue = delivery date before today
            </span>
            <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 font-semibold text-slate-700">
              Orders are grouped by delivery date
            </span>
          </div>
        </div>

        <div className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-slate-200">
          {loading ? (
            <div className="p-10 text-center text-sm text-slate-500">Loading orders...</div>
          ) : filteredOrders.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">No orders found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1180px] divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">Ticket</th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">Order Type</th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">Customer</th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">Job Site Address</th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">Time</th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">Bin Size</th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">Material</th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">Driver</th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">Status</th>
                  </tr>
                </thead>

                <tbody className="bg-white">
                  {groupedFilteredOrders.map((group) => (
                    <>
                      <tr key={`group-${group.dateKey}`} className="bg-slate-50/80">
                        <td
                          colSpan={10}
                          className="border-y border-slate-200 px-4 py-3 text-sm font-bold text-slate-700"
                        >
                          Delivery Date: {group.dateKey === 'No Delivery Date' ? 'No Delivery Date' : formatDate(group.dateKey)}
                        </td>
                      </tr>

                      {group.orders.map((order) => {
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

                        const isOverdue = isOverdueOrder(order)

                        return (
                          <tr
                            key={order.id}
                            className={`cursor-pointer border-b border-slate-100 hover:bg-slate-50/80 ${
                              isOverdue ? 'bg-rose-50/70' : ''
                            }`}
                            onClick={() => openEditModal(order)}
                          >
                            <td className="px-4 py-4 align-top">
                              <div className="font-semibold text-slate-900">{order.ticket_number || 'Pending'}</div>
                              <div className="mt-1 text-xs text-slate-500">#{order.id.slice(0, 8)}</div>
                              {isOverdue ? (
                                <div className="mt-2 inline-flex rounded-full border border-rose-200 bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-700">
                                  Overdue
                                </div>
                              ) : null}
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

                            <td className="px-4 py-4 align-top text-sm text-slate-700">{order.bin_type || '—'}</td>

                            <td className="px-4 py-4 align-top text-sm text-slate-700">{driver}</td>

                            <td className="px-4 py-4 align-top">
                              <span className={`inline-flex w-fit rounded-full border px-2.5 py-1 text-xs font-semibold ${badgeClass}`}>
                                {formatStatus(order.status || 'unassigned')}
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>

      {(showCreateModal || editingOrder) && (
        <div
          className={`fixed inset-0 z-50 overflow-y-auto transition-all duration-300 ease-out ${
            modalVisible ? 'bg-slate-900/40 opacity-100' : 'bg-slate-900/0 opacity-0'
          }`}
        >
          <div className="flex min-h-full items-start justify-center p-4 md:p-6">
            <div
              ref={modalCardRef}
              className={`my-6 w-full max-w-3xl max-h-[calc(100vh-3rem)] overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl transition-all duration-300 ease-out ${
                modalVisible ? 'translate-y-0 scale-100 opacity-100' : 'translate-y-4 scale-[0.985] opacity-0'
              }`}
            >
              <div className="mb-6 flex items-start justify-between gap-4">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {editingOrder?.ticket_number || 'New Order'}
                  </div>
                  <h2 className="mt-1 text-xl font-bold text-slate-900">
                    {editingOrder ? (isReadOnlyModal ? 'Order Details' : 'Edit Order') : 'Create Order'}
                  </h2>
                  {isReadOnlyModal ? (
                    <p className="mt-1 text-sm text-slate-500">
                      This completed order is locked. You can view it, but you cannot edit anything.
                    </p>
                  ) : null}
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


              {editingOrder?.status === 'completed' && (
                <div className="mb-4 grid gap-3 md:grid-cols-2">
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                    <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Completed By</div>
                    <div className="mt-1 font-semibold">{editingOrder.completed_by || '—'}</div>
                  </div>
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                    <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Completed At</div>
                    <div className="mt-1 font-semibold">{formatDateTime(editingOrder.completed_at)}</div>
                  </div>
                </div>
              )}

              <div className="grid gap-4 md:grid-cols-2">
                {isReadOnlyModal ? (
                  <>
                    <ReadOnlyField label="Customer" value={selectedCustomer?.name || form.customer_name || '—'} />
                    <ReadOnlyField label="Customer Name" value={form.customer_name || '—'} />
                  </>
                ) : (
                  <>
                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-700">Customer</label>
                      <select
                        ref={modalTitleRef}
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
                      <label className="mb-2 block text-sm font-medium text-slate-700">Customer Name</label>
                      <input
                        value={form.customer_name}
                        onChange={(e) => setForm((prev) => ({ ...prev, customer_name: e.target.value }))}
                        className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-slate-400"
                        placeholder="Customer name"
                      />
                    </div>
                  </>
                )}

                {isReadOnlyModal ? (
                  <>
                    <ReadOnlyField label="Job Site Address" value={form.pickup_address || '—'} className="md:col-span-2" />
                    <ReadOnlyField label="Order Type" value={form.order_type || '—'} />
                    <ReadOnlyField label="Date" value={formatDate(form.scheduled_date)} />
                    <ReadOnlyField label="Time" value={formatServiceTime(form.service_time)} />
                    <ReadOnlyField label="Bin Size" value={form.bin_size ? `${form.bin_size} Yard` : '—'} />
                    <ReadOnlyField label="Material / Bin" value={form.bin_type || '—'} />
                    <ReadOnlyField
                      label="Driver"
                      value={form.driver_id ? drivers.find((d) => d.id === form.driver_id)?.name || 'Assigned' : 'Unassigned'}
                    />
                  </>
                ) : (
                  <>
                    <div className="md:col-span-2">
                      <label className="mb-2 block text-sm font-medium text-slate-700">Job Site Address</label>
                      <input
                        list={form.customer_id ? 'customer-job-site-addresses' : undefined}
                        value={form.pickup_address}
                        onChange={(e) => handleJobSiteAddressInput(e.target.value)}
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-slate-400"
                        placeholder={selectedCustomerJobSites.length > 0 ? 'Start typing a saved address' : 'Job site address'}
                        autoComplete="street-address"
                      />
                      {selectedCustomerJobSites.length > 0 ? (
                        <datalist id="customer-job-site-addresses">
                          {selectedCustomerJobSites.map((site) => (
                            <option key={site.id} value={site.address || ''} />
                          ))}
                        </datalist>
                      ) : null}
                    </div>

                    <div className="md:col-span-2">
                      <label className="mb-2 block text-sm font-medium text-slate-700">Order Type</label>
                      <select
                        value={form.order_type}
                        onChange={(e) =>
                          setForm((prev) => ({
                            ...prev,
                            order_type: e.target.value,
                            old_bin_id: '',
                            dump_site_id:
                              e.target.value === 'REMOVAL' || e.target.value === 'EXCHANGE' || e.target.value === 'DUMP RETURN'
                                ? prev.dump_site_id
                                : '',
                          }))
                        }
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-slate-400"
                      >
                        {ORDER_TYPES.map((type) => (
                          <option key={type} value={type}>
                            {type}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-700">Date</label>
                      <div className="grid gap-2">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => setForm((prev) => ({ ...prev, scheduled_date: generateQuickDate(0) }))}
                            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                          >
                            Today
                          </button>
                          <button
                            type="button"
                            onClick={() => setForm((prev) => ({ ...prev, scheduled_date: generateQuickDate(1) }))}
                            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                          >
                            Tomorrow
                          </button>
                        </div>
                        <input
                          type="date"
                          value={form.scheduled_date}
                          onChange={(e) => setForm((prev) => ({ ...prev, scheduled_date: e.target.value }))}
                          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-slate-400"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-700">Time</label>
                      <select
                        value={form.service_time}
                        onChange={(e) => setForm((prev) => ({ ...prev, service_time: e.target.value }))}
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-slate-400"
                      >
                        <option value="">Select time</option>
                        {QUICK_TIME_OPTIONS.map((timeOption) => (
                          <option key={timeOption} value={timeOption}>
                            {formatServiceTime(timeOption)}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-700">Bin Size</label>
                      <select
                        value={form.bin_size}
                        onChange={(e) => setForm((prev) => ({ ...prev, bin_size: e.target.value, bin_id: '' }))}
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-slate-400"
                      >
                        {BIN_SIZES.map((size) => (
                          <option key={size} value={size}>
                            {size} Yard
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-700">Material / Bin</label>
                      <select
                        value={form.bin_type}
                        onChange={(e) => setForm((prev) => ({ ...prev, bin_type: e.target.value }))}
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-slate-400"
                      >
                        {MATERIAL_TYPES.map((type) => (
                          <option key={type} value={type}>
                            {type}
                          </option>
                        ))}
                      </select>
                    </div>
                  </>
                )}

                {(form.order_type === 'REMOVAL' || form.order_type === 'EXCHANGE' || form.order_type === 'DUMP RETURN') &&
                  (isReadOnlyModal ? (
                    <>
                      <ReadOnlyField label="Dump Site" value={selectedDumpSite?.name || '—'} />
                      <ReadOnlyField label="Dump Site Address" value={selectedDumpSite?.address || editingOrder?.dump_site_address || '—'} />
                    </>
                  ) : (
                    <>
                      <div>
                        <label className="mb-2 block text-sm font-medium text-slate-700">Dump Site</label>
                        <select
                          value={form.dump_site_id}
                          onChange={(e) =>
                            setForm((prev) => ({ ...prev, dump_site_id: e.target.value }))
                          }
                          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-slate-400"
                        >
                          <option value="">Select dump site</option>
                          {dumpSites.map((site) => (
                            <option key={site.id} value={site.id}>
                              {site.name || 'Unnamed Dump Site'}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="mb-2 block text-sm font-medium text-slate-700">Dump Site Address</label>
                        <div className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                          {selectedDumpSite?.address || '—'}
                        </div>
                      </div>
                    </>
                  ))}

                {(form.order_type === 'EXCHANGE' || form.order_type === 'REMOVAL' || form.order_type === 'DUMP RETURN') &&
                  (isReadOnlyModal ? (
                    <ReadOnlyField
                      label={form.order_type === 'DUMP RETURN' ? 'Bin at this Job Site' : 'Old / Existing Bin at this Job Site'}
                      value={
                        jobSiteExistingBins.find((b) => b.id === form.old_bin_id)
                          ? `${jobSiteExistingBins.find((b) => b.id === form.old_bin_id)?.bin_number || 'Bin'} • ${jobSiteExistingBins.find((b) => b.id === form.old_bin_id)?.bin_size || ''}Y`
                          : '—'
                      }
                    />
                  ) : (
                    <div className="md:col-span-2">
                      <label className="mb-2 block text-sm font-medium text-slate-700">
                        {form.order_type === 'DUMP RETURN' ? 'Bin at this Job Site' : 'Old / Existing Bin at this Job Site'}
                      </label>
                      <select
                        value={form.old_bin_id}
                        onChange={(e) => {
                          const selectedId = e.target.value
                          const selectedBin = jobSiteExistingBins.find((bin) => bin.id === selectedId) || null
                          const linkedOrders = orders
                            .filter((order) => order.bin_id === selectedId || order.old_bin_id === selectedId)
                            .sort((a, b) => {
                              const aTime = new Date(a.updated_at || a.created_at || a.scheduled_date || 0).getTime()
                              const bTime = new Date(b.updated_at || b.created_at || b.scheduled_date || 0).getTime()
                              return bTime - aTime
                            })
                          const latestBinType = linkedOrders.find((order) => order.bin_type)?.bin_type || ''

                          setForm((prev) => ({
                            ...prev,
                            old_bin_id: selectedId,
                            bin_id: prev.order_type === 'DUMP RETURN' ? selectedId : prev.bin_id,
                            bin_size: selectedBin?.bin_size || prev.bin_size,
                            bin_type: latestBinType || prev.bin_type,
                          }))
                        }}
                        className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-slate-400"
                      >
                        <option value="">Select bin from this Job Site</option>
                        {jobSiteExistingBins.map((bin) => (
                          <option key={bin.id} value={bin.id}>
                            {bin.bin_number || 'Bin'} • {bin.bin_size || ''}Y • {bin.location || 'Job Site'}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}

                {editingOrder && (
                  isReadOnlyModal ? (
                    <>
                      <ReadOnlyField label="Status" value={formatStatus(form.status)} />
                      <ReadOnlyField
                        label="Assigned Bin"
                        value={currentAssignedBin ? `${currentAssignedBin.bin_number || 'Bin'} • ${currentAssignedBin.bin_size || ''}Y` : 'Not set'}
                      />
                    </>
                  ) : (
                    <>
                      <div>
                        <label className="mb-2 block text-sm font-medium text-slate-700">Status</label>
                        <select
                          value={form.status}
                          onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value }))}
                          className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-slate-400"
                        >
                          {ORDER_STATUSES.map((status) => (
                            <option key={status} value={status}>
                              {formatStatus(status)}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="mb-2 block text-sm font-medium text-slate-700">Driver</label>
                        <select
                          value={form.driver_id}
                          onChange={(e) => setForm((prev) => ({ ...prev, driver_id: e.target.value }))}
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
                    </>
                  )
                )}

                {editingOrder && form.bin_id && (
                  <div className="md:col-span-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                    Assigned bin on this order: <span className="font-semibold">{currentAssignedBin?.bin_number || form.bin_id}</span>
                  </div>
                )}

                {form.order_type === 'DUMP RETURN' && (
                  <div className="md:col-span-2 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
                    DUMP RETURN uses the same bin already on hold at this Job Site. Bin size and material are filled automatically from that bin.
                  </div>
                )}

                {(form.order_type === 'EXCHANGE' || form.order_type === 'DUMP RETURN') && (
                  <div className="md:col-span-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                    Bins found at this Job Site: <span className="font-semibold">{jobSiteExistingBins.length}</span>
                  </div>
                )}

                {isReadOnlyModal ? (
                  <ReadOnlyField label="Notes" value={form.notes || '—'} className="md:col-span-2" />
                ) : (
                  <div className="md:col-span-2">
                    <label className="mb-2 block text-sm font-medium text-slate-700">Note</label>
                    <textarea
                      rows={4}
                      value={form.notes}
                      onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
                      className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-slate-400"
                      placeholder="Special observation or instruction"
                    />
                  </div>
                )}
              </div>

              <div className="mt-6 flex flex-wrap justify-end gap-3">
                {editingOrder && !isReadOnlyModal && (
                  <button
                    onClick={handleCancelOrder}
                    disabled={saving}
                    className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                  >
                    Cancel Order
                  </button>
                )}

                {editingOrder && !isReadOnlyModal && (
                  <button
                    onClick={() =>
                      void handleDelete(editingOrder.id, editingOrder.driver_id, editingOrder.bin_id, editingOrder.old_bin_id)
                    }
                    disabled={saving || deletingId === editingOrder.id}
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    {deletingId === editingOrder.id ? 'Deleting...' : 'Delete'}
                  </button>
                )}

                <button
                  onClick={closeModal}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Close
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
        </div>
      )}
    </div>
  )
}

export default function OrdersPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-slate-500">Loading...</div>}>
      <OrdersPageContent />
    </Suspense>
  )
}
