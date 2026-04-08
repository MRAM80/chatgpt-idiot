'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import DashboardShell from '@/components/dashboard-shell'

type Profile = {
  id: string
  email: string
  role: string
  full_name?: string | null
}

type Bin = {
  id: string
  status: string | null
  current_location: string | null
  created_at: string
}

type Driver = {
  id: string
  full_name: string
  status: string | null
  truck_number?: string | null
  created_at: string
}

type Load = {
  id: string
  status: string | null
  created_at: string
}

type Job = {
  id: string
  job_number: string | null
  job_type: string | null
  status: string | null
  scheduled_date: string | null
  created_at: string
}

const navItems = [
  { href: '/admin', label: 'Dashboard' },
  { href: '/dispatcher', label: 'Dispatch' },
  { href: '/jobs', label: 'Jobs' },
  { href: '/loads', label: 'Loads' },
  { href: '/drivers', label: 'Drivers' },
  { href: '/bins', label: 'Bins' },
]

export default function AdminPage() {
  const router = useRouter()

  const [profile, setProfile] = useState<Profile | null>(null)
  const [bins, setBins] = useState<Bin[]>([])
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [loads, setLoads] = useState<Load[]>([])
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    let cleanup: (() => void) | undefined

    async function init() {
      cleanup = await loadPage()
    }

    void init()

    return () => {
      if (cleanup) cleanup()
    }
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
      .select('id, email, role, full_name')
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

    await Promise.all([loadBins(), loadDrivers(), loadLoads(), loadJobs()])

    setLoading(false)
    return setupRealtime()
  }

  function setupRealtime() {
    const channel = supabase
      .channel('admin-dashboard-final')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bins' }, async () => {
        await loadBins()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'drivers' }, async () => {
        await loadDrivers()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'loads' }, async () => {
        await loadLoads()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'jobs' }, async () => {
        await loadJobs()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }

  async function loadBins() {
    const { data, error } = await supabase
      .from('bins')
      .select('id, status, current_location, created_at')
      .order('created_at', { ascending: false })

    if (error) {
      setErrorMessage(error.message)
      return
    }

    setBins(data || [])
  }

  async function loadDrivers() {
    const { data, error } = await supabase
      .from('drivers')
      .select('id, full_name, status, truck_number, created_at')
      .order('created_at', { ascending: false })

    if (error) {
      setErrorMessage(error.message)
      return
    }

    setDrivers(data || [])
  }

  async function loadLoads() {
    const { data, error } = await supabase
      .from('loads')
      .select('id, status, created_at')
      .order('created_at', { ascending: false })

    if (error) {
      setErrorMessage(error.message)
      return
    }

    setLoads(data || [])
  }

  async function loadJobs() {
    const { data, error } = await supabase
      .from('jobs')
      .select('id, job_number, job_type, status, scheduled_date, created_at')
      .order('created_at', { ascending: false })

    if (error) {
      setErrorMessage(error.message)
      return
    }

    setJobs(data || [])
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const stats = useMemo(() => {
    const availableBins = bins.filter(
      (bin) => (bin.status || '').toLowerCase() === 'available'
    ).length

    const assignedBins = bins.filter((bin) =>
      ['assigned', 'delivered', 'picked up', 'in transit'].includes(
        (bin.status || '').toLowerCase()
      )
    ).length

    const maintenanceBins = bins.filter(
      (bin) => (bin.status || '').toLowerCase() === 'maintenance'
    ).length

    const activeDrivers = drivers.filter((driver) =>
      ['active', 'available', 'on duty'].includes(
        (driver.status || '').toLowerCase()
      )
    ).length

    const activeLoads = loads.filter((load) =>
      ['pending', 'scheduled', 'assigned', 'in progress', 'active'].includes(
        (load.status || '').toLowerCase()
      )
    ).length

    const openJobs = jobs.filter((job) =>
      ['new', 'pending', 'assigned', 'scheduled', 'in_progress', 'in progress'].includes(
        (job.status || '').toLowerCase()
      )
    ).length

    const completedJobs = jobs.filter(
      (job) => (job.status || '').toLowerCase() === 'completed'
    ).length

    return {
      totalBins: bins.length,
      availableBins,
      assignedBins,
      maintenanceBins,
      totalDrivers: drivers.length,
      activeDrivers,
      totalLoads: loads.length,
      activeLoads,
      totalJobs: jobs.length,
      openJobs,
      completedJobs,
    }
  }, [bins, drivers, loads, jobs])

  const recentBins = bins.slice(0, 5)
  const recentDrivers = drivers.slice(0, 5)
  const recentLoads = loads.slice(0, 5)
  const recentJobs = jobs.slice(0, 5)

  return (
    <DashboardShell
      title="Dashboard"
      subtitle="SIMPLIITRASH final operational overview"
      roleLabel={profile?.role?.toUpperCase()}
      userName={profile?.full_name || profile?.email || 'User'}
      navItems={navItems}
      onLogout={handleLogout}
    >
      <div className="space-y-6 pb-24 md:pb-6">
        {errorMessage ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {errorMessage}
          </div>
        ) : null}

        <div className="rounded-3xl border border-gray-200 bg-gradient-to-r from-black via-gray-900 to-emerald-700 p-6 text-white shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="mb-2 text-xs uppercase tracking-[0.24em] text-white/70">
                Live Operations
              </div>
              <h1 className="text-2xl font-bold">SIMPLIITRASH Control Center</h1>
              <p className="mt-1 text-sm text-white/80">
                Monitor bins, drivers, loads, and jobs before production deploy.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => router.push('/dispatcher')}
                className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black transition hover:opacity-90"
              >
                Dispatch Board
              </button>
              <button
                onClick={() => router.push('/jobs')}
                className="rounded-xl border border-white/30 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                Jobs
              </button>
              <button
                onClick={() => router.push('/loads')}
                className="rounded-xl border border-white/30 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                Loads
              </button>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="rounded-2xl border border-gray-200 bg-white p-5 text-sm text-gray-500 shadow-sm">
            Loading dashboard...
          </div>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="text-sm text-gray-500">Bins</div>
                <div className="mt-2 text-3xl font-bold text-gray-900">{stats.totalBins}</div>
                <div className="mt-2 text-xs text-gray-500">
                  Available: {stats.availableBins}
                </div>
              </div>

              <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="text-sm text-gray-500">Drivers</div>
                <div className="mt-2 text-3xl font-bold text-gray-900">
                  {stats.totalDrivers}
                </div>
                <div className="mt-2 text-xs text-gray-500">Active: {stats.activeDrivers}</div>
              </div>

              <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="text-sm text-gray-500">Loads</div>
                <div className="mt-2 text-3xl font-bold text-gray-900">{stats.totalLoads}</div>
                <div className="mt-2 text-xs text-gray-500">Active: {stats.activeLoads}</div>
              </div>

              <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="text-sm text-gray-500">Jobs</div>
                <div className="mt-2 text-3xl font-bold text-gray-900">{stats.totalJobs}</div>
                <div className="mt-2 text-xs text-gray-500">Open: {stats.openJobs}</div>
              </div>
            </div>

            <div className="grid gap-6 xl:grid-cols-4">
              <div className="rounded-2xl border border-gray-200 bg-white shadow-sm xl:col-span-1">
                <div className="border-b border-gray-200 px-5 py-4">
                  <h2 className="text-lg font-semibold text-gray-900">Quick Summary</h2>
                </div>
                <div className="grid gap-3 p-5">
                  <div className="rounded-xl bg-gray-50 p-4">
                    <div className="text-sm text-gray-500">Assigned Bins</div>
                    <div className="mt-2 text-2xl font-bold text-gray-900">
                      {stats.assignedBins}
                    </div>
                  </div>
                  <div className="rounded-xl bg-gray-50 p-4">
                    <div className="text-sm text-gray-500">Maintenance Bins</div>
                    <div className="mt-2 text-2xl font-bold text-gray-900">
                      {stats.maintenanceBins}
                    </div>
                  </div>
                  <div className="rounded-xl bg-gray-50 p-4">
                    <div className="text-sm text-gray-500">Completed Jobs</div>
                    <div className="mt-2 text-2xl font-bold text-gray-900">
                      {stats.completedJobs}
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
                <div className="border-b border-gray-200 px-5 py-4">
                  <h2 className="text-lg font-semibold text-gray-900">Recent Jobs</h2>
                </div>
                <div className="p-5">
                  {recentJobs.length === 0 ? (
                    <div className="text-sm text-gray-500">No jobs found.</div>
                  ) : (
                    <div className="space-y-3">
                      {recentJobs.map((job) => (
                        <div key={job.id} className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-sm font-semibold text-gray-900">
                              {job.job_number || 'No ticket number'}
                            </div>
                            <div className="rounded-full bg-white px-3 py-1 text-xs text-gray-600">
                              {job.status || 'new'}
                            </div>
                          </div>
                          <div className="mt-2 text-sm text-gray-600">
                            {job.job_type || 'No type'} • {job.scheduled_date || 'No date'}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
                <div className="border-b border-gray-200 px-5 py-4">
                  <h2 className="text-lg font-semibold text-gray-900">Recent Drivers</h2>
                </div>
                <div className="p-5">
                  {recentDrivers.length === 0 ? (
                    <div className="text-sm text-gray-500">No drivers found.</div>
                  ) : (
                    <div className="space-y-3">
                      {recentDrivers.map((driver) => (
                        <div
                          key={driver.id}
                          className="rounded-xl border border-gray-100 bg-gray-50 p-3"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-sm font-semibold text-gray-900">
                              {driver.full_name}
                            </div>
                            <div className="rounded-full bg-white px-3 py-1 text-xs text-gray-600">
                              {driver.status || 'no status'}
                            </div>
                          </div>
                          <div className="mt-2 text-sm text-gray-600">
                            Truck: {driver.truck_number || '—'}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
                <div className="border-b border-gray-200 px-5 py-4">
                  <h2 className="text-lg font-semibold text-gray-900">Recent Bins</h2>
                </div>
                <div className="p-5">
                  {recentBins.length === 0 ? (
                    <div className="text-sm text-gray-500">No bins found.</div>
                  ) : (
                    <div className="space-y-3">
                      {recentBins.map((bin) => (
                        <div key={bin.id} className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-sm font-semibold text-gray-900">Bin record</div>
                            <div className="rounded-full bg-white px-3 py-1 text-xs text-gray-600">
                              {bin.status || 'no status'}
                            </div>
                          </div>
                          <div className="mt-2 text-sm text-gray-600">
                            Location: {bin.current_location || 'not set'}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
              <div className="border-b border-gray-200 px-5 py-4">
                <h2 className="text-lg font-semibold text-gray-900">Recent Loads</h2>
              </div>
              <div className="p-5">
                {recentLoads.length === 0 ? (
                  <div className="text-sm text-gray-500">No loads found.</div>
                ) : (
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                    {recentLoads.map((load) => (
                      <div key={load.id} className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                        <div className="text-sm font-semibold text-gray-900">Load record</div>
                        <div className="mt-2 text-sm text-gray-600">{load.status || 'no status'}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </DashboardShell>
  )
}