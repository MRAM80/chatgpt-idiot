'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

type Job = {
  id: string
  customer_name: string | null
  pickup_address: string | null
  bin_type: string | null
  driver_id: string | null
  scheduled_date: string | null
  status: string | null
  created_at: string | null
}

type Driver = {
  id: string
  name: string | null
  status: string | null
}

type Bin = {
  id: string
  bin_number: string | null
  bin_type: string | null
  status: string | null
}

type Customer = {
  id: string
  name: string | null
}

const statusClasses: Record<string, string> = {
  unassigned: 'bg-slate-100 text-slate-700 border-slate-200',
  assigned: 'bg-blue-100 text-blue-700 border-blue-200',
  in_progress: 'bg-amber-100 text-amber-700 border-amber-200',
  completed: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  issue: 'bg-rose-100 text-rose-700 border-rose-200',
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

function isToday(date: string | null) {
  if (!date) return false
  const value = new Date(date)
  const today = new Date()

  return (
    value.getFullYear() === today.getFullYear() &&
    value.getMonth() === today.getMonth() &&
    value.getDate() === today.getDate()
  )
}

export default function DashboardPage() {
  const supabase = createClient()

  const [jobs, setJobs] = useState<Job[]>([])
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [bins, setBins] = useState<Bin[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)

  async function loadDashboard() {
    setLoading(true)

    const [jobsRes, driversRes, binsRes, customersRes] = await Promise.all([
      supabase
        .from('jobs')
        .select(
          'id,customer_name,pickup_address,bin_type,driver_id,scheduled_date,status,created_at'
        )
        .order('created_at', { ascending: false }),
      supabase.from('drivers').select('id,name,status').order('name', { ascending: true }),
      supabase
        .from('bins')
        .select('id,bin_number,bin_type,status')
        .order('created_at', { ascending: false }),
      supabase
        .from('customers')
        .select('id,name')
        .order('created_at', { ascending: false }),
    ])

    setJobs((jobsRes.data as Job[]) || [])
    setDrivers((driversRes.data as Driver[]) || [])
    setBins((binsRes.data as Bin[]) || [])
    setCustomers((customersRes.data as Customer[]) || [])
    setLoading(false)
  }

  useEffect(() => {
    loadDashboard()

    const channel = supabase
      .channel('dashboard-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'jobs' },
        async () => {
          await loadDashboard()
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'drivers' },
        async () => {
          await loadDashboard()
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bins' },
        async () => {
          await loadDashboard()
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'customers' },
        async () => {
          await loadDashboard()
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

  const metrics = useMemo(() => {
    const jobsToday = jobs.filter((job) => isToday(job.scheduled_date)).length
    const completedToday = jobs.filter(
      (job) => isToday(job.scheduled_date) && job.status === 'completed'
    ).length
    const activeDrivers = drivers.filter(
      (driver) => driver.status === 'available' || driver.status === 'busy'
    ).length
    const pendingPickups = jobs.filter(
      (job) =>
        (job.status || 'unassigned') === 'unassigned' ||
        job.status === 'assigned' ||
        job.status === 'in_progress'
    ).length

    return {
      jobsToday,
      completedToday,
      activeDrivers,
      pendingPickups,
      totalCustomers: customers.length,
      totalBins: bins.length,
    }
  }, [jobs, drivers, customers, bins])

  const recentJobs = useMemo(() => {
    return [...jobs].slice(0, 8)
  }, [jobs])

  const upcomingJobs = useMemo(() => {
    return jobs
      .filter(
        (job) =>
          (job.status || 'unassigned') !== 'completed' &&
          (job.status || 'unassigned') !== 'issue'
      )
      .sort((a, b) => {
        const aTime = a.scheduled_date ? new Date(a.scheduled_date).getTime() : 0
        const bTime = b.scheduled_date ? new Date(b.scheduled_date).getTime() : 0
        return aTime - bTime
      })
      .slice(0, 6)
  }, [jobs])

  const driverOverview = useMemo(() => {
    const assignedCounts: Record<string, number> = {}

    for (const job of jobs) {
      if (!job.driver_id) continue
      if (job.status === 'assigned' || job.status === 'in_progress') {
        assignedCounts[job.driver_id] = (assignedCounts[job.driver_id] || 0) + 1
      }
    }

    return drivers.slice(0, 6).map((driver) => ({
      ...driver,
      activeJobs: assignedCounts[driver.id] || 0,
    }))
  }, [drivers, jobs])

  const binOverview = useMemo(() => {
    const available = bins.filter((bin) => (bin.status || 'available') === 'available').length
    const inUse = bins.filter((bin) => bin.status === 'in_use').length
    const maintenance = bins.filter((bin) => bin.status === 'maintenance').length

    return { available, inUse, maintenance }
  }, [bins])

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="mx-auto max-w-7xl p-4 md:p-6">
        <div className="mb-6 rounded-3xl bg-gradient-to-r from-slate-900 to-slate-800 p-6 text-white shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">SIMPLIITRASH Dashboard</h1>
              <p className="mt-2 text-sm text-slate-300">
                Professional operations overview for dispatch, jobs, drivers, bins, and customers
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/dispatch"
                className="rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-100"
              >
                Open Dispatch Board
              </Link>
              <button
                onClick={loadDashboard}
                className="rounded-2xl border border-slate-600 bg-slate-800 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-700"
              >
                Refresh
              </button>
            </div>
          </div>
        </div>

        <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Jobs Today
            </div>
            <div className="mt-3 text-3xl font-bold text-slate-900">{metrics.jobsToday}</div>
            <div className="mt-2 text-sm text-slate-500">Scheduled for today</div>
          </div>

          <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Completed Today
            </div>
            <div className="mt-3 text-3xl font-bold text-emerald-600">
              {metrics.completedToday}
            </div>
            <div className="mt-2 text-sm text-slate-500">Finished successfully</div>
          </div>

          <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Active Drivers
            </div>
            <div className="mt-3 text-3xl font-bold text-blue-600">
              {metrics.activeDrivers}
            </div>
            <div className="mt-2 text-sm text-slate-500">Available or busy</div>
          </div>

          <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Pending Pickups
            </div>
            <div className="mt-3 text-3xl font-bold text-amber-600">
              {metrics.pendingPickups}
            </div>
            <div className="mt-2 text-sm text-slate-500">Open operational workload</div>
          </div>
        </div>

        <div className="mb-6 grid gap-4 md:grid-cols-3">
          <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Customers
                </div>
                <div className="mt-2 text-2xl font-bold text-slate-900">
                  {metrics.totalCustomers}
                </div>
              </div>
              <Link
                href="/customers"
                className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:opacity-90"
              >
                View
              </Link>
            </div>
          </div>

          <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Total Bins
                </div>
                <div className="mt-2 text-2xl font-bold text-slate-900">
                  {metrics.totalBins}
                </div>
              </div>
              <Link
                href="/bins"
                className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:opacity-90"
              >
                View
              </Link>
            </div>
          </div>

          <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Drivers
                </div>
                <div className="mt-2 text-2xl font-bold text-slate-900">
                  {drivers.length}
                </div>
              </div>
              <Link
                href="/drivers"
                className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:opacity-90"
              >
                View
              </Link>
            </div>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-3">
          <div className="xl:col-span-2 rounded-3xl bg-white shadow-sm ring-1 ring-slate-200">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Recent Jobs</h2>
                <p className="text-sm text-slate-500">Latest activity across your operation</p>
              </div>
              <Link
                href="/jobs"
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                View All
              </Link>
            </div>

            {loading ? (
              <div className="p-10 text-center text-sm text-slate-500">Loading dashboard...</div>
            ) : recentJobs.length === 0 ? (
              <div className="p-10 text-center text-sm text-slate-500">No jobs found.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                        Customer
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                        Address
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                        Driver
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                        Date
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {recentJobs.map((job) => {
                      const badgeClass =
                        statusClasses[job.status || 'unassigned'] || statusClasses.unassigned

                      return (
                        <tr key={job.id} className="hover:bg-slate-50/80">
                          <td className="px-6 py-4">
                            <div className="font-semibold text-slate-900">
                              {job.customer_name || 'No customer'}
                            </div>
                            <div className="mt-1 text-xs text-slate-500">
                              {job.bin_type || 'No bin type'}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-700">
                            {job.pickup_address || '—'}
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-700">
                            {job.driver_id ? driverMap[job.driver_id]?.name || 'Assigned' : 'Unassigned'}
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-700">
                            {formatDate(job.scheduled_date)}
                          </td>
                          <td className="px-6 py-4">
                            <span
                              className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${badgeClass}`}
                            >
                              {formatStatus(job.status || 'unassigned')}
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

          <div className="space-y-6">
            <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Upcoming Jobs</h2>
                  <p className="text-sm text-slate-500">Next jobs to monitor</p>
                </div>
                <Link
                  href="/dispatch"
                  className="text-sm font-semibold text-slate-700 hover:text-slate-900"
                >
                  Open
                </Link>
              </div>

              <div className="space-y-3">
                {upcomingJobs.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                    No upcoming jobs.
                  </div>
                ) : (
                  upcomingJobs.map((job) => {
                    const badgeClass =
                      statusClasses[job.status || 'unassigned'] || statusClasses.unassigned

                    return (
                      <div
                        key={job.id}
                        className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="font-semibold text-slate-900">
                              {job.customer_name || 'No customer'}
                            </div>
                            <div className="mt-1 text-sm text-slate-500">
                              {job.pickup_address || 'No address'}
                            </div>
                          </div>
                          <span
                            className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${badgeClass}`}
                          >
                            {formatStatus(job.status || 'unassigned')}
                          </span>
                        </div>
                        <div className="mt-3 text-sm text-slate-600">
                          {formatDate(job.scheduled_date)}
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>

            <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
              <h2 className="text-lg font-bold text-slate-900">Driver Overview</h2>
              <p className="mt-1 text-sm text-slate-500">Quick live availability snapshot</p>

              <div className="mt-4 space-y-3">
                {driverOverview.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                    No drivers found.
                  </div>
                ) : (
                  driverOverview.map((driver) => {
                    const badgeClass =
                      driver.status === 'busy'
                        ? 'bg-amber-100 text-amber-700 border-amber-200'
                        : driver.status === 'offline'
                        ? 'bg-slate-100 text-slate-700 border-slate-200'
                        : 'bg-emerald-100 text-emerald-700 border-emerald-200'

                    return (
                      <div
                        key={driver.id}
                        className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 p-4"
                      >
                        <div>
                          <div className="font-semibold text-slate-900">
                            {driver.name || 'Unnamed Driver'}
                          </div>
                          <div className="mt-1 text-sm text-slate-500">
                            Active jobs: {driver.activeJobs}
                          </div>
                        </div>
                        <span
                          className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${badgeClass}`}
                        >
                          {formatStatus(driver.status || 'available')}
                        </span>
                      </div>
                    )
                  })
                )}
              </div>
            </div>

            <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
              <h2 className="text-lg font-bold text-slate-900">Bin Overview</h2>
              <p className="mt-1 text-sm text-slate-500">Inventory health at a glance</p>

              <div className="mt-4 grid gap-3">
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                    Available
                  </div>
                  <div className="mt-2 text-2xl font-bold text-emerald-900">
                    {binOverview.available}
                  </div>
                </div>

                <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-blue-700">
                    In Use
                  </div>
                  <div className="mt-2 text-2xl font-bold text-blue-900">
                    {binOverview.inUse}
                  </div>
                </div>

                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                    Maintenance
                  </div>
                  <div className="mt-2 text-2xl font-bold text-amber-900">
                    {binOverview.maintenance}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-4">
          <Link
            href="/jobs"
            className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200 transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <div className="text-lg font-bold text-slate-900">Jobs</div>
            <div className="mt-2 text-sm text-slate-500">
              Create, edit, filter, and manage all operational jobs
            </div>
          </Link>

          <Link
            href="/drivers"
            className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200 transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <div className="text-lg font-bold text-slate-900">Drivers</div>
            <div className="mt-2 text-sm text-slate-500">
              Track driver availability, workload, and contact details
            </div>
          </Link>

          <Link
            href="/bins"
            className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200 transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <div className="text-lg font-bold text-slate-900">Bins</div>
            <div className="mt-2 text-sm text-slate-500">
              Manage inventory, status, and assigned customer locations
            </div>
          </Link>

          <Link
            href="/customers"
            className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200 transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <div className="text-lg font-bold text-slate-900">Customers</div>
            <div className="mt-2 text-sm text-slate-500">
              Keep organized customer records connected to your jobs
            </div>
          </Link>
        </div>
      </div>
    </div>
  )
}