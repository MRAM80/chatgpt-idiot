'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
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
  bin_id: string | null
  old_bin_id: string | null
  status: string | null
  order_type: string | null
  scheduled_date: string | null
  service_address: string | null
  created_at: string | null
}

type UserRole = 'admin' | 'dispatcher' | 'unknown'

const BIN_SIZES = ['6', '8', '10', '12', '14', '15', '20', '30', '40'] as const
const BIN_STATUSES = ['available', 'in_use', 'maintenance'] as const

const ACTIVE_ORDER_STATUSES = ['assigned', 'scheduled', 'in_progress', 'on_route'] as const

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

function formatDate(date: string | null) {
  if (!date) return '—'
  const parsed = new Date(date)
  if (Number.isNaN(parsed.getTime())) return date
  return parsed.toLocaleDateString()
}

function sortOrdersNewest(a: Order, b: Order) {
  const aDate = new Date(a.scheduled_date || a.created_at || 0).getTime()
  const bDate = new Date(b.scheduled_date || b.created_at || 0).getTime()
  return bDate - aDate
}

export default function BinsPage() {
  const supabase = createClient()

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

  const emptyForm = {
    bin_number: '',
    bin_size: '20',
    status: 'available',
  }

  const [form, setForm] = useState(emptyForm)

  const isAdmin = userRole === 'admin'

  function isActiveOrder(order: Order) {
    return ACTIVE_ORDER_STATUSES.includes((order.status || '') as (typeof ACTIVE_ORDER_STATUSES)[number])
  }

  function getOrdersForBin(binId: string) {
    return orders.filter((order) => order.bin_id === binId || order.old_bin_id === binId)
  }

  function getActiveServiceOrdersForBin(binId: string) {
    return orders.filter((order) => order.bin_id === binId && isActiveOrder(order))
  }

  function getLatestOrderForBin(binId: string) {
    return [...getOrdersForBin(binId)].sort(sortOrdersNewest)[0] || null
  }

  function getCurrentLocationFromOrders(binId: string) {
    const activeOrder = [...getActiveServiceOrdersForBin(binId)].sort(sortOrdersNewest)[0] || null

    if (activeOrder?.service_address?.trim()) {
      return activeOrder.service_address.trim()
    }

    return 'Yard'
  }

  function getNextStatusFromOrders(binId: string, currentStatus: string | null) {
    if ((currentStatus || 'available') === 'maintenance') {
      return 'maintenance'
    }

    const activeOrders = getActiveServiceOrdersForBin(binId)
    return activeOrders.length > 0 ? 'in_use' : 'available'
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

      const { data: profileData } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle()

      const profileRole = profileData?.role as string | undefined

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

    const nextStatus = getNextStatusFromOrders(binId, currentBin.status)
    const nextLocation = getCurrentLocationFromOrders(binId)

    const currentStatus = currentBin.status || 'available'
    const currentLocation = currentBin.location || 'Yard'

    if (currentStatus === nextStatus && currentLocation === nextLocation) return

    const { error } = await supabase
      .from('bins')
      .update({
        status: nextStatus,
        location: nextLocation,
      })
      .eq('id', binId)

    if (error) {
      setPageError(error.message)
    }
  }

  async function syncAllBinsFromOrders(currentBins: Bin[], currentOrders: Order[]) {
    const updates = currentBins.map(async (bin) => {
      const activeOrders = currentOrders.filter(
        (order) =>
          order.bin_id === bin.id &&
          ACTIVE_ORDER_STATUSES.includes((order.status || '') as (typeof ACTIVE_ORDER_STATUSES)[number])
      )

      const nextStatus =
        (bin.status || 'available') === 'maintenance'
          ? 'maintenance'
          : activeOrders.length > 0
            ? 'in_use'
            : 'available'

      const latestActive = [...activeOrders].sort(sortOrdersNewest)[0] || null
      const nextLocation = latestActive?.service_address?.trim() || 'Yard'

      const currentStatus = bin.status || 'available'
      const currentLocation = bin.location || 'Yard'

      if (currentStatus === nextStatus && currentLocation === nextLocation) return

      const { error } = await supabase
        .from('bins')
        .update({
          status: nextStatus,
          location: nextLocation,
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
      .select('id,bin_id,old_bin_id,status,order_type,scheduled_date,service_address,created_at')

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

  const binStats = useMemo(() => {
    const totalOrdersByBin: Record<string, number> = {}
    const activeOrdersByBin: Record<string, number> = {}

    for (const order of orders) {
      const linkedBinIds = [order.bin_id, order.old_bin_id].filter(Boolean) as string[]

      for (const binId of linkedBinIds) {
        totalOrdersByBin[binId] = (totalOrdersByBin[binId] || 0) + 1

        if (order.bin_id === binId && isActiveOrder(order)) {
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
      const matchesSearch =
        !query ||
        (bin.bin_number || '').toLowerCase().includes(query) ||
        (bin.bin_size || '').toLowerCase().includes(query) ||
        (bin.location || '').toLowerCase().includes(query)

      const matchesStatus =
        statusFilter === 'all' || (bin.status || 'available') === statusFilter

      const matchesSize =
        sizeFilter === 'all' || (bin.bin_size || '') === sizeFilter

      return matchesSearch && matchesStatus && matchesSize
    })
  }, [bins, search, statusFilter, sizeFilter])

  function openCreateModal() {
    if (!isAdmin) return
    setEditingBin(null)
    setForm(emptyForm)
    setPageError('')
    setShowCreateModal(true)
  }

  function openEditModal(bin: Bin) {
    if (!isAdmin) return
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

    const payload = {
      bin_number: form.bin_number.trim(),
      bin_size: form.bin_size || null,
      status: form.status || 'available',
      location: form.status === 'available' ? 'Yard' : null,
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
      (order) => order.bin_id === binId && isActiveOrder(order)
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
      updatePayload.location = 'Yard'
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

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="mx-auto max-w-7xl p-4 md:p-6">
        <div className="mb-6 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                Bin Inventory
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                Track yard stock, live bin availability, and current service location from active orders
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
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

          {!isAdmin && (
            <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
              Dispatcher view: stock is view-only. Bin create, edit, delete, and manual status changes are admin-only.
            </div>
          )}

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
                Available In Yard
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
              placeholder="Search bin number, size, or location"
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
              <table className="min-w-full divide-y divide-slate-200">
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
                      Order History
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                      Added
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wide text-slate-500">
                      Actions
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100 bg-white">
                  {filteredBins.map((bin) => {
                    const totalOrders = binStats.totalOrdersByBin[bin.id] || 0
                    const activeOrders = binStats.activeOrdersByBin[bin.id] || 0
                    const latestOrder = getLatestOrderForBin(bin.id)
                    const badgeClass =
                      statusClasses[bin.status || 'available'] || statusClasses.available

                    return (
                      <tr key={bin.id} className="hover:bg-slate-50/80">
                        <td className="px-4 py-4 align-top">
                          <div className="font-semibold text-slate-900">
                            {bin.bin_number || 'No bin number'}
                          </div>
                        </td>

                        <td className="px-4 py-4 align-top text-sm text-slate-700">
                          {bin.bin_size ? `${bin.bin_size} Yard` : '—'}
                        </td>

                        <td className="px-4 py-4 align-top text-sm text-slate-700">
                          <div>{bin.location || 'Yard'}</div>
                          {activeOrders > 0 ? (
                            <div className="mt-1 text-xs text-slate-500">
                              Active service location
                            </div>
                          ) : (
                            <div className="mt-1 text-xs text-slate-500">
                              In yard
                            </div>
                          )}
                        </td>

                        <td className="px-4 py-4 align-top text-sm text-slate-700">
                          <div>Total Orders: {totalOrders}</div>
                          <div className="mt-1 text-slate-500">Active: {activeOrders}</div>
                          {latestOrder?.scheduled_date ? (
                            <div className="mt-1 text-xs text-slate-500">
                              Last: {formatDate(latestOrder.scheduled_date)}
                            </div>
                          ) : null}
                        </td>

                        <td className="px-4 py-4 align-top">
                          <div className="flex flex-col gap-2">
                            <span
                              className={`inline-flex w-fit rounded-full border px-2.5 py-1 text-xs font-semibold ${badgeClass}`}
                            >
                              {formatStatus(bin.status || 'available')}
                            </span>

                            {isAdmin ? (
                              <select
                                value={bin.status || 'available'}
                                onChange={(e) => handleQuickStatus(bin, e.target.value)}
                                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-slate-400"
                              >
                                {BIN_STATUSES.map((status) => (
                                  <option key={status} value={status}>
                                    {formatStatus(status)}
                                  </option>
                                ))}
                              </select>
                            ) : null}
                          </div>
                        </td>

                        <td className="px-4 py-4 align-top text-sm text-slate-700">
                          {formatDate(bin.created_at)}
                        </td>

                        <td className="px-4 py-4 align-top">
                          <div className="flex justify-end gap-2">
                            {isAdmin ? (
                              <>
                                <button
                                  onClick={() => openEditModal(bin)}
                                  className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition hover:opacity-90"
                                >
                                  Edit
                                </button>

                                <button
                                  onClick={() => handleDelete(bin.id)}
                                  disabled={deletingId === bin.id}
                                  className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                                >
                                  {deletingId === bin.id ? 'Deleting...' : 'Delete'}
                                </button>
                              </>
                            ) : (
                              <span className="text-sm text-slate-400">View Only</span>
                            )}
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

      {(showCreateModal || editingBin) && isAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-2xl rounded-3xl bg-white p-6 shadow-2xl">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-slate-900">
                  {editingBin ? 'Edit Bin' : 'Create Bin'}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Bin inventory stores size only. Material type belongs to the order.
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
                Location is synced automatically from the active service order. If the bin is not assigned to an active service order, it will stay in the <strong>Yard</strong>.
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
                {saving ? 'Saving...' : editingBin ? 'Save Changes' : 'Create Bin'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}