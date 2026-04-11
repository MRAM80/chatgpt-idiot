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
  truck_id: string | null
  auth_user_id?: string | null
  last_login_at?: string | null
  created_at: string | null
}

type Truck = {
  id: string
  truck_number: string | null
  plate_number: string | null
  status: string | null
  created_at: string | null
}

type Order = {
  id: string
  driver_id: string | null
  customer_name: string | null
  service_address: string | null
  pickup_address: string | null
  status: string | null
  scheduled_date: string | null
}

const DRIVER_STATUSES = ['available', 'busy', 'offline'] as const
const TRUCK_STATUSES = ['available', 'in_use', 'maintenance', 'offline'] as const

const driverStatusClasses: Record<string, string> = {
  available: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  busy: 'bg-amber-100 text-amber-700 border-amber-200',
  offline: 'bg-slate-100 text-slate-700 border-slate-200',
}

const truckStatusClasses: Record<string, string> = {
  available: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  in_use: 'bg-blue-100 text-blue-700 border-blue-200',
  maintenance: 'bg-amber-100 text-amber-700 border-amber-200',
  offline: 'bg-slate-100 text-slate-700 border-slate-200',
}

function formatStatus(status: string | null | undefined) {
  if (!status) return 'Available'
  return status
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
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
  if (Number.isNaN(parsed.getTime())) return String(date)
  return parsed.toLocaleString()
}

function shortId(value: string | null | undefined) {
  if (!value) return '—'
  return value.slice(0, 8)
}

export default function DriversPage() {
  const supabase = createClient()

  const [drivers, setDrivers] = useState<Driver[]>([])
  const [trucks, setTrucks] = useState<Truck[]>([])
  const [orders, setOrders] = useState<Order[]>([])

  const [loading, setLoading] = useState(true)
  const [savingDriver, setSavingDriver] = useState(false)
  const [savingTruck, setSavingTruck] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deletingTruckId, setDeletingTruckId] = useState<string | null>(null)
  const [resettingLinkId, setResettingLinkId] = useState<string | null>(null)
  const [pageError, setPageError] = useState('')

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  const [showDriverModal, setShowDriverModal] = useState(false)
  const [editingDriver, setEditingDriver] = useState<Driver | null>(null)

  const [showTruckModal, setShowTruckModal] = useState(false)
  const [editingTruck, setEditingTruck] = useState<Truck | null>(null)

  const emptyDriverForm = {
    name: '',
    email: '',
    phone: '',
    status: 'available',
    truck_id: '',
  }

  const emptyTruckForm = {
    truck_number: '',
    plate_number: '',
    status: 'available',
  }

  const [driverForm, setDriverForm] = useState(emptyDriverForm)
  const [truckForm, setTruckForm] = useState(emptyTruckForm)

  async function loadDrivers() {
    const { data, error } = await supabase
      .from('drivers')
      .select('id,name,email,phone,status,truck_id,auth_user_id,last_login_at,created_at')
      .order('created_at', { ascending: false })

    if (error) {
      setPageError(error.message)
      return
    }

    setDrivers((data as Driver[]) || [])
  }

  async function loadTrucks() {
    const { data, error } = await supabase
      .from('trucks')
      .select('id,truck_number,plate_number,status,created_at')
      .order('truck_number', { ascending: true })

    if (error) {
      setPageError(error.message)
      return
    }

    setTrucks((data as Truck[]) || [])
  }

  async function loadOrders() {
    const { data, error } = await supabase
      .from('order')
      .select('id,driver_id,customer_name,service_address,pickup_address,status,scheduled_date')

    if (error) {
      setPageError(error.message)
      return
    }

    setOrders((data as Order[]) || [])
  }

  async function refreshAll() {
    setLoading(true)
    setPageError('')
    await Promise.all([loadDrivers(), loadTrucks(), loadOrders()])
    setLoading(false)
  }

  useEffect(() => {
    refreshAll()

    const channel = supabase
      .channel('drivers-trucks-page-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'drivers' },
        async () => {
          await loadDrivers()
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'trucks' },
        async () => {
          await loadTrucks()
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'order' },
        async () => {
          await loadOrders()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  const driverStats = useMemo(() => {
    const totalOrdersByDriver: Record<string, number> = {}
    const activeOrdersByDriver: Record<string, number> = {}
    const completedOrdersByDriver: Record<string, number> = {}

    for (const order of orders) {
      if (!order.driver_id) continue

      totalOrdersByDriver[order.driver_id] = (totalOrdersByDriver[order.driver_id] || 0) + 1

      if (order.status === 'assigned' || order.status === 'in_progress') {
        activeOrdersByDriver[order.driver_id] = (activeOrdersByDriver[order.driver_id] || 0) + 1
      }

      if (order.status === 'completed') {
        completedOrdersByDriver[order.driver_id] =
          (completedOrdersByDriver[order.driver_id] || 0) + 1
      }
    }

    return { totalOrdersByDriver, activeOrdersByDriver, completedOrdersByDriver }
  }, [orders])

  const truckUsageByDriver = useMemo(() => {
    const map: Record<string, Driver[]> = {}

    for (const driver of drivers) {
      if (!driver.truck_id) continue
      if (!map[driver.truck_id]) map[driver.truck_id] = []
      map[driver.truck_id].push(driver)
    }

    return map
  }, [drivers])

  const dashboardCounts = useMemo(() => {
    return {
      totalDrivers: drivers.length,
      availableDrivers: drivers.filter((driver) => driver.status === 'available').length,
      busyDrivers: drivers.filter((driver) => driver.status === 'busy').length,
      linkedDrivers: drivers.filter((driver) => !!driver.auth_user_id).length,
      totalTrucks: trucks.length,
      availableTrucks: trucks.filter((truck) => truck.status === 'available').length,
    }
  }, [drivers, trucks])

  const filteredDrivers = useMemo(() => {
    const query = search.trim().toLowerCase()

    return drivers.filter((driver) => {
      const truck = trucks.find((item) => item.id === driver.truck_id)
      const authStatus = driver.auth_user_id ? 'linked' : 'not linked'

      const matchesSearch =
        !query ||
        (driver.name || '').toLowerCase().includes(query) ||
        (driver.email || '').toLowerCase().includes(query) ||
        (driver.phone || '').toLowerCase().includes(query) ||
        (truck?.truck_number || '').toLowerCase().includes(query) ||
        (truck?.plate_number || '').toLowerCase().includes(query) ||
        authStatus.includes(query)

      const matchesStatus =
        statusFilter === 'all' || (driver.status || 'available') === statusFilter

      return matchesSearch && matchesStatus
    })
  }, [drivers, trucks, search, statusFilter])

  const availableTruckOptions = useMemo(() => {
    const currentTruckId = editingDriver?.truck_id || ''

    return trucks.filter((truck) => {
      const assignedDrivers = truckUsageByDriver[truck.id] || []
      const isAssignedToSomeoneElse = assignedDrivers.some(
        (driver) => driver.id !== editingDriver?.id
      )

      if (truck.id === currentTruckId) return true
      if (truck.status !== 'available') return false
      if (isAssignedToSomeoneElse) return false

      return true
    })
  }, [trucks, truckUsageByDriver, editingDriver])

  function openCreateDriverModal() {
    setEditingDriver(null)
    setDriverForm(emptyDriverForm)
    setShowDriverModal(true)
  }

  function openEditDriverModal(driver: Driver) {
    setEditingDriver(driver)
    setDriverForm({
      name: driver.name || '',
      email: driver.email || '',
      phone: driver.phone || '',
      status: driver.status || 'available',
      truck_id: driver.truck_id || '',
    })
    setShowDriverModal(true)
  }

  function closeDriverModal() {
    setEditingDriver(null)
    setShowDriverModal(false)
    setDriverForm(emptyDriverForm)
  }

  function openCreateTruckModal() {
    setEditingTruck(null)
    setTruckForm(emptyTruckForm)
    setShowTruckModal(true)
  }

  function openEditTruckModal(truck: Truck) {
    setEditingTruck(truck)
    setTruckForm({
      truck_number: truck.truck_number || '',
      plate_number: truck.plate_number || '',
      status: truck.status || 'available',
    })
    setShowTruckModal(true)
  }

  function closeTruckModal() {
    setEditingTruck(null)
    setShowTruckModal(false)
    setTruckForm(emptyTruckForm)
  }

  async function syncTruckStatusFromDriver(
    oldTruckId: string | null,
    newTruckId: string | null,
    driverStatus: string
  ) {
    if (oldTruckId && oldTruckId !== newTruckId) {
      const stillUsed = drivers.some(
        (driver) => driver.id !== editingDriver?.id && driver.truck_id === oldTruckId
      )

      if (!stillUsed) {
        await supabase.from('trucks').update({ status: 'available' }).eq('id', oldTruckId)
      }
    }

    if (newTruckId) {
      const nextTruckStatus =
        driverStatus === 'offline' ? 'available' : 'in_use'

      await supabase.from('trucks').update({ status: nextTruckStatus }).eq('id', newTruckId)
    }
  }

  async function handleCreateOrUpdateDriver() {
    setSavingDriver(true)
    setPageError('')

    const payload = {
      name: driverForm.name || null,
      email: driverForm.email || null,
      phone: driverForm.phone || null,
      status: driverForm.status || 'available',
      truck_id: driverForm.truck_id || null,
    }

    if (editingDriver) {
      const activeOrders = driverStats.activeOrdersByDriver[editingDriver.id] || 0

      if (payload.status === 'available' && activeOrders > 0) {
        setPageError(
          'This driver still has active orders. Keep as busy, set offline, or reassign the orders first.'
        )
        setSavingDriver(false)
        return
      }

      const { error } = await supabase
        .from('drivers')
        .update(payload)
        .eq('id', editingDriver.id)

      if (error) {
        setPageError(error.message)
        setSavingDriver(false)
        return
      }

      await syncTruckStatusFromDriver(
        editingDriver.truck_id,
        payload.truck_id,
        payload.status || 'available'
      )
    } else {
      const { data, error } = await supabase
        .from('drivers')
        .insert([payload])
        .select('id')
        .single()

      if (error) {
        setPageError(error.message)
        setSavingDriver(false)
        return
      }

      if (payload.truck_id) {
        const nextTruckStatus =
          payload.status === 'offline' ? 'available' : 'in_use'

        await supabase
          .from('trucks')
          .update({ status: nextTruckStatus })
          .eq('id', payload.truck_id)
      }

      if (!data?.id) {
        setPageError('Driver created, but response did not return an id.')
      }
    }

    await refreshAll()
    closeDriverModal()
    setSavingDriver(false)
  }

  async function handleDeleteDriver(driverId: string) {
    const relatedActiveOrders = orders.filter(
      (order) =>
        order.driver_id === driverId &&
        (order.status === 'assigned' || order.status === 'in_progress')
    )

    if (relatedActiveOrders.length > 0) {
      window.alert(
        'This driver has active orders assigned. Reassign or complete those orders first.'
      )
      return
    }

    const driver = drivers.find((item) => item.id === driverId)
    const confirmed = window.confirm('Delete this driver?')
    if (!confirmed) return

    setDeletingId(driverId)
    setPageError('')

    const { error } = await supabase.from('drivers').delete().eq('id', driverId)

    if (error) {
      setPageError(error.message)
      setDeletingId(null)
      return
    }

    if (driver?.truck_id) {
      const stillUsed = drivers.some(
        (item) => item.id !== driver.id && item.truck_id === driver.truck_id
      )

      if (!stillUsed) {
        await supabase.from('trucks').update({ status: 'available' }).eq('id', driver.truck_id)
      }
    }

    await refreshAll()
    setDeletingId(null)
  }

  async function handleResetLink(driver: Driver) {
    if (!driver.auth_user_id) return

    const confirmed = window.confirm(
      `Reset login link for ${driver.name || 'this driver'}?\n\nThis will remove the current auth connection.`
    )
    if (!confirmed) return

    setResettingLinkId(driver.id)
    setPageError('')

    const { error } = await supabase
      .from('drivers')
      .update({
        auth_user_id: null,
        last_login_at: null,
      })
      .eq('id', driver.id)

    if (error) {
      setPageError(error.message)
      setResettingLinkId(null)
      return
    }

    await refreshAll()
    setResettingLinkId(null)
  }

  async function handleQuickStatus(driver: Driver, value: string) {
    const activeOrders = driverStats.activeOrdersByDriver[driver.id] || 0

    if (value === 'available' && activeOrders > 0) {
      window.alert(
        'This driver still has active orders. Keep as busy or reassign the orders first.'
      )
      return
    }

    setPageError('')

    const { error } = await supabase
      .from('drivers')
      .update({ status: value })
      .eq('id', driver.id)

    if (error) {
      setPageError(error.message)
      return
    }

    if (driver.truck_id) {
      const nextTruckStatus = value === 'offline' ? 'available' : 'in_use'
      await supabase
        .from('trucks')
        .update({ status: nextTruckStatus })
        .eq('id', driver.truck_id)
    }

    await refreshAll()
  }

  async function handleCreateOrUpdateTruck() {
    setSavingTruck(true)
    setPageError('')

    const payload = {
      truck_number: truckForm.truck_number || null,
      plate_number: truckForm.plate_number || null,
      status: truckForm.status || 'available',
    }

    if (!payload.truck_number) {
      setPageError('Truck number is required.')
      setSavingTruck(false)
      return
    }

    if (editingTruck) {
      const assignedDrivers = truckUsageByDriver[editingTruck.id] || []

      if (
        assignedDrivers.length > 0 &&
        (payload.status === 'maintenance' || payload.status === 'offline')
      ) {
        setPageError(
          'This truck is assigned to a driver. Remove the driver assignment first before setting this truck unavailable.'
        )
        setSavingTruck(false)
        return
      }

      const { error } = await supabase
        .from('trucks')
        .update(payload)
        .eq('id', editingTruck.id)

      if (error) {
        setPageError(error.message)
      } else {
        await refreshAll()
        closeTruckModal()
      }
    } else {
      const { error } = await supabase.from('trucks').insert([payload])

      if (error) {
        setPageError(error.message)
      } else {
        await refreshAll()
        closeTruckModal()
      }
    }

    setSavingTruck(false)
  }

  async function handleDeleteTruck(truckId: string) {
    const assignedDrivers = truckUsageByDriver[truckId] || []

    if (assignedDrivers.length > 0) {
      window.alert('This truck is assigned to a driver. Remove the assignment first.')
      return
    }

    const confirmed = window.confirm('Delete this truck?')
    if (!confirmed) return

    setDeletingTruckId(truckId)
    setPageError('')

    const { error } = await supabase.from('trucks').delete().eq('id', truckId)

    if (error) {
      setPageError(error.message)
    } else {
      await refreshAll()
    }

    setDeletingTruckId(null)
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="mx-auto max-w-7xl p-4 md:p-6">
        <div className="mb-6 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                Drivers
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                Manage drivers, truck alignment, dispatch readiness, and login access
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
                onClick={openCreateTruckModal}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                New Truck
              </button>
              <button
                onClick={openCreateDriverModal}
                className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90"
              >
                New Driver
              </button>
            </div>
          </div>

          {pageError ? (
            <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {pageError}
            </div>
          ) : null}

          <div className="mt-6 grid gap-4 md:grid-cols-6">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Total Drivers
              </div>
              <div className="mt-2 text-2xl font-bold text-slate-900">
                {dashboardCounts.totalDrivers}
              </div>
            </div>

            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                Available Drivers
              </div>
              <div className="mt-2 text-2xl font-bold text-emerald-900">
                {dashboardCounts.availableDrivers}
              </div>
            </div>

            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                Busy Drivers
              </div>
              <div className="mt-2 text-2xl font-bold text-amber-900">
                {dashboardCounts.busyDrivers}
              </div>
            </div>

            <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-blue-700">
                Linked Logins
              </div>
              <div className="mt-2 text-2xl font-bold text-blue-900">
                {dashboardCounts.linkedDrivers}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Total Trucks
              </div>
              <div className="mt-2 text-2xl font-bold text-slate-900">
                {dashboardCounts.totalTrucks}
              </div>
            </div>

            <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-blue-700">
                Available Trucks
              </div>
              <div className="mt-2 text-2xl font-bold text-blue-900">
                {dashboardCounts.availableTrucks}
              </div>
            </div>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search driver, email, phone, truck number, plate, or linked"
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-slate-400"
            />

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-slate-400"
            >
              <option value="all">All Statuses</option>
              {DRIVER_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {formatStatus(status)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mb-6 overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-slate-200">
          <div className="border-b border-slate-200 px-6 py-4">
            <h2 className="text-lg font-bold text-slate-900">Drivers</h2>
          </div>

          {loading ? (
            <div className="p-10 text-center text-sm text-slate-500">
              Loading drivers...
            </div>
          ) : filteredDrivers.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">
              No drivers found.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                      Driver
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                      Contact
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                      Login Access
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                      Truck
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                      Workload
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
                  {filteredDrivers.map((driver) => {
                    const totalOrders = driverStats.totalOrdersByDriver[driver.id] || 0
                    const activeOrders = driverStats.activeOrdersByDriver[driver.id] || 0
                    const completedOrders =
                      driverStats.completedOrdersByDriver[driver.id] || 0
                    const badgeClass =
                      driverStatusClasses[driver.status || 'available'] ||
                      driverStatusClasses.available
                    const truck = trucks.find((item) => item.id === driver.truck_id)
                    const isLinked = !!driver.auth_user_id

                    return (
                      <tr key={driver.id} className="hover:bg-slate-50/80">
                        <td className="px-4 py-4 align-top">
                          <div className="font-semibold text-slate-900">
                            {driver.name || 'Unnamed Driver'}
                          </div>
                          <div className="mt-1 text-xs text-slate-500">
                            Driver ID: #{driver.id.slice(0, 8)}
                          </div>
                        </td>

                        <td className="px-4 py-4 align-top text-sm text-slate-700">
                          <div>{driver.phone || '—'}</div>
                          <div className="mt-1 text-slate-500">{driver.email || '—'}</div>
                        </td>

                        <td className="px-4 py-4 align-top text-sm text-slate-700">
                          <div className="flex flex-col gap-2">
                            <span
                              className={`inline-flex w-fit rounded-full border px-2.5 py-1 text-xs font-semibold ${
                                isLinked
                                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                  : 'border-amber-200 bg-amber-50 text-amber-700'
                              }`}
                            >
                              {isLinked ? 'Linked' : 'Not linked'}
                            </span>

                            <div className="text-xs text-slate-500">
                              Auth ID: {shortId(driver.auth_user_id)}
                            </div>

                            <div className="text-xs text-slate-500">
                              Last Login: {formatDateTime(driver.last_login_at)}
                            </div>
                          </div>
                        </td>

                        <td className="px-4 py-4 align-top text-sm text-slate-700">
                          {truck ? (
                            <>
                              <div className="font-medium text-slate-900">
                                Truck {truck.truck_number}
                              </div>
                              <div className="mt-1 text-slate-500">
                                Plate: {truck.plate_number || '—'}
                              </div>
                            </>
                          ) : (
                            <span className="text-slate-500">No truck assigned</span>
                          )}
                        </td>

                        <td className="px-4 py-4 align-top text-sm text-slate-700">
                          <div>Total Orders: {totalOrders}</div>
                          <div className="mt-1 text-slate-500">Active: {activeOrders}</div>
                          <div className="mt-1 text-slate-500">
                            Completed: {completedOrders}
                          </div>
                        </td>

                        <td className="px-4 py-4 align-top">
                          <div className="flex flex-col gap-2">
                            <span
                              className={`inline-flex w-fit rounded-full border px-2.5 py-1 text-xs font-semibold ${badgeClass}`}
                            >
                              {formatStatus(driver.status || 'available')}
                            </span>

                            <select
                              value={driver.status || 'available'}
                              onChange={(e) => handleQuickStatus(driver, e.target.value)}
                              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-slate-400"
                            >
                              {DRIVER_STATUSES.map((status) => (
                                <option key={status} value={status}>
                                  {formatStatus(status)}
                                </option>
                              ))}
                            </select>
                          </div>
                        </td>

                        <td className="px-4 py-4 align-top text-sm text-slate-700">
                          {formatDate(driver.created_at)}
                        </td>

                        <td className="px-4 py-4 align-top">
                          <div className="flex justify-end gap-2 flex-wrap">
                            <Link
                              href="/driver"
                              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                            >
                              Driver App
                            </Link>

                            {isLinked ? (
                              <button
                                onClick={() => handleResetLink(driver)}
                                disabled={resettingLinkId === driver.id}
                                className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-100 disabled:opacity-50"
                              >
                                {resettingLinkId === driver.id ? 'Resetting...' : 'Reset Link'}
                              </button>
                            ) : null}

                            <button
                              onClick={() => openEditDriverModal(driver)}
                              className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition hover:opacity-90"
                            >
                              Edit
                            </button>

                            <button
                              onClick={() => handleDeleteDriver(driver.id)}
                              disabled={deletingId === driver.id}
                              className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                            >
                              {deletingId === driver.id ? 'Deleting...' : 'Delete'}
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

        <div className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-slate-200">
          <div className="border-b border-slate-200 px-6 py-4">
            <h2 className="text-lg font-bold text-slate-900">Truck Inventory</h2>
          </div>

          {loading ? (
            <div className="p-10 text-center text-sm text-slate-500">
              Loading trucks...
            </div>
          ) : trucks.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">
              No trucks found.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                      Truck
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                      Plate
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                      Assigned Driver
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
                  {trucks.map((truck) => {
                    const assignedDrivers = truckUsageByDriver[truck.id] || []
                    const truckBadgeClass =
                      truckStatusClasses[truck.status || 'available'] ||
                      truckStatusClasses.available

                    return (
                      <tr key={truck.id} className="hover:bg-slate-50/80">
                        <td className="px-4 py-4 align-top text-sm font-semibold text-slate-900">
                          {truck.truck_number || '—'}
                        </td>
                        <td className="px-4 py-4 align-top text-sm text-slate-700">
                          {truck.plate_number || '—'}
                        </td>
                        <td className="px-4 py-4 align-top text-sm text-slate-700">
                          {assignedDrivers.length > 0
                            ? assignedDrivers.map((driver) => driver.name || 'Unnamed Driver').join(', ')
                            : '—'}
                        </td>
                        <td className="px-4 py-4 align-top">
                          <span
                            className={`inline-flex w-fit rounded-full border px-2.5 py-1 text-xs font-semibold ${truckBadgeClass}`}
                          >
                            {formatStatus(truck.status || 'available')}
                          </span>
                        </td>
                        <td className="px-4 py-4 align-top">
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => openEditTruckModal(truck)}
                              className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition hover:opacity-90"
                            >
                              Edit
                            </button>

                            <button
                              onClick={() => handleDeleteTruck(truck.id)}
                              disabled={deletingTruckId === truck.id}
                              className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                            >
                              {deletingTruckId === truck.id ? 'Deleting...' : 'Delete'}
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

        <div className="mt-8 flex justify-center">
          <Link
            href="/dashboard"
            className="rounded-2xl border border-slate-300 bg-white px-6 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            Back to Dashboard
          </Link>
        </div>
      </div>

      {showDriverModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-2xl rounded-3xl bg-white p-6 shadow-2xl">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-slate-900">
                  {editingDriver ? 'Edit Driver' : 'Create Driver'}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Add or update driver details and align a truck
                </p>
              </div>

              <button
                onClick={closeDriverModal}
                className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200"
              >
                Close
              </button>
            </div>

            <div className="grid gap-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Name
                </label>
                <input
                  value={driverForm.name}
                  onChange={(e) =>
                    setDriverForm((prev) => ({ ...prev, name: e.target.value }))
                  }
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-slate-400"
                  placeholder="Driver name"
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Email
                  </label>
                  <input
                    value={driverForm.email}
                    onChange={(e) =>
                      setDriverForm((prev) => ({ ...prev, email: e.target.value }))
                    }
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-slate-400"
                    placeholder="Email address"
                  />
                  <p className="mt-2 text-xs text-slate-500">
                    Use the same email created in Supabase Auth for automatic driver login linking.
                  </p>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Phone
                  </label>
                  <input
                    value={driverForm.phone}
                    onChange={(e) =>
                      setDriverForm((prev) => ({ ...prev, phone: e.target.value }))
                    }
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-slate-400"
                    placeholder="Phone number"
                  />
                </div>
              </div>

              {editingDriver ? (
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Auth User ID
                    </div>
                    <div className="mt-2 text-sm text-slate-900">
                      {editingDriver.auth_user_id || 'Not linked yet'}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Last Login
                    </div>
                    <div className="mt-2 text-sm text-slate-900">
                      {formatDateTime(editingDriver.last_login_at)}
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Status
                  </label>
                  <select
                    value={driverForm.status}
                    onChange={(e) =>
                      setDriverForm((prev) => ({ ...prev, status: e.target.value }))
                    }
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-slate-400"
                  >
                    {DRIVER_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {formatStatus(status)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Truck
                  </label>
                  <select
                    value={driverForm.truck_id}
                    onChange={(e) =>
                      setDriverForm((prev) => ({ ...prev, truck_id: e.target.value }))
                    }
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-slate-400"
                  >
                    <option value="">No truck assigned</option>
                    {availableTruckOptions.map((truck) => (
                      <option key={truck.id} value={truck.id}>
                        {truck.truck_number} {truck.plate_number ? `• ${truck.plate_number}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={closeDriverModal}
                className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>

              <button
                onClick={handleCreateOrUpdateDriver}
                disabled={savingDriver}
                className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
              >
                {savingDriver
                  ? 'Saving...'
                  : editingDriver
                    ? 'Save Changes'
                    : 'Create Driver'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showTruckModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-2xl rounded-3xl bg-white p-6 shadow-2xl">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-slate-900">
                  {editingTruck ? 'Edit Truck' : 'Create Truck'}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Add and manage truck inventory for dispatch
                </p>
              </div>

              <button
                onClick={closeTruckModal}
                className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200"
              >
                Close
              </button>
            </div>

            <div className="grid gap-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Truck Number
                </label>
                <input
                  value={truckForm.truck_number}
                  onChange={(e) =>
                    setTruckForm((prev) => ({ ...prev, truck_number: e.target.value }))
                  }
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-slate-400"
                  placeholder="Truck number"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Plate Number
                </label>
                <input
                  value={truckForm.plate_number}
                  onChange={(e) =>
                    setTruckForm((prev) => ({ ...prev, plate_number: e.target.value }))
                  }
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-slate-400"
                  placeholder="Plate number"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Status
                </label>
                <select
                  value={truckForm.status}
                  onChange={(e) =>
                    setTruckForm((prev) => ({ ...prev, status: e.target.value }))
                  }
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-slate-400"
                >
                  {TRUCK_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {formatStatus(status)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={closeTruckModal}
                className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>

              <button
                onClick={handleCreateOrUpdateTruck}
                disabled={savingTruck}
                className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
              >
                {savingTruck
                  ? 'Saving...'
                  : editingTruck
                    ? 'Save Changes'
                    : 'Create Truck'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}