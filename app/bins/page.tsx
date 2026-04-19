'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Bin = {
  id: string
  bin_number: string | null
  bin_size: string | null
  location: string | null
  status: string | null
  created_at: string | null
  updated_at: string | null
}

type Order = {
  id: string
  customer_name?: string | null
  bin_id: string | null
  old_bin_id: string | null
  status: string | null
  order_type: string | null
  scheduled_date: string | null
  service_time?: string | null
  service_address: string | null
  pickup_address?: string | null
  dump_site_address?: string | null
  workflow_step?: string | null
  created_at: string | null
  updated_at?: string | null
}

type UserRole = 'admin' | 'dispatcher' | 'unknown'

const BIN_SIZES = ['6', '8', '10', '12', '14', '15', '20', '30', '40'] as const
const BIN_STATUSES = ['available', 'in_use', 'maintenance'] as const

const ACTIVE_ORDER_STATUSES = ['assigned', 'scheduled', 'in_progress', 'on_route'] as const
const CLOSED_ORDER_STATUSES = ['completed', 'issue'] as const

const statusClasses: Record<string, string> = {
  available: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  in_use: 'bg-blue-100 text-blue-700 border-blue-200',
  maintenance: 'bg-amber-100 text-amber-700 border-amber-200',
}

function formatStatus(status: string | null | undefined) {
  if (!status) return 'Available'
  return status
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

function parseDateSafely(value: string | null | undefined) {
  if (!value) return null

  const normalized = String(value).trim()

  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    const [year, month, day] = normalized.split('-').map(Number)
    const parsed = new Date(year, month - 1, day)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }

  const parsed = new Date(normalized)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function formatDate(date: string | null) {
  if (!date) return '—'
  const parsed = parseDateSafely(date)
  if (!parsed) return date

  return parsed.toLocaleDateString([], {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
}

function formatDateTime(date: string | null) {
  if (!date) return '—'
  const parsed = parseDateSafely(date)
  if (!parsed) return date

  return parsed.toLocaleString([], {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function getOrderSortTime(order: Order) {
  const updated = parseDateSafely(order.updated_at || null)?.getTime()
  if (typeof updated === 'number' && !Number.isNaN(updated)) return updated

  const created = parseDateSafely(order.created_at || null)?.getTime()
  if (typeof created === 'number' && !Number.isNaN(created)) return created

  const scheduled = parseDateSafely(order.scheduled_date || null)?.getTime()
  if (typeof scheduled === 'number' && !Number.isNaN(scheduled)) return scheduled

  return 0
}

function sortOrdersNewest(a: Order, b: Order) {
  return getOrderSortTime(b) - getOrderSortTime(a)
}

function formatRecentOrderLabel(order: Order | null) {
  if (!order) return '—'

  const pieces = [
    order.customer_name || '',
    order.order_type || '',
    order.service_address || order.pickup_address || '',
    formatDateTime(order.updated_at || order.created_at || order.scheduled_date || null),
  ].filter(Boolean)

  return pieces.join(' • ')
}

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

export default function BinsPage() {
  const supabase = createClient()
  const topAnchorRef = useRef<HTMLDivElement | null>(null)

  const [bins, setBins] = useState<Bin[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [pageError, setPageError] = useState('')
  const [userRole, setUserRole] = useState<UserRole>('unknown')

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sizeFilter, setSizeFilter] = useState('all')

  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingBin, setEditingBin] = useState<Bin | null>(null)
  const [modalVisible, setModalVisible] = useState(false)
  const modalCardRef = useRef<HTMLDivElement | null>(null)

  const emptyForm = {
    bin_number: '',
    bin_size: '20',
    status: 'available',
  }

  const [form, setForm] = useState(emptyForm)

  const isAdmin = userRole === 'admin'
  const isReadOnlyModal = Boolean(editingBin && !isAdmin)

  function isActiveOrder(order: Order) {
    return ACTIVE_ORDER_STATUSES.includes(
      (order.status || '') as (typeof ACTIVE_ORDER_STATUSES)[number]
    )
  }

  function isClosedOrder(order: Order) {
    return CLOSED_ORDER_STATUSES.includes(
      (order.status || '') as (typeof CLOSED_ORDER_STATUSES)[number]
    )
  }

  function getOrdersForBin(binId: string) {
    return orders.filter((order) => order.bin_id === binId || order.old_bin_id === binId)
  }

  function getLatestOrderForBin(binId: string) {
    return [...getOrdersForBin(binId)].sort(sortOrdersNewest)[0] || null
  }

  function getOrdersForBinFromSet(binId: string, orderSet: Order[]) {
    return orderSet.filter((order) => order.bin_id === binId || order.old_bin_id === binId)
  }

  function getLatestOrderForBinFromSet(binId: string, orderSet: Order[]) {
    return [...getOrdersForBinFromSet(binId, orderSet)].sort(sortOrdersNewest)[0] || null
  }

  function getActiveServiceOrdersForBinFromSet(binId: string, orderSet: Order[]) {
    return orderSet.filter(
      (order) => (order.bin_id === binId || order.old_bin_id === binId) && isActiveOrder(order)
    )
  }

  function getCurrentCompanyForBin(bin: Bin, activeOrders: Order[]) {
    if (activeOrders.length === 0) return ''
    const latestActive = [...activeOrders].sort(sortOrdersNewest)[0]
    return latestActive.customer_name?.trim() || ''
  }

  function getLocationOnly(value: string | null | undefined) {
    if (!value) return 'Yard'
    return value.split(' — ')[0]?.trim() || value
  }

  function getCompanyOnly(value: string | null | undefined) {
    if (!value) return '—'
    const company = value.split(' — ').slice(1).join(' — ').trim()
    return company || '—'
  }

  function getActiveLocationForBin(bin: Bin, activeOrders: Order[]) {
    if (activeOrders.length === 0) return null

    const latestActive = [...activeOrders].sort(sortOrdersNewest)[0]
    const type = latestActive.order_type || ''
    const serviceAddress = latestActive.service_address?.trim() || ''
    const pickupAddress = latestActive.pickup_address?.trim() || ''
    const customerName = latestActive.customer_name?.trim() || ''

    const jobSiteWithCompany = [serviceAddress || pickupAddress, customerName].filter(Boolean).join(' — ')

    if (type === 'DELIVERY') {
      return jobSiteWithCompany || serviceAddress || pickupAddress || 'Client Site'
    }

    if (type === 'REMOVAL') {
      return jobSiteWithCompany || serviceAddress || pickupAddress || 'Client Site'
    }

    if (type === 'EXCHANGE') {
      if (latestActive.bin_id === bin.id) {
        return jobSiteWithCompany || serviceAddress || pickupAddress || 'Client Site'
      }
      if (latestActive.old_bin_id === bin.id) {
        return jobSiteWithCompany || serviceAddress || pickupAddress || 'Client Site'
      }
    }

    if (type === 'DUMP RETURN') {
      return jobSiteWithCompany || serviceAddress || pickupAddress || 'Client Site'
    }

    return jobSiteWithCompany || serviceAddress || pickupAddress || 'On Service'
  }

  function getBinServiceState(bin: Bin, currentOrders: Order[] = orders) {
    if ((bin.status || 'available') === 'maintenance') {
      return {
        nextStatus: 'maintenance',
        nextLocation: bin.location || 'Yard',
        nextCompany: '—',
        latestOrder: getLatestOrderForBinFromSet(bin.id, currentOrders),
        totalOrders: getOrdersForBinFromSet(bin.id, currentOrders).length,
        activeOrders: getActiveServiceOrdersForBinFromSet(bin.id, currentOrders).length,
      }
    }

    const linkedOrders = getOrdersForBinFromSet(bin.id, currentOrders)
    const activeServiceOrders = getActiveServiceOrdersForBinFromSet(bin.id, currentOrders)
    const latestOrder = [...linkedOrders].sort(sortOrdersNewest)[0] || null

    if (activeServiceOrders.length > 0) {
      const nextLocation = getActiveLocationForBin(bin, activeServiceOrders) || 'On Service'
      return {
        nextStatus: 'in_use',
        nextLocation,
        nextCompany: getCurrentCompanyForBin(bin, activeServiceOrders) || getCompanyOnly(nextLocation),
        latestOrder,
        totalOrders: linkedOrders.length,
        activeOrders: activeServiceOrders.length,
      }
    }

    if (latestOrder && isClosedOrder(latestOrder)) {
      const type = latestOrder.order_type || ''
      const siteAddress =
        latestOrder.service_address?.trim() || latestOrder.pickup_address?.trim() || 'Client Site'
      const companyName = latestOrder.customer_name?.trim() || '—'

      if (type === 'DELIVERY' && latestOrder.bin_id === bin.id) {
        return {
          nextStatus: 'in_use',
          nextLocation: siteAddress,
          nextCompany: companyName,
          latestOrder,
          totalOrders: linkedOrders.length,
          activeOrders: 0,
        }
      }

      if (type === 'REMOVAL' && latestOrder.old_bin_id === bin.id) {
        return {
          nextStatus: 'available',
          nextLocation: 'Yard',
          nextCompany: '—',
          latestOrder,
          totalOrders: linkedOrders.length,
          activeOrders: 0,
        }
      }

      if (type === 'EXCHANGE') {
        if (latestOrder.bin_id === bin.id) {
          return {
            nextStatus: 'in_use',
            nextLocation: siteAddress,
            nextCompany: companyName,
            latestOrder,
            totalOrders: linkedOrders.length,
            activeOrders: 0,
          }
        }

        if (latestOrder.old_bin_id === bin.id) {
          return {
            nextStatus: 'available',
            nextLocation: 'Yard',
            nextCompany: '—',
            latestOrder,
            totalOrders: linkedOrders.length,
            activeOrders: 0,
          }
        }
      }

      if (type === 'DUMP RETURN' && latestOrder.bin_id === bin.id) {
        return {
          nextStatus: 'in_use',
          nextLocation: siteAddress,
          nextCompany: companyName,
          latestOrder,
          totalOrders: linkedOrders.length,
          activeOrders: 0,
        }
      }
    }

    return {
      nextStatus: bin.status || 'available',
      nextLocation: bin.location || 'Yard',
      nextCompany: '—',
      latestOrder,
      totalOrders: linkedOrders.length,
      activeOrders: 0,
    }
  }

  function scrollToTop() {
    topAnchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    window.scrollTo({ top: 0, behavior: 'smooth' })
    document.documentElement.scrollTo({ top: 0, behavior: 'smooth' })
    document.body.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function loadCurrentUserRole() {
    try {
      const { data: authData } = await supabase.auth.getUser()
      const user = authData.user

      if (!user) {
        setUserRole('unknown')
        return
      }

      const metaRole =
        (user.app_metadata?.role as string | undefined) ||
        (user.user_metadata?.role as string | undefined)

      if (metaRole === 'admin' || metaRole === 'dispatcher') {
        setUserRole(metaRole)
        return
      }

      const { data: profileById } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle()

      let profileRole = profileById?.role as string | undefined

      if (!profileRole && user.email) {
        const { data: profileByEmail } = await supabase
          .from('profiles')
          .select('role')
          .eq('email', user.email)
          .maybeSingle()

        profileRole = profileByEmail?.role as string | undefined
      }

      if (profileRole === 'admin' || profileRole === 'dispatcher') {
        setUserRole(profileRole)
      } else {
        setUserRole('unknown')
      }
    } catch {
      setUserRole('unknown')
    }
  }

  async function syncBinFromOrders(binId: string) {
    const currentBin = bins.find((bin) => bin.id === binId)
    if (!currentBin) return

    const state = getBinServiceState(currentBin)
    const currentStatus = currentBin.status || 'available'
    const currentLocation = currentBin.location || 'Yard'

    if (currentStatus === state.nextStatus && currentLocation === state.nextLocation) return

    const { error } = await supabase
      .from('bins')
      .update({
        status: state.nextStatus,
        location: state.nextLocation,
      })
      .eq('id', binId)

    if (error) {
      setPageError(error.message)
    }
  }

  async function syncAllBinsFromOrders(currentBins: Bin[], currentOrders: Order[]) {
    const updates = currentBins.map(async (bin) => {
      const state = getBinServiceState(bin, currentOrders)

      const currentStatus = bin.status || 'available'
      const currentLocation = bin.location || 'Yard'

      if (currentStatus === state.nextStatus && currentLocation === state.nextLocation) return

      const { error } = await supabase
        .from('bins')
        .update({
          status: state.nextStatus,
          location: state.nextLocation,
        })
        .eq('id', bin.id)

      if (error) throw error
    })

    if (updates.length === 0) return
    await Promise.all(updates)
  }

  async function loadBins() {
    const { data, error } = await supabase
      .from('bins')
      .select('id,bin_number,bin_size,location,status,created_at,updated_at')
      .order('created_at', { ascending: false })

    if (error) {
      setPageError(error.message)
      return [] as Bin[]
    }

    const nextBins = (data as Bin[]) || []
    setBins(nextBins)
    return nextBins
  }

  async function loadOrders() {
    const { data, error } = await supabase
      .from('order')
      .select('id,customer_name,bin_id,old_bin_id,status,order_type,scheduled_date,service_time,service_address,pickup_address,dump_site_address,workflow_step,created_at,updated_at')

    if (error) {
      setPageError(error.message)
      return [] as Order[]
    }

    const nextOrders = (data as Order[]) || []
    setOrders(nextOrders)
    return nextOrders
  }

  async function refreshAll() {
    setLoading(true)
    setPageError('')

    const [nextBins, nextOrders] = await Promise.all([loadBins(), loadOrders()])
    await syncAllBinsFromOrders(nextBins, nextOrders)
    await Promise.all([loadBins(), loadOrders(), loadCurrentUserRole()])

    setLoading(false)
  }

  useEffect(() => {
    void refreshAll()

    const channel = supabase
      .channel('bins-page-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bins' },
        async () => {
          await loadBins()
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'order' },
        async () => {
          await refreshAll()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  useEffect(() => {
    if (showCreateModal || editingBin) {
      setModalVisible(false)

      const animationTimer = window.setTimeout(() => {
        setModalVisible(true)
        modalCardRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        })
      }, 20)

      return () => {
        window.clearTimeout(animationTimer)
      }
    } else {
      setModalVisible(false)
    }
  }, [showCreateModal, editingBin])

  const binStats = useMemo(() => {
    const totalOrdersByBin: Record<string, number> = {}
    const activeOrdersByBin: Record<string, number> = {}

    for (const order of orders) {
      const linkedBinIds = [order.bin_id, order.old_bin_id].filter(Boolean) as string[]

      for (const binId of linkedBinIds) {
        totalOrdersByBin[binId] = (totalOrdersByBin[binId] || 0) + 1

        if ((order.bin_id === binId || order.old_bin_id === binId) && isActiveOrder(order)) {
          activeOrdersByBin[binId] = (activeOrdersByBin[binId] || 0) + 1
        }
      }
    }

    return { totalOrdersByBin, activeOrdersByBin }
  }, [orders])

  const dashboardCounts = useMemo(() => {
    return {
      total: bins.length,
      available: bins.filter((bin) => (bin.status || 'available') === 'available').length,
      in_use: bins.filter((bin) => bin.status === 'in_use').length,
      maintenance: bins.filter((bin) => bin.status === 'maintenance').length,
    }
  }, [bins])

  const filteredBins = useMemo(() => {
    const query = search.trim().toLowerCase()

    return bins.filter((bin) => {
      const state = getBinServiceState(bin)

      const matchesSearch =
        !query ||
        (bin.bin_number || '').toLowerCase().includes(query) ||
        (bin.bin_size || '').toLowerCase().includes(query) ||
        (bin.location || '').toLowerCase().includes(query) ||
        (state.nextLocation || '').toLowerCase().includes(query) ||
        (state.nextCompany || '').toLowerCase().includes(query)

      const matchesStatus =
        statusFilter === 'all' || (bin.status || 'available') === statusFilter

      const matchesSize =
        sizeFilter === 'all' || (bin.bin_size || '') === sizeFilter

      return matchesSearch && matchesStatus && matchesSize
    })
  }, [bins, search, statusFilter, sizeFilter, orders])

  function openCreateModal() {
    if (!isAdmin) return
    setEditingBin(null)
    setForm(emptyForm)
    setPageError('')
    setShowCreateModal(true)
  }

  function openDetailsModal(bin: Bin) {
    setEditingBin(bin)
    setShowCreateModal(false)
    setPageError('')
    setForm({
      bin_number: bin.bin_number || '',
      bin_size: bin.bin_size || '20',
      status: bin.status || 'available',
    })
  }

  function closeModal() {
    setEditingBin(null)
    setShowCreateModal(false)
    setForm(emptyForm)
    setPageError('')
  }

  async function handleCreateOrUpdate() {
    if (!isAdmin) {
      setPageError('Only admin can create or update bins.')
      return
    }

    setSaving(true)
    setPageError('')

    if (!form.bin_number.trim()) {
      setPageError('Bin number is required.')
      setSaving(false)
      return
    }

    const location =
      form.status === 'available'
        ? 'Yard'
        : editingBin?.location || 'Yard'

    const payload = {
      bin_number: form.bin_number.trim(),
      bin_size: form.bin_size || null,
      status: form.status || 'available',
      location,
    }

    if (editingBin) {
      const { error } = await supabase
        .from('bins')
        .update(payload)
        .eq('id', editingBin.id)

      if (error) {
        setPageError(error.message)
      } else {
        await loadBins()
        await syncBinFromOrders(editingBin.id)
        await Promise.all([loadBins(), loadOrders()])
        closeModal()
      }
    } else {
      const { error } = await supabase.from('bins').insert([payload])

      if (error) {
        setPageError(error.message)
      } else {
        await refreshAll()
        closeModal()
      }
    }

    setSaving(false)
  }

  async function handleDelete(binId: string) {
    if (!isAdmin) {
      setPageError('Only admin can delete bins.')
      return
    }

    const relatedActiveOrders = orders.filter(
      (order) => (order.bin_id === binId || order.old_bin_id === binId) && isActiveOrder(order)
    )

    if (relatedActiveOrders.length > 0) {
      window.alert(
        'This bin has active service orders linked to it. Complete or reassign those orders first.'
      )
      return
    }

    const confirmed = window.confirm('Delete this bin?')
    if (!confirmed) return

    setDeletingId(binId)
    setPageError('')

    const { error } = await supabase.from('bins').delete().eq('id', binId)

    if (error) {
      setPageError(error.message)
    } else {
      await refreshAll()
      closeModal()
    }

    setDeletingId(null)
  }

  async function handleQuickStatus(bin: Bin, value: string) {
    if (!isAdmin) {
      setPageError('Only admin can update bin status.')
      return
    }

    const activeOrders = binStats.activeOrdersByBin[bin.id] || 0

    if (value === 'available' && activeOrders > 0) {
      window.alert(
        'This bin still has active service orders. Reassign or complete the order first.'
      )
      return
    }

    setPageError('')

    const updatePayload: { status: string; location?: string | null } = {
      status: value,
    }

    if (value === 'available') {
      updatePayload.location = bin.location || 'Yard'
    }

    const { error } = await supabase
      .from('bins')
      .update(updatePayload)
      .eq('id', bin.id)

    if (error) {
      setPageError(error.message)
    } else {
      await refreshAll()
    }
  }

  const selectedBinState = useMemo(() => {
    if (!editingBin) return null
    return getBinServiceState(editingBin)
  }, [editingBin, orders])

  const selectedBinLatestOrder = useMemo(() => {
    if (!editingBin) return null
    return getLatestOrderForBin(editingBin.id)
  }, [editingBin, orders])

  const selectedBinOrders = useMemo(() => {
  if (!editingBin) return []

  return [...getOrdersForBin(editingBin.id)]
    .sort((a, b) => {
      const aTime = new Date(a.updated_at || a.created_at || 0).getTime()
      const bTime = new Date(b.updated_at || b.created_at || 0).getTime()
      return bTime - aTime // 👈 newest first
    })
    .slice(0, 5)
  }, [editingBin, orders])

  return (
    <div className="min-h-screen bg-slate-100">
      <div ref={topAnchorRef} />
      <div className="mx-auto max-w-[92rem] p-4 md:p-6">
        <div className="mb-6 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                Bin Inventory
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                Track yard stock, live bin availability, and client site location from service orders
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Link
                href="/dashboard"
                className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Back to Dashboard
              </Link>

              <Link
                href="/dispatch"
                className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Dispatch Board
              </Link>

              <button
                onClick={refreshAll}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Refresh
              </button>

              {isAdmin && (
                <button
                  onClick={openCreateModal}
                  className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90"
                >
                  New Bin
                </button>
              )}
            </div>
          </div>

          {pageError ? (
            <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {pageError}
            </div>
          ) : null}

          <div className="mt-6 grid gap-4 md:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Total Bins
              </div>
              <div className="mt-2 text-2xl font-bold text-slate-900">
                {dashboardCounts.total}
              </div>
            </div>

            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                Available
              </div>
              <div className="mt-2 text-2xl font-bold text-emerald-900">
                {dashboardCounts.available}
              </div>
            </div>

            <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-blue-700">
                In Use
              </div>
              <div className="mt-2 text-2xl font-bold text-blue-900">
                {dashboardCounts.in_use}
              </div>
            </div>

            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                Maintenance
              </div>
              <div className="mt-2 text-2xl font-bold text-amber-900">
                {dashboardCounts.maintenance}
              </div>
            </div>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-3">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search bin number, size, location, or company"
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-slate-400"
            />

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-slate-400"
            >
              <option value="all">All Statuses</option>
              {BIN_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {formatStatus(status)}
                </option>
              ))}
            </select>

            <select
              value={sizeFilter}
              onChange={(e) => setSizeFilter(e.target.value)}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-slate-400"
            >
              <option value="all">All Sizes</option>
              {BIN_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size} Yard
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-slate-200">
          {loading ? (
            <div className="p-10 text-center text-sm text-slate-500">
              Loading bins...
            </div>
          ) : filteredBins.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">
              No bins found.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1160px] divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                      Bin Number
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                      Size
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                      Current Location
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                      Company
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                      Order History
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                      Added
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100 bg-white">
                  {filteredBins.map((bin) => {
                    const state = getBinServiceState(bin)
                    const badgeClass =
                      statusClasses[state.nextStatus] || statusClasses.available

                    return (
                      <tr
                        key={bin.id}
                        className="cursor-pointer hover:bg-slate-50/80"
                        onClick={() => openDetailsModal(bin)}
                      >
                        <td className="px-4 py-4 align-top">
                          <div className="font-semibold text-slate-900">
                            {bin.bin_number || 'No bin number'}
                          </div>
                        </td>

                        <td className="px-4 py-4 align-top text-sm text-slate-700">
                          {bin.bin_size ? `${bin.bin_size} Yard` : '—'}
                        </td>

                        <td className="px-4 py-4 align-top text-sm text-slate-700">
                          {getLocationOnly(state.nextLocation || 'Yard')}
                        </td>

                        <td className="px-4 py-4 align-top text-sm text-slate-700">
                          {state.nextStatus === 'available' ? '—' : (state.nextCompany || getCompanyOnly(state.nextLocation) || '—')}
                        </td>

                        <td className="px-4 py-4 align-top text-sm text-slate-700">
                          <div>Total Orders: {state.totalOrders}</div>
                          <div className="mt-1 text-slate-500">Active: {state.activeOrders}</div>
                          {state.latestOrder?.scheduled_date ? (
                            <div className="mt-1 text-xs text-slate-500">
                              Last: {formatDate(state.latestOrder.scheduled_date)}
                            </div>
                          ) : null}
                        </td>

                        <td className="px-4 py-4 align-top">
                          <span
                            className={`inline-flex w-fit rounded-full border px-2.5 py-1 text-xs font-semibold ${badgeClass}`}
                          >
                            {formatStatus(state.nextStatus)}
                          </span>
                        </td>

                        <td className="px-4 py-4 align-top text-sm text-slate-700">
                          {formatDate(bin.created_at)}
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
          <button
            onClick={scrollToTop}
            className="inline-flex items-center justify-center gap-3 rounded-3xl border border-slate-200 bg-white px-6 py-4 text-base font-bold text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            <span className="text-3xl font-extrabold leading-none text-slate-700">↑</span>
            <span className="font-bold">Top</span>
          </button>
        </div>
      </div>

      {(showCreateModal || editingBin) && (
        <div
          className={`fixed inset-0 z-50 overflow-y-auto transition-all duration-300 ease-out ${
            modalVisible ? 'bg-slate-900/40 opacity-100' : 'bg-slate-900/0 opacity-0'
          }`}
        >
          <div className="flex min-h-full items-start justify-center p-4 md:p-6">
            <div
              ref={modalCardRef}
              className={`my-6 w-full max-w-3xl max-h-[calc(100vh-3rem)] overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl transition-all duration-300 ease-out ${
                modalVisible
                  ? 'translate-y-0 scale-100 opacity-100'
                  : 'translate-y-4 scale-[0.985] opacity-0'
              }`}
            >
              <div className="mb-6 flex items-start justify-between gap-4">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {editingBin?.bin_number || 'New Bin'}
                  </div>
                  <h2 className="mt-1 text-xl font-bold text-slate-900">
                    {showCreateModal ? 'Create Bin' : 'Bin Details'}
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    {isAdmin
                      ? 'View and manage bin inventory, status, and service location.'
                      : 'View bin information, status, and order history.'}
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

              {showCreateModal ? (
                <>
                  <div className="grid gap-4">
                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-700">
                        Bin Number
                      </label>
                      <input
                        value={form.bin_number}
                        onChange={(e) =>
                          setForm((prev) => ({ ...prev, bin_number: e.target.value }))
                        }
                        className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-slate-400"
                        placeholder="BIN-001"
                      />
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <label className="mb-2 block text-sm font-medium text-slate-700">
                          Bin Size
                        </label>
                        <select
                          value={form.bin_size}
                          onChange={(e) =>
                            setForm((prev) => ({ ...prev, bin_size: e.target.value }))
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
                          Status
                        </label>
                        <select
                          value={form.status}
                          onChange={(e) =>
                            setForm((prev) => ({ ...prev, status: e.target.value }))
                          }
                          className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-slate-400"
                        >
                          {BIN_STATUSES.map((status) => (
                            <option key={status} value={status}>
                              {formatStatus(status)}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                      A bin can be available for a new order from its current location.
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
                      {saving ? 'Saving...' : 'Create Bin'}
                    </button>
                  </div>
                </>
              ) : editingBin ? (
                <>
                  <div className="grid gap-4 md:grid-cols-2">
                    <ReadOnlyField
                      label="Bin Number"
                      value={editingBin.bin_number || '—'}
                    />
                    <ReadOnlyField
                      label="Bin Size"
                      value={editingBin.bin_size ? `${editingBin.bin_size} Yard` : '—'}
                    />

                    <ReadOnlyField
                      label="Current Location"
                      value={getLocationOnly(selectedBinState?.nextLocation || editingBin.location || 'Yard')}
                    />
                    <ReadOnlyField
                      label="Company"
                      value={
                        (selectedBinState?.nextStatus || editingBin.status || 'available') === 'available'
                          ? '—'
                          : (selectedBinState?.nextCompany || getCompanyOnly(selectedBinState?.nextLocation || editingBin.location || '') || '—')
                      }
                    />

                    <ReadOnlyField
                      label="Status"
                      value={formatStatus(selectedBinState?.nextStatus || editingBin.status || 'available')}
                    />
                    <ReadOnlyField
                      label="Added"
                      value={formatDate(editingBin.created_at)}
                    />

                    <ReadOnlyField
                      label="Last Updated"
                      value={formatDateTime(editingBin.updated_at)}
                    />
                    <ReadOnlyField
                      label="Order History Count"
                      value={String(selectedBinState?.totalOrders || 0)}
                    />

                    <ReadOnlyField
                      label="Most Recent Order"
                      value={formatRecentOrderLabel(selectedBinLatestOrder)}
                      className="md:col-span-2"
                    />

                    <div className="md:col-span-2 rounded-2xl border border-slate-200 bg-white">
                      <div className="border-b border-slate-200 px-4 py-3">
                        <h3 className="font-semibold text-slate-900">Order History</h3>
                      </div>

                      {selectedBinOrders.length === 0 ? (
                        <div className="px-4 py-6 text-sm text-slate-500">
                          No orders linked to this bin yet.
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="min-w-full divide-y divide-slate-200">
                            <thead className="bg-slate-50">
                              <tr>
                                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                                  Date / Time
                                </th>
                                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                                  Company
                                </th>
                                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                                  Order Type
                                </th>
                                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                                  Status
                                </th>
                                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                                  Job Site
                                </th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 bg-white">
                              {selectedBinOrders.map((order) => (
                                <tr key={order.id}>
                                  <td className="px-4 py-3 text-sm text-slate-700">
                                    {formatDateTime(order.updated_at || order.created_at || order.scheduled_date || null)}
                                  </td>
                                  <td className="px-4 py-3 text-sm text-slate-700">
                                    {order.customer_name || '—'}
                                  </td>
                                  <td className="px-4 py-3 text-sm text-slate-700">
                                    {order.order_type || '—'}
                                  </td>
                                  <td className="px-4 py-3 text-sm text-slate-700">
                                    {formatStatus(order.status)}
                                  </td>
                                  <td className="px-4 py-3 text-sm text-slate-700">
                                    {order.service_address || order.pickup_address || '—'}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mt-6 flex justify-end gap-3">
                    {isAdmin && (
                      <>
                        <button
                          onClick={() => handleQuickStatus(editingBin, 'available')}
                          className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          Mark Available
                        </button>

                        <button
                          onClick={() => handleQuickStatus(editingBin, 'maintenance')}
                          className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-700 hover:bg-amber-100"
                        >
                          Maintenance
                        </button>

                        <button
                          onClick={() => handleDelete(editingBin.id)}
                          disabled={deletingId === editingBin.id}
                          className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                        >
                          {deletingId === editingBin.id ? 'Deleting...' : 'Delete'}
                        </button>
                      </>
                    )}

                    <button
                      onClick={closeModal}
                      className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Close
                    </button>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}