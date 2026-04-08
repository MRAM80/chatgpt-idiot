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

type DriverRow = {
  id: string
  full_name: string | null
  truck_number: string | null
  status: string | null
}

type JobRow = {
  id: string
  job_number: string | null
  job_type: string | null
  scheduled_date: string | null
  service_address: string | null
  status: string | null
  priority: string | null
  notes_dispatch: string | null
  assigned_driver_id: string | null
  customers: { company_name?: string | null } | null
  bins: { bin_number?: string | null; size?: string | null } | null
}

const navItems = [
  { href: '/dispatcher', label: 'Dispatch Window' },
  { href: '/jobs', label: 'Jobs' },
  { href: '/loads', label: 'Loads' },
  { href: '/drivers', label: 'Drivers' },
  { href: '/bins', label: 'Bins' },
]

export default function DispatcherPage() {
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [jobs, setJobs] = useState<JobRow[]>([])
  const [drivers, setDrivers] = useState<DriverRow[]>([])
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [driverFilter, setDriverFilter] = useState('all')

  useEffect(() => {
    void initialize()
  }, [])

  useEffect(() => {
    const jobsChannel = supabase
      .channel('dispatcher-jobs-final')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'jobs' }, () => {
        void loadJobs()
      })
      .subscribe()

    const driversChannel = supabase
      .channel('dispatcher-drivers-final')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'drivers' }, () => {
        void loadDrivers()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(jobsChannel)
      supabase.removeChannel(driversChannel)
    }
  }, [])

  async function initialize() {
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

    if (
      profileError ||
      !profileData ||
      !['admin', 'dispatcher'].includes(profileData.role || '')
    ) {
      router.push('/login')
      return
    }

    setProfile(profileData)
    await Promise.all([loadJobs(), loadDrivers()])
    setLoading(false)
  }

  async function loadJobs() {
    const { data, error } = await supabase
      .from('jobs')
      .select(`
        id,
        job_number,
        job_type,
        scheduled_date,
        service_address,
        status,
        priority,
        notes_dispatch,
        assigned_driver_id,
        customers:customer_id ( company_name ),
        bins:assigned_bin_id ( bin_number, size )
      `)
      .order('scheduled_date', { ascending: true })
      .order('created_at', { ascending: false })

    if (error) {
      setErrorMessage(error.message)
      return
    }

    setJobs((data as JobRow[]) || [])
  }

  async function loadDrivers() {
    const { data, error } = await supabase
      .from('drivers')
      .select('id, full_name, truck_number, status')
      .order('created_at', { ascending: false })

    if (error) {
      setErrorMessage(error.message)
      return
    }

    setDrivers((data as DriverRow[]) || [])
  }

  async function quickMove(id: string, status: string) {
    const { error } = await supabase.from('jobs').update({ status }).eq('id', id)

    if (error) {
      setErrorMessage(error.message)
      return
    }

    await loadJobs()
  }

  const visibleJobs = useMemo(() => {
    if (driverFilter === 'all') return jobs
    if (driverFilter === 'unassigned') return jobs.filter((job) => !job.assigned_driver_id)
    return jobs.filter((job) => job.assigned_driver_id === driverFilter)
  }, [jobs, driverFilter])

  const pendingJobs = visibleJobs.filter((job) =>
    ['new', 'pending', 'assigned', 'scheduled'].includes((job.status || 'new').toLowerCase())
  )

  const progressJobs = visibleJobs.filter((job) =>
    ['in_progress', 'in progress'].includes((job.status || '').toLowerCase())
  )

  const completedJobs = visibleJobs.filter(
    (job) => (job.status || '').toLowerCase() === 'completed'
  )

  const sections: [string, JobRow[]][] = [
    ['Pending / Assigned', pendingJobs],
    ['In Progress', progressJobs],
    ['Completed', completedJobs],
  ]

  function driverName(id: string | null) {
    if (!id) return 'Unassigned'
    const driver = drivers.find((item) => item.id === id)
    return driver?.full_name || 'Unassigned'
  }

  function priorityClasses(value: string | null) {
    switch ((value || '').toLowerCase()) {
      case 'urgent':
      case 'high':
        return 'bg-red-50 text-red-700 border border-red-200'
      case 'normal':
      case 'medium':
        return 'bg-amber-50 text-amber-700 border border-amber-200'
      default:
        return 'bg-slate-100 text-slate-700 border border-slate-200'
    }
  }

  if (loading) {
    return (
      <DashboardShell
        title="Dispatch Window"
        subtitle="Live operation board for ticket flow and quick status movement."
        roleLabel={profile?.role === 'admin' ? 'Admin' : 'Dispatcher'}
        userName={profile?.full_name || profile?.email || 'Dispatcher'}
        navItems={navItems}
      >
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm text-slate-500">Loading dispatch board...</p>
        </div>
      </DashboardShell>
    )
  }

  return (
    <DashboardShell
      title="Dispatch Window"
      subtitle="Live operation board for ticket flow and quick status movement."
      roleLabel={profile?.role === 'admin' ? 'Admin' : 'Dispatcher'}
      userName={profile?.full_name || profile?.email || 'Dispatcher'}
      navItems={navItems}
    >
      <div className="space-y-6 pb-24 md:pb-6">
        {errorMessage ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {errorMessage}
          </div>
        ) : null}

        <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-xl font-bold text-slate-950">Flow Board</h2>
                <p className="text-sm text-slate-500">
                  Move jobs from pending to completion in real time.
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <select
                  value={driverFilter}
                  onChange={(e) => setDriverFilter(e.target.value)}
                  className="rounded-2xl border border-slate-300 px-4 py-2.5 text-sm outline-none transition focus:border-slate-900"
                >
                  <option value="all">All drivers</option>
                  <option value="unassigned">Unassigned</option>
                  {drivers.map((driver) => (
                    <option key={driver.id} value={driver.id}>
                      {driver.full_name || 'Unnamed Driver'}
                    </option>
                  ))}
                </select>

                <button
                  onClick={() => router.push('/jobs')}
                  className="rounded-2xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
                >
                  Open Job Desk
                </button>
              </div>
            </div>

            <div className="mt-6 grid gap-4 xl:grid-cols-3">
              {sections.map(([label, list]) => (
                <div key={label} className="rounded-3xl bg-slate-50 p-4">
                  <div className="mb-4 flex items-center justify-between">
                    <h3 className="font-bold text-slate-900">{label}</h3>
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600">
                      {list.length}
                    </span>
                  </div>

                  <div className="space-y-3">
                    {list.map((job) => (
                      <div
                        key={job.id}
                        className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-slate-900">
                              {job.customers?.company_name || 'No client'}
                            </p>
                            <p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-400">
                              {job.job_type || 'General job'}
                            </p>
                            <p className="mt-1 text-xs font-semibold text-slate-500">
                              {job.job_number || 'No ticket number'}
                            </p>
                          </div>

                          <span
                            className={`inline-flex rounded-full px-3 py-1 text-[11px] font-semibold ${priorityClasses(job.priority)}`}
                          >
                            {job.priority || 'low'}
                          </span>
                        </div>

                        <div className="mt-4 space-y-1.5 text-sm text-slate-600">
                          <p>
                            <span className="font-medium text-slate-800">Address:</span>{' '}
                            {job.service_address || '—'}
                          </p>
                          <p>
                            <span className="font-medium text-slate-800">Driver:</span>{' '}
                            {driverName(job.assigned_driver_id)}
                          </p>
                          <p>
                            <span className="font-medium text-slate-800">Bin:</span>{' '}
                            {job.bins?.bin_number || 'No bin'}
                            {job.bins?.size ? ` • ${job.bins.size} yards` : ''}
                          </p>
                          <p>
                            <span className="font-medium text-slate-800">Date:</span>{' '}
                            {job.scheduled_date || '—'}
                          </p>
                        </div>

                        <div className="mt-3 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
                          {job.notes_dispatch || 'No dispatch notes.'}
                        </div>

                        <div className="mt-4 flex flex-wrap gap-2">
                          {(job.status || 'new') !== 'assigned' ? (
                            <button
                              onClick={() => quickMove(job.id, 'assigned')}
                              className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700"
                            >
                              Assign
                            </button>
                          ) : null}

                          {!['in_progress', 'in progress'].includes((job.status || '').toLowerCase()) ? (
                            <button
                              onClick={() => quickMove(job.id, 'in_progress')}
                              className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700"
                            >
                              Start
                            </button>
                          ) : null}

                          {(job.status || '') !== 'completed' ? (
                            <button
                              onClick={() => quickMove(job.id, 'completed')}
                              className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700"
                            >
                              Complete
                            </button>
                          ) : null}
                        </div>
                      </div>
                    ))}

                    {!list.length ? (
                      <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-500">
                        No jobs in this stage.
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <aside className="space-y-4">
            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-bold text-slate-950">Driver Control</h2>
              <p className="mt-1 text-sm text-slate-500">Operational view of active drivers.</p>

              <div className="mt-4 space-y-3">
                {drivers.map((driver) => (
                  <div key={driver.id} className="rounded-2xl border border-slate-200 px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-medium text-slate-900">
                          {driver.full_name || 'Unnamed Driver'}
                        </p>
                        <p className="text-sm text-slate-500">
                          Truck: {driver.truck_number || '—'}
                        </p>
                      </div>

                      <span
                        className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                          ['active', 'available', 'on duty'].includes(
                            (driver.status || '').toLowerCase()
                          )
                            ? 'border border-emerald-200 bg-emerald-50 text-emerald-700'
                            : 'border border-slate-200 bg-slate-100 text-slate-700'
                        }`}
                      >
                        {driver.status || 'inactive'}
                      </span>
                    </div>
                  </div>
                ))}

                {!drivers.length ? <p className="text-sm text-slate-500">No drivers found.</p> : null}
              </div>
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-bold text-slate-950">Shortcuts</h2>

              <div className="mt-4 grid gap-3">
                <button
                  onClick={() => router.push('/jobs')}
                  className="rounded-2xl border border-slate-200 px-4 py-3 text-left text-sm font-semibold text-slate-800 transition hover:bg-slate-50"
                >
                  Manage jobs
                </button>

                <button
                  onClick={() => router.push('/drivers')}
                  className="rounded-2xl border border-slate-200 px-4 py-3 text-left text-sm font-semibold text-slate-800 transition hover:bg-slate-50"
                >
                  Manage drivers
                </button>

                <button
                  onClick={() => router.push('/bins')}
                  className="rounded-2xl border border-slate-200 px-4 py-3 text-left text-sm font-semibold text-slate-800 transition hover:bg-slate-50"
                >
                  Manage bins
                </button>
              </div>
            </section>
          </aside>
        </div>
      </div>
    </DashboardShell>
  )
}