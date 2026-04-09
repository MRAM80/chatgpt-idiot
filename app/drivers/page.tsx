'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Driver = {
  id: string
  name: string | null
  email: string | null
  phone: string | null
  status: string | null
  created_at: string | null
}

type Job = {
  id: string
  driver_id: string | null
  customer_name: string | null
  pickup_address: string | null
  status: string | null
  scheduled_date: string | null
}

const DRIVER_STATUSES = ['available', 'busy', 'offline'] as const

const statusClasses: Record<string, string> = {
  available: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  busy: 'bg-amber-100 text-amber-700 border-amber-200',
  offline: 'bg-slate-100 text-slate-700 border-slate-200',
}

function formatStatus(status: string | null | undefined) {
  if (!status) return 'Available'
  return status.charAt(0).toUpperCase() + status.slice(1)
}

function formatDate(date: string | null) {
  if (!date) return '—'
  const parsed = new Date(date)
  if (Number.isNaN(parsed.getTime())) return date
  return parsed.toLocaleDateString()
}

export default function DriversPage() {
  const supabase = createClient()

  const [drivers, setDrivers] = useState<Driver[]>([])
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingDriver, setEditingDriver] = useState<Driver | null>(null)

  const emptyForm = {
    name: '',
    email: '',
    phone: '',
    status: 'available',
  }

  const [form, setForm] = useState(emptyForm)

  async function loadDrivers() {
    const { data, error } = await supabase
      .from('drivers')
      .select('id,name,email,phone,status,created_at')
      .order('created_at', { ascending: false })

    if (!error) {
      setDrivers((data as Driver[]) || [])
    }
  }

  async function loadJobs() {
    const { data, error } = await supabase
      .from('jobs')
      .select('id,driver_id,customer_name,pickup_address,status,scheduled_date')

    if (!error) {
      setJobs((data as Job[]) || [])
    }
  }

  async function refreshAll() {
    setLoading(true)
    await Promise.all([loadDrivers(), loadJobs()])
    setLoading(false)
  }

  async function syncDriverStatusFromJobs(driverId: string) {
    const activeStatuses = ['assigned', 'in_progress']
    const relatedJobs = jobs.filter((job) => job.driver_id === driverId)
    const hasActiveJobs = relatedJobs.some((job) =>
      activeStatuses.includes(job.status || '')
    )

    const driver = drivers.find((item) => item.id === driverId)
    if (!driver) return

    const nextStatus =
      driver.status === 'offline' ? 'offline' : hasActiveJobs ? 'busy' : 'available'

    await supabase.from('drivers').update({ status: nextStatus }).eq('id', driverId)
  }

  useEffect(() => {
    refreshAll()

    const channel = supabase
      .channel('drivers-page-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'drivers' },
        async () => {
          await loadDrivers()
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'jobs' },
        async () => {
          await loadJobs()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  const driverStats = useMemo(() => {
    const totalJobsByDriver: Record<string, number> = {}
    const activeJobsByDriver: Record<string, number> = {}
    const completedJobsByDriver: Record<string, number> = {}

    for (const job of jobs) {
      if (!job.driver_id) continue

      totalJobsByDriver[job.driver_id] = (totalJobsByDriver[job.driver_id] || 0) + 1

      if (job.status === 'assigned' || job.status === 'in_progress') {
        activeJobsByDriver[job.driver_id] = (activeJobsByDriver[job.driver_id] || 0) + 1
      }

      if (job.status === 'completed') {
        completedJobsByDriver[job.driver_id] =
          (completedJobsByDriver[job.driver_id] || 0) + 1
      }
    }

    return { totalJobsByDriver, activeJobsByDriver, completedJobsByDriver }
  }, [jobs])

  const dashboardCounts = useMemo(() => {
    return {
      total: drivers.length,
      available: drivers.filter((driver) => driver.status === 'available').length,
      busy: drivers.filter((driver) => driver.status === 'busy').length,
      offline: drivers.filter((driver) => driver.status === 'offline').length,
    }
  }, [drivers])

  const filteredDrivers = useMemo(() => {
    const query = search.trim().toLowerCase()

    return drivers.filter((driver) => {
      const matchesSearch =
        !query ||
        (driver.name || '').toLowerCase().includes(query) ||
        (driver.email || '').toLowerCase().includes(query) ||
        (driver.phone || '').toLowerCase().includes(query)

      const matchesStatus =
        statusFilter === 'all' || (driver.status || 'available') === statusFilter

      return matchesSearch && matchesStatus
    })
  }, [drivers, search, statusFilter])

  function openCreateModal() {
    setEditingDriver(null)
    setForm(emptyForm)
    setShowCreateModal(true)
  }

  function openEditModal(driver: Driver) {
    setEditingDriver(driver)
    setShowCreateModal(false)
    setForm({
      name: driver.name || '',
      email: driver.email || '',
      phone: driver.phone || '',
      status: driver.status || 'available',
    })
  }

  function closeModal() {
    setEditingDriver(null)
    setShowCreateModal(false)
    setForm(emptyForm)
  }

  async function handleCreateOrUpdate() {
    setSaving(true)

    const payload = {
      name: form.name || null,
      email: form.email || null,
      phone: form.phone || null,
      status: form.status || 'available',
    }

    if (editingDriver) {
      const { error } = await supabase
        .from('drivers')
        .update(payload)
        .eq('id', editingDriver.id)

      if (!error) {
        await refreshAll()
        closeModal()
      }
    } else {
      const { error } = await supabase.from('drivers').insert([payload])

      if (!error) {
        await refreshAll()
        closeModal()
      }
    }

    setSaving(false)
  }

  async function handleDelete(driverId: string) {
    const relatedActiveJobs = jobs.filter(
      (job) =>
        job.driver_id === driverId &&
        (job.status === 'assigned' || job.status === 'in_progress')
    )

    if (relatedActiveJobs.length > 0) {
      window.alert(
        'This driver has active jobs assigned. Reassign or complete those jobs first.'
      )
      return
    }

    const confirmed = window.confirm('Delete this driver?')
    if (!confirmed) return

    setDeletingId(driverId)

    const { error } = await supabase.from('drivers').delete().eq('id', driverId)

    if (!error) {
      await refreshAll()
    }

    setDeletingId(null)
  }

  async function handleQuickStatus(driver: Driver, value: string) {
    const activeJobs = driverStats.activeJobsByDriver[driver.id] || 0

    if (value === 'available' && activeJobs > 0) {
      window.alert('This driver still has active jobs. Keep as busy or reassign the jobs first.')
      return
    }

    const { error } = await supabase
      .from('drivers')
      .update({ status: value })
      .eq('id', driver.id)

    if (!error) {
      await refreshAll()
    }
  }

  async function handleRecalculateStatuses() {
    setLoading(true)

    const onlineDrivers = drivers.filter((driver) => driver.status !== 'offline')
    for (const driver of onlineDrivers) {
      await syncDriverStatusFromJobs(driver.id)
    }

    await refreshAll()
    setLoading(false)
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
                Manage driver records, availability, and workload from one place
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
                onClick={handleRecalculateStatuses}
                className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-700 hover:bg-blue-100"
              >
                Sync Statuses
              </button>
              <button
                onClick={openCreateModal}
                className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90"
              >
                New Driver
              </button>
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Total Drivers
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

            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                Busy
              </div>
              <div className="mt-2 text-2xl font-bold text-amber-900">
                {dashboardCounts.busy}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-300 bg-slate-100 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                Offline
              </div>
              <div className="mt-2 text-2xl font-bold text-slate-900">
                {dashboardCounts.offline}
              </div>
            </div>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search driver name, email, or phone"
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

        <div className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-slate-200">
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
                    const totalJobs = driverStats.totalJobsByDriver[driver.id] || 0
                    const activeJobs = driverStats.activeJobsByDriver[driver.id] || 0
                    const completedJobs = driverStats.completedJobsByDriver[driver.id] || 0
                    const badgeClass =
                      statusClasses[driver.status || 'available'] || statusClasses.available

                    return (
                      <tr key={driver.id} className="hover:bg-slate-50/80">
                        <td className="px-4 py-4 align-top">
                          <div className="font-semibold text-slate-900">
                            {driver.name || 'Unnamed Driver'}
                          </div>
                          <div className="mt-1 text-xs text-slate-500">
                            #{driver.id.slice(0, 8)}
                          </div>
                        </td>

                        <td className="px-4 py-4 align-top text-sm text-slate-700">
                          <div>{driver.phone || '—'}</div>
                          <div className="mt-1 text-slate-500">{driver.email || '—'}</div>
                        </td>

                        <td className="px-4 py-4 align-top text-sm text-slate-700">
                          <div>Total Jobs: {totalJobs}</div>
                          <div className="mt-1 text-slate-500">Active: {activeJobs}</div>
                          <div className="mt-1 text-slate-500">Completed: {completedJobs}</div>
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
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => openEditModal(driver)}
                              className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition hover:opacity-90"
                            >
                              Edit
                            </button>

                            <button
                              onClick={() => handleDelete(driver.id)}
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
      </div>

      {(showCreateModal || editingDriver) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-2xl rounded-3xl bg-white p-6 shadow-2xl">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-slate-900">
                  {editingDriver ? 'Edit Driver' : 'Create Driver'}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {editingDriver
                    ? 'Update driver details and availability'
                    : 'Add a new driver to your operations system'}
                </p>
              </div>

              <button
                onClick={closeModal}
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
                  value={form.name}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, name: e.target.value }))
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
                    value={form.email}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, email: e.target.value }))
                    }
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-slate-400"
                    placeholder="Email address"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Phone
                  </label>
                  <input
                    value={form.phone}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, phone: e.target.value }))
                    }
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-slate-400"
                    placeholder="Phone number"
                  />
                </div>
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
                  {DRIVER_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {formatStatus(status)}
                    </option>
                  ))}
                </select>
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
                {saving ? 'Saving...' : editingDriver ? 'Save Changes' : 'Create Driver'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}