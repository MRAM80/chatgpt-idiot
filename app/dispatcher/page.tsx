'use client'

import { useEffect, useMemo, useState } from 'react'
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
  status: string | null
}

type BinRow = {
  id: string
  bin_number: string | null
  bin_type: string | null
  status: string | null
  location: string | null
}

type JobRow = {
  id: string
  ticket_number: string | null
  job_type: string | null
  scheduled_date: string | null
  status: string | null
  driver_id: string | null
}

const navItems = [
  { href: '/admin', label: 'Dashboard' },
  { href: '/dispatcher', label: 'Dispatch Window' },
  { href: '/jobs', label: 'Jobs' },
  { href: '/drivers', label: 'Drivers' },
  { href: '/bins', label: 'Bins' },
]

export default function DispatcherPage() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [jobs, setJobs] = useState<JobRow[]>([])
  const [drivers, setDrivers] = useState<DriverRow[]>([])
  const [bins, setBins] = useState<BinRow[]>([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState('')

  const [selectedDrivers, setSelectedDrivers] = useState<Record<string, string>>({})
  const [selectedStatuses, setSelectedStatuses] = useState<Record<string, string>>({})

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
      setLoading(false)
      return
    }

    const { data: profileData } = await supabase
      .from('profiles')
      .select('id, full_name, email, role')
      .eq('id', user.id)
      .single()

    setProfile(profileData || null)

    const [jobsRes, driversRes, binsRes] = await Promise.all([
      supabase
        .from('jobs')
        .select('id, ticket_number, job_type, scheduled_date, status, driver_id')
        .order('scheduled_date', { ascending: true }),
      supabase
        .from('drivers')
        .select('id, full_name, status')
        .order('created_at', { ascending: false }),
      supabase
        .from('bins')
        .select('id, bin_number, bin_type, status, location')
        .order('created_at', { ascending: false }),
    ])

    if (jobsRes.error || driversRes.error || binsRes.error) {
      setErrorMessage(jobsRes.error?.message || driversRes.error?.message || binsRes.error?.message || 'Could not load dispatch data')
    }

    const jobsData = (jobsRes.data as JobRow[]) || []
    const driverData = (driversRes.data as DriverRow[]) || []
    const binData = (binsRes.data as BinRow[]) || []

    setJobs(jobsData)
    setDrivers(driverData)
    setBins(binData)

    const initialDrivers: Record<string, string> = {}
    const initialStatuses: Record<string, string> = {}

    jobsData.forEach((job) => {
      initialDrivers[job.id] = job.driver_id || ''
      initialStatuses[job.id] = job.status || 'pending'
    })

    setSelectedDrivers(initialDrivers)
    setSelectedStatuses(initialStatuses)
    setLoading(false)
  }

  async function saveJob(jobId: string) {
    setSavingId(jobId)
    setErrorMessage('')

    const { error } = await supabase
      .from('jobs')
      .update({
        driver_id: selectedDrivers[jobId] || null,
        status: selectedStatuses[jobId] || 'pending',
      })
      .eq('id', jobId)

    if (error) {
      setErrorMessage(error.message)
    } else {
      setJobs((current) =>
        current.map((job) =>
          job.id === jobId
            ? {
                ...job,
                driver_id: selectedDrivers[jobId] || null,
                status: selectedStatuses[jobId] || 'pending',
              }
            : job
        )
      )
    }

    setSavingId(null)
  }

  const pendingJobs = useMemo(
    () => jobs.filter((job) => ['pending', 'assigned'].includes((selectedStatuses[job.id] || job.status || '').toLowerCase())),
    [jobs, selectedStatuses]
  )

  const progressJobs = useMemo(
    () => jobs.filter((job) => (selectedStatuses[job.id] || job.status || '').toLowerCase() === 'in_progress'),
    [jobs, selectedStatuses]
  )

  const completedJobs = useMemo(
    () => jobs.filter((job) => (selectedStatuses[job.id] || job.status || '').toLowerCase() === 'completed'),
    [jobs, selectedStatuses]
  )

  const availableDrivers = drivers.filter((driver) => (driver.status || '').toLowerCase() === 'active')
  const availableBins = bins.filter((bin) => (bin.status || '').toLowerCase() === 'available')

  function getDriverName(driverId: string | null) {
    return drivers.find((driver) => driver.id === driverId)?.full_name || 'Unassigned'
  }

  function JobCard({ job }: { job: JobRow }) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold text-slate-950">{job.ticket_number || 'No ticket'}</h3>
            <p className="text-sm text-slate-500">{job.job_type || 'General job'}</p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
            {selectedStatuses[job.id] || job.status || 'pending'}
          </span>
        </div>

        <div className="grid gap-3">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Scheduled Date</label>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
              {job.scheduled_date || 'Not set'}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Assigned Driver</label>
            <select
              value={selectedDrivers[job.id] || ''}
              onChange={(e) =>
                setSelectedDrivers((current) => ({
                  ...current,
                  [job.id]: e.target.value,
                }))
              }
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none"
            >
              <option value="">Unassigned</option>
              {availableDrivers.map((driver) => (
                <option key={driver.id} value={driver.id}>
                  {driver.full_name || 'Driver'}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Status</label>
            <select
              value={selectedStatuses[job.id] || 'pending'}
              onChange={(e) =>
                setSelectedStatuses((current) => ({
                  ...current,
                  [job.id]: e.target.value,
                }))
              }
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none"
            >
              <option value="pending">pending</option>
              <option value="assigned">assigned</option>
              <option value="in_progress">in_progress</option>
              <option value="completed">completed</option>
            </select>
          </div>

          <button
            onClick={() => saveJob(job.id)}
            disabled={savingId === job.id}
            className="mt-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
          >
            {savingId === job.id ? 'Saving...' : 'Save Dispatch Update'}
          </button>

          <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
            Current driver: {getDriverName(selectedDrivers[job.id] || job.driver_id)}
          </div>
        </div>
      </div>
    )
  }

  return (
    <DashboardShell
      title="Dispatch Window"
      subtitle="Assign drivers and track job progress."
      roleLabel={profile?.role || 'Admin'}
      userName={profile?.full_name || profile?.email || 'User'}
      navItems={navItems}
    >
      {errorMessage ? (
        <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Pending / Assigned</p>
          <h2 className="mt-2 text-3xl font-bold text-slate-950">{loading ? '...' : pendingJobs.length}</h2>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">In Progress</p>
          <h2 className="mt-2 text-3xl font-bold text-slate-950">{loading ? '...' : progressJobs.length}</h2>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Completed</p>
          <h2 className="mt-2 text-3xl font-bold text-slate-950">{loading ? '...' : completedJobs.length}</h2>
        </div>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-950">Dispatch Board</h2>
              <p className="text-sm text-slate-500">Live assignment and status updates</p>
            </div>
          </div>

          <div className="grid gap-6 xl:grid-cols-3">
            <div>
              <div className="mb-4 flex items-center justify-between">
                <h3 className="font-bold text-slate-900">Pending / Assigned</h3>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                  {pendingJobs.length}
                </span>
              </div>
              <div className="space-y-4">
                {pendingJobs.map((job) => (
                  <JobCard key={job.id} job={job} />
                ))}
                {!pendingJobs.length ? <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">No jobs found.</div> : null}
              </div>
            </div>

            <div>
              <div className="mb-4 flex items-center justify-between">
                <h3 className="font-bold text-slate-900">In Progress</h3>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                  {progressJobs.length}
                </span>
              </div>
              <div className="space-y-4">
                {progressJobs.map((job) => (
                  <JobCard key={job.id} job={job} />
                ))}
                {!progressJobs.length ? <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">No jobs found.</div> : null}
              </div>
            </div>

            <div>
              <div className="mb-4 flex items-center justify-between">
                <h3 className="font-bold text-slate-900">Completed</h3>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                  {completedJobs.length}
                </span>
              </div>
              <div className="space-y-4">
                {completedJobs.map((job) => (
                  <JobCard key={job.id} job={job} />
                ))}
                {!completedJobs.length ? <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">No jobs found.</div> : null}
              </div>
            </div>
          </div>
        </section>

        <section className="space-y-6">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-bold text-slate-950">Active Drivers</h2>
            <div className="mt-4 space-y-3">
              {availableDrivers.map((driver) => (
                <div key={driver.id} className="flex items-center justify-between rounded-2xl border border-slate-200 px-4 py-3">
                  <span className="font-medium text-slate-900">{driver.full_name || 'Driver'}</span>
                  <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                    {driver.status || 'active'}
                  </span>
                </div>
              ))}
              {!availableDrivers.length ? <p className="text-sm text-slate-500">No active drivers found.</p> : null}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-bold text-slate-950">Available Bins</h2>
            <div className="mt-4 space-y-3">
              {availableBins.map((bin) => (
                <div key={bin.id} className="rounded-2xl border border-slate-200 px-4 py-3">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-slate-900">{bin.bin_number || 'No number'}</span>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                      {bin.status || 'available'}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-slate-500">
                    {bin.bin_type || 'General bin'} {bin.location ? `• ${bin.location}` : ''}
                  </p>
                </div>
              ))}
              {!availableBins.length ? <p className="text-sm text-slate-500">No available bins found.</p> : null}
            </div>
          </div>
        </section>
      </div>
    </DashboardShell>
  )
}