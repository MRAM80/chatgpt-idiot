'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Driver = {
  id: string
  name: string | null
  phone?: string | null
  status?: string | null
}

type Job = {
  id: string
  customer_name: string | null
  pickup_address: string | null
  bin_type: string | null
  scheduled_date: string | null
  driver_id: string | null
  status: string | null
  notes: string | null
  created_at?: string | null
  updated_at?: string | null
}

const BOARD_COLUMNS = [
  { key: 'unassigned', label: 'Unassigned' },
  { key: 'assigned', label: 'Assigned' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'completed', label: 'Completed' },
] as const

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

export default function DispatchBoardPage() {
  const supabase = createClient()

  const [jobs, setJobs] = useState<Job[]>([])
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [loading, setLoading] = useState(true)
  const [draggingJobId, setDraggingJobId] = useState<string | null>(null)
  const [selectedJob, setSelectedJob] = useState<Job | null>(null)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [driverFilter, setDriverFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [form, setForm] = useState({
    customer_name: '',
    pickup_address: '',
    bin_type: '',
    scheduled_date: '',
    driver_id: '',
    status: 'unassigned',
    notes: '',
  })

  async function loadDrivers() {
    const { data } = await supabase
      .from('drivers')
      .select('id,name,phone,status')
      .order('name', { ascending: true })

    setDrivers((data as Driver[]) || [])
  }

  async function loadJobs() {
    setLoading(true)

    const { data } = await supabase
      .from('jobs')
      .select(
        'id,customer_name,pickup_address,bin_type,scheduled_date,driver_id,status,notes,created_at,updated_at'
      )
      .order('scheduled_date', { ascending: true })

    setJobs((data as Job[]) || [])
    setLoading(false)
  }

  async function refreshAll() {
    await Promise.all([loadDrivers(), loadJobs()])
  }

  useEffect(() => {
    refreshAll()

    const channel = supabase
      .channel('dispatch-board-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'jobs' },
        async () => {
          await loadJobs()
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
  }, [])

  const driverMap = useMemo(() => {
    return drivers.reduce<Record<string, Driver>>((acc, driver) => {
      acc[driver.id] = driver
      return acc
    }, {})
  }, [drivers])

  const filteredJobs = useMemo(() => {
    return jobs.filter((job) => {
      const q = search.trim().toLowerCase()
      const matchesSearch =
        !q ||
        (job.customer_name || '').toLowerCase().includes(q) ||
        (job.pickup_address || '').toLowerCase().includes(q) ||
        (job.bin_type || '').toLowerCase().includes(q) ||
        (driverMap[job.driver_id || '']?.name || '').toLowerCase().includes(q)

      const matchesDriver =
        driverFilter === 'all' || (job.driver_id || '') === driverFilter

      const normalizedStatus = job.status || 'unassigned'
      const matchesStatus =
        statusFilter === 'all' || normalizedStatus === statusFilter

      return matchesSearch && matchesDriver && matchesStatus
    })
  }, [jobs, search, driverFilter, statusFilter, driverMap])

  const groupedJobs = useMemo(() => {
    return BOARD_COLUMNS.reduce<Record<string, Job[]>>((acc, column) => {
      acc[column.key] = filteredJobs.filter(
        (job) => (job.status || 'unassigned') === column.key
      )
      return acc
    }, {})
  }, [filteredJobs])

  function openEditModal(job: Job) {
    setSelectedJob(job)
    setForm({
      customer_name: job.customer_name || '',
      pickup_address: job.pickup_address || '',
      bin_type: job.bin_type || '',
      scheduled_date: job.scheduled_date
        ? new Date(job.scheduled_date).toISOString().slice(0, 10)
        : '',
      driver_id: job.driver_id || '',
      status: job.status || 'unassigned',
      notes: job.notes || '',
    })
  }

  function closeEditModal() {
    setSelectedJob(null)
  }

  async function updateJob(id: string, values: Partial<Job>) {
    await supabase.from('jobs').update(values).eq('id', id)
    setJobs((current) =>
      current.map((job) => (job.id === id ? { ...job, ...values } : job))
    )
  }

  async function handleDrop(newStatus: string) {
    if (!draggingJobId) return
    await updateJob(draggingJobId, { status: newStatus })
    setDraggingJobId(null)
  }

  async function handleQuickAssign(jobId: string, driverId: string) {
    await updateJob(jobId, {
      driver_id: driverId || null,
      status: driverId ? 'assigned' : 'unassigned',
    })
  }

  async function handleSave() {
    if (!selectedJob) return
    setSaving(true)

    await updateJob(selectedJob.id, {
      customer_name: form.customer_name || null,
      pickup_address: form.pickup_address || null,
      bin_type: form.bin_type || null,
      scheduled_date: form.scheduled_date || null,
      driver_id: form.driver_id || null,
      status: form.status || 'unassigned',
      notes: form.notes || null,
    })

    setSaving(false)
    closeEditModal()
  }

  const stats = useMemo(() => {
    const total = jobs.length
    const unassigned = jobs.filter((job) => (job.status || 'unassigned') === 'unassigned').length
    const assigned = jobs.filter((job) => job.status === 'assigned').length
    const inProgress = jobs.filter((job) => job.status === 'in_progress').length
    const completed = jobs.filter((job) => job.status === 'completed').length

    return { total, unassigned, assigned, inProgress, completed }
  }, [jobs])

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
                Manage assignments, move jobs by status, and update work in real time
              </p>
            </div>

            <button
              onClick={refreshAll}
              className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
            >
              Refresh
            </button>
          </div>

          <div className="grid gap-4 md:grid-cols-5">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Total Jobs
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
              placeholder="Search customer, address, bin, or driver"
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
          <div className="grid gap-4 xl:grid-cols-4">
            {BOARD_COLUMNS.map((column) => (
              <div
                key={column.key}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => handleDrop(column.key)}
                className="min-h-[500px] rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-200"
              >
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">
                    {column.label}
                  </h2>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                    {groupedJobs[column.key]?.length || 0}
                  </span>
                </div>

                <div className="space-y-3">
                  {(groupedJobs[column.key] || []).map((job) => {
                    const assignedDriver = job.driver_id ? driverMap[job.driver_id] : null
                    const badgeClass = statusStyles[job.status || 'unassigned'] || statusStyles.unassigned

                    return (
                      <div
                        key={job.id}
                        draggable
                        onDragStart={() => setDraggingJobId(job.id)}
                        className="cursor-grab rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                      >
                        <div className="mb-3 flex items-start justify-between gap-2">
                          <div>
                            <div className="text-sm font-semibold text-slate-900">
                              {job.customer_name || 'No customer'}
                            </div>
                            <div className="mt-1 text-xs text-slate-500">
                              #{job.id.slice(0, 8)}
                            </div>
                          </div>

                          <span
                            className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${badgeClass}`}
                          >
                            {formatStatus(job.status || 'unassigned')}
                          </span>
                        </div>

                        <div className="space-y-2 text-sm text-slate-600">
                          <div>
                            <span className="font-medium text-slate-800">Address:</span>{' '}
                            {job.pickup_address || 'Not set'}
                          </div>
                          <div>
                            <span className="font-medium text-slate-800">Bin:</span>{' '}
                            {job.bin_type || 'Not set'}
                          </div>
                          <div>
                            <span className="font-medium text-slate-800">Date:</span>{' '}
                            {formatDate(job.scheduled_date)}
                          </div>
                          <div>
                            <span className="font-medium text-slate-800">Driver:</span>{' '}
                            {assignedDriver?.name || 'Unassigned'}
                          </div>
                        </div>

                        <div className="mt-4">
                          <select
                            value={job.driver_id || ''}
                            onChange={(e) => handleQuickAssign(job.id, e.target.value)}
                            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 outline-none focus:border-slate-400"
                          >
                            <option value="">Assign driver</option>
                            {drivers.map((driver) => (
                              <option key={driver.id} value={driver.id}>
                                {driver.name || 'Unnamed Driver'}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="mt-3 flex gap-2">
                          <button
                            onClick={() => openEditModal(job)}
                            className="flex-1 rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition hover:opacity-90"
                          >
                            Edit
                          </button>

                          <select
                            value={job.status || 'unassigned'}
                            onChange={(e) =>
                              updateJob(job.id, { status: e.target.value })
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

                  {(!groupedJobs[column.key] || groupedJobs[column.key].length === 0) && (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-400">
                      No jobs here
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {selectedJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-2xl rounded-3xl bg-white p-6 shadow-2xl">
            <div className="mb-6 flex items-start justify-between">
              <div>
                <h3 className="text-xl font-bold text-slate-900">Edit Job</h3>
                <p className="text-sm text-slate-500">
                  Update dispatch details directly from the board
                </p>
              </div>

              <button
                onClick={closeEditModal}
                className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200"
              >
                Close
              </button>
            </div>

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
                  {drivers.map((driver) => (
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