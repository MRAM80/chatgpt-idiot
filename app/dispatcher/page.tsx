'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import DashboardShell from '@/components/dashboard-shell'
import { supabase } from '@/lib/supabase'

type Profile = {
  id: string
  full_name: string | null
  email: string | null
  role: string | null
}

type Job = {
  id: string
  ticket_number: string | null
  job_type: string | null
  material_type: string | null
  customer_name: string | null
  customer_address: string | null
  scheduled_date: string | null
  status: string | null
  driver_id: string | null
}

type Driver = {
  id: string
  full_name: string | null
  email: string | null
  status: string | null
}

type BoardStatus = 'pending' | 'assigned' | 'in_progress' | 'completed'

const navItems = [
  { href: '/admin', label: 'Dashboard' },
  { href: '/dispatcher', label: 'Dispatch Window' },
  { href: '/jobs', label: 'Jobs' },
  { href: '/drivers', label: 'Drivers' },
  { href: '/bins', label: 'Bins' },
]

const boardColumns: { key: BoardStatus; title: string; subtitle: string }[] = [
  { key: 'pending', title: 'Unscheduled', subtitle: 'New jobs waiting for dispatch' },
  { key: 'assigned', title: 'Assigned', subtitle: 'Ready for driver action' },
  { key: 'in_progress', title: 'In Progress', subtitle: 'Currently active in the field' },
  { key: 'completed', title: 'Completed', subtitle: 'Finished jobs' },
]

export default function DispatcherPage() {
  const router = useRouter()

  const [profile, setProfile] = useState<Profile | null>(null)
  const [jobs, setJobs] = useState<Job[]>([])
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [activeColumn, setActiveColumn] = useState<BoardStatus | null>(null)
  const [errorMessage, setErrorMessage] = useState('')
  const [search, setSearch] = useState('')
  const [dateFilter, setDateFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  useEffect(() => {
    void loadPage()
  }, [])

  async function loadPage() {
    setLoading(true)
    setErrorMessage('')

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      router.push('/login')
      return
    }

    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('id, full_name, email, role')
      .eq('id', user.id)
      .single()

    if (profileError) {
      router.push('/login')
      return
    }

    setProfile(profileData || null)

    const [jobsRes, driversRes] = await Promise.all([
      supabase
        .from('jobs')
        .select(
          'id, ticket_number, job_type, material_type, customer_name, customer_address, scheduled_date, status, driver_id'
        )
        .order('created_at', { ascending: false }),
      supabase
        .from('drivers')
        .select('id, full_name, email, status')
        .order('created_at', { ascending: false }),
    ])

    if (jobsRes.error || driversRes.error) {
      setErrorMessage(jobsRes.error?.message || driversRes.error?.message || 'Error loading dispatch data')
    }

    setJobs((jobsRes.data as Job[]) || [])
    setDrivers((driversRes.data as Driver[]) || [])
    setLoading(false)
  }

  async function updateJob(jobId: string, updates: Partial<Job>) {
    setSavingId(jobId)
    setErrorMessage('')

    const previousJobs = jobs

    setJobs((current) =>
      current.map((job) =>
        job.id === jobId
          ? {
              ...job,
              ...updates,
            }
          : job
      )
    )

    const { error } = await supabase.from('jobs').update(updates).eq('id', jobId)

    if (error) {
      setJobs(previousJobs)
      setErrorMessage(error.message)
    }

    setSavingId(null)
  }

  async function updateJobStatus(jobId: string, newStatus: BoardStatus) {
    await updateJob(jobId, { status: newStatus })
  }

  async function assignDriver(jobId: string, driverId: string) {
    const selectedDriverId = driverId || null
    const matchedDriver = drivers.find((driver) => driver.id === selectedDriverId)
    const nextStatus: BoardStatus =
      selectedDriverId && matchedDriver ? 'assigned' : 'pending'

    await updateJob(jobId, {
      driver_id: selectedDriverId,
      status: nextStatus,
    })
  }

  function onDragStart(jobId: string) {
    setDraggingId(jobId)
  }

  async function onDropColumn(status: BoardStatus) {
    if (!draggingId) return
    await updateJobStatus(draggingId, status)
    setDraggingId(null)
    setActiveColumn(null)
  }

  function formatDate(date: string | null) {
    if (!date) return 'No date'
    const parsed = new Date(date)
    if (Number.isNaN(parsed.getTime())) return date
    return parsed.toLocaleDateString()
  }

  function cardBadge(status: string | null) {
    switch ((status || '').toLowerCase()) {
      case 'completed':
        return 'bg-emerald-100 text-emerald-700'
      case 'in_progress':
        return 'bg-amber-100 text-amber-700'
      case 'assigned':
        return 'bg-blue-100 text-blue-700'
      default:
        return 'bg-slate-100 text-slate-700'
    }
  }

  const activeDrivers = useMemo(
    () => drivers.filter((driver) => driver.status === 'active').length,
    [drivers]
  )

  const availableDrivers = useMemo(
    () => drivers.filter((driver) => driver.status === 'active'),
    [drivers]
  )

  const assignedJobsCount = useMemo(
    () => jobs.filter((job) => !!job.driver_id).length,
    [jobs]
  )

  const filteredJobs = useMemo(() => {
    return jobs.filter((job) => {
      const assignedDriver = drivers.find((driver) => driver.id === job.driver_id)

      const matchesSearch =
        !search ||
        [
          job.ticket_number,
          job.job_type,
          job.material_type,
          job.customer_name,
          job.customer_address,
          assignedDriver?.full_name,
        ]
          .filter(Boolean)
          .some((value) =>
            String(value).toLowerCase().includes(search.toLowerCase())
          )

      const matchesDate = !dateFilter || job.scheduled_date === dateFilter
      const matchesStatus = statusFilter === 'all' || (job.status || 'pending') === statusFilter

      return matchesSearch && matchesDate && matchesStatus
    })
  }, [jobs, drivers, search, dateFilter, statusFilter])

  const jobsByColumn = useMemo(() => {
    return {
      pending: filteredJobs.filter((job) => (job.status || 'pending') === 'pending'),
      assigned: filteredJobs.filter((job) => job.status === 'assigned'),
      in_progress: filteredJobs.filter((job) => job.status === 'in_progress'),
      completed: filteredJobs.filter((job) => job.status === 'completed'),
    }
  }, [filteredJobs])

  return (
    <DashboardShell
      title="Dispatch Board"
      subtitle="Assign drivers and move jobs across dispatch stages"
      roleLabel={profile?.role || 'Admin'}
      userName={profile?.full_name || profile?.email || 'User'}
      navItems={navItems}
    >
      {errorMessage && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Total Jobs</p>
          <p className="mt-2 text-3xl font-bold text-slate-900">
            {loading ? '...' : jobs.length}
          </p>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Pending Dispatch</p>
          <p className="mt-2 text-3xl font-bold text-slate-900">
            {loading ? '...' : jobs.filter((job) => (job.status || 'pending') === 'pending').length}
          </p>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Active Drivers</p>
          <p className="mt-2 text-3xl font-bold text-slate-900">
            {loading ? '...' : activeDrivers}
          </p>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Assigned Jobs</p>
          <p className="mt-2 text-3xl font-bold text-slate-900">
            {loading ? '...' : assignedJobsCount}
          </p>
        </div>
      </div>

      <div className="mt-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Dispatch Control</h2>
            <p className="text-sm text-slate-500">
              Search jobs, filter the board, assign drivers, and move cards between columns.
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-3 xl:w-[760px]">
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                Search
              </label>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Ticket, customer, driver..."
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-slate-400"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                Scheduled Date
              </label>
              <input
                type="date"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-slate-400"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                Status
              </label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-slate-400"
              >
                <option value="all">All Statuses</option>
                <option value="pending">Pending</option>
                <option value="assigned">Assigned</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-4">
        {boardColumns.map((column) => {
          const items = jobsByColumn[column.key]

          return (
            <div
              key={column.key}
              onDragOver={(e) => {
                e.preventDefault()
                setActiveColumn(column.key)
              }}
              onDragLeave={() => {
                if (activeColumn === column.key) setActiveColumn(null)
              }}
              onDrop={() => void onDropColumn(column.key)}
              className={`rounded-3xl border bg-white p-4 shadow-sm transition ${
                activeColumn === column.key
                  ? 'border-slate-400 ring-2 ring-slate-200'
                  : 'border-slate-200'
              }`}
            >
              <div className="mb-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-base font-semibold text-slate-900">{column.title}</h3>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                    {items.length}
                  </span>
                </div>
                <p className="mt-1 text-sm text-slate-500">{column.subtitle}</p>
              </div>

              <div className="min-h-[420px] space-y-4">
                {items.map((job) => {
                  const assignedDriver = drivers.find((driver) => driver.id === job.driver_id)

                  return (
                    <div
                      key={job.id}
                      draggable
                      onDragStart={() => onDragStart(job.id)}
                      onDragEnd={() => {
                        setDraggingId(null)
                        setActiveColumn(null)
                      }}
                      className="cursor-grab rounded-2xl border border-slate-200 bg-slate-50 p-4 transition hover:border-slate-300 hover:bg-white active:cursor-grabbing"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                            Ticket
                          </p>
                          <p className="text-base font-semibold text-slate-900">
                            {job.ticket_number || 'No ticket'}
                          </p>
                        </div>

                        <span className={`rounded-full px-3 py-1 text-[11px] font-semibold ${cardBadge(job.status)}`}>
                          {(job.status || 'pending').replace('_', ' ')}
                        </span>
                      </div>

                      <div className="mt-4 space-y-3 text-sm">
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                            Customer
                          </p>
                          <p className="text-slate-800">{job.customer_name || 'Not provided'}</p>
                        </div>

                        <div>
                          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                            Service
                          </p>
                          <p className="text-slate-800">
                            {job.job_type || 'General job'}
                            {job.material_type ? ` • ${job.material_type}` : ''}
                          </p>
                        </div>

                        <div>
                          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                            Address
                          </p>
                          <p className="text-slate-800">{job.customer_address || 'No address'}</p>
                        </div>

                        <div>
                          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                            Driver
                          </p>
                          <p className="mb-2 text-slate-800">
                            {assignedDriver?.full_name || 'Unassigned'}
                          </p>

                          <select
                            value={job.driver_id || ''}
                            disabled={savingId === job.id}
                            onChange={(e) => void assignDriver(job.id, e.target.value)}
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 outline-none transition focus:border-slate-400"
                          >
                            <option value="">Unassigned</option>
                            {availableDrivers.map((driver) => (
                              <option key={driver.id} value={driver.id}>
                                {driver.full_name || driver.email || 'Driver'}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                              Scheduled
                            </p>
                            <p className="text-slate-800">{formatDate(job.scheduled_date)}</p>
                          </div>

                          <select
                            value={(job.status || 'pending') as BoardStatus}
                            disabled={savingId === job.id}
                            onChange={(e) =>
                              void updateJobStatus(job.id, e.target.value as BoardStatus)
                            }
                            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 outline-none transition focus:border-slate-400"
                          >
                            <option value="pending">Pending</option>
                            <option value="assigned">Assigned</option>
                            <option value="in_progress">In Progress</option>
                            <option value="completed">Completed</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  )
                })}

                {!items.length && (
                  <div className="flex min-h-[160px] items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 text-center text-sm text-slate-400">
                    No jobs in this stage
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </DashboardShell>
  )
}