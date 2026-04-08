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
  email: string | null
  phone: string | null
  truck_number: string | null
  status: string | null
  created_at: string | null
}

type JobRow = {
  id: string
  assigned_driver_id: string | null
  status: string | null
}

const navItems = [
  { href: '/admin', label: 'Dashboard' },
  { href: '/dispatcher', label: 'Dispatch' },
  { href: '/jobs', label: 'Jobs' },
  { href: '/loads', label: 'Loads' },
  { href: '/drivers', label: 'Drivers' },
  { href: '/bins', label: 'Bins' },
]

export default function DriversPage() {
  const router = useRouter()

  const [profile, setProfile] = useState<Profile | null>(null)
  const [drivers, setDrivers] = useState<DriverRow[]>([])
  const [jobs, setJobs] = useState<JobRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [truckNumber, setTruckNumber] = useState('')
  const [status, setStatus] = useState('active')

  useEffect(() => {
    void initialize()
  }, [])

  useEffect(() => {
    const driversChannel = supabase
      .channel('drivers-page-drivers')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'drivers' }, () => {
        void loadDrivers()
      })
      .subscribe()

    const jobsChannel = supabase
      .channel('drivers-page-jobs')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'jobs' }, () => {
        void loadJobs()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(driversChannel)
      supabase.removeChannel(jobsChannel)
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
    await Promise.all([loadDrivers(), loadJobs()])
    setLoading(false)
  }

  async function loadDrivers() {
    const { data, error } = await supabase
      .from('drivers')
      .select('id, full_name, email, phone, truck_number, status, created_at')
      .order('created_at', { ascending: false })

    if (error) {
      setErrorMessage(error.message)
      return
    }

    setDrivers((data as DriverRow[]) || [])
  }

  async function loadJobs() {
    const { data, error } = await supabase
      .from('jobs')
      .select('id, assigned_driver_id, status')
      .order('created_at', { ascending: false })

    if (error) {
      setErrorMessage(error.message)
      return
    }

    setJobs((data as JobRow[]) || [])
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  async function createDriver() {
    if (!fullName.trim()) {
      setErrorMessage('Driver full name is required.')
      return
    }

    setSaving(true)
    setErrorMessage('')

    const { error } = await supabase.from('drivers').insert([
      {
        full_name: fullName.trim(),
        email: email.trim() || null,
        phone: phone.trim() || null,
        truck_number: truckNumber.trim() || null,
        status,
      },
    ])

    if (error) {
      setErrorMessage(error.message)
      setSaving(false)
      return
    }

    setFullName('')
    setEmail('')
    setPhone('')
    setTruckNumber('')
    setStatus('active')
    setSaving(false)

    await loadDrivers()
  }

  async function updateDriverStatus(driverId: string, nextStatus: string) {
    const { error } = await supabase
      .from('drivers')
      .update({ status: nextStatus })
      .eq('id', driverId)

    if (error) {
      setErrorMessage(error.message)
      return
    }

    await loadDrivers()
  }

  function getDriverJobCount(driverId: string) {
    return jobs.filter((job) => job.assigned_driver_id === driverId).length
  }

  function getDriverActiveJobCount(driverId: string) {
    return jobs.filter((job) => {
      const matchesDriver = job.assigned_driver_id === driverId
      const activeStatuses = ['new', 'assigned', 'scheduled', 'in_progress', 'in progress']
      return matchesDriver && activeStatuses.includes((job.status || '').toLowerCase())
    }).length
  }

  const stats = useMemo(() => {
    const totalDrivers = drivers.length
    const activeDrivers = drivers.filter((driver) =>
      ['active', 'available', 'on duty'].includes((driver.status || '').toLowerCase())
    ).length
    const inactiveDrivers = drivers.filter(
      (driver) => (driver.status || '').toLowerCase() === 'inactive'
    ).length
    const totalAssignedJobs = jobs.filter((job) => !!job.assigned_driver_id).length

    return {
      totalDrivers,
      activeDrivers,
      inactiveDrivers,
      totalAssignedJobs,
    }
  }, [drivers, jobs])

  return (
    <DashboardShell
      title="Drivers"
      subtitle="Manage drivers, truck details, and dispatch availability."
      roleLabel={profile?.role === 'admin' ? 'Admin' : 'Dispatcher'}
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

        <div className="rounded-3xl border border-slate-200 bg-gradient-to-r from-slate-950 to-blue-700 p-6 text-white shadow-sm">
          <h1 className="text-2xl font-bold">Driver Management</h1>
          <p className="mt-1 text-sm text-white/80">
            Add drivers, track status, and view assigned job counts.
          </p>
        </div>

        {loading ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500 shadow-sm">
            Loading drivers...
          </div>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="text-sm text-slate-500">Total Drivers</div>
                <div className="mt-2 text-3xl font-bold text-slate-900">
                  {stats.totalDrivers}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="text-sm text-slate-500">Active Drivers</div>
                <div className="mt-2 text-3xl font-bold text-slate-900">
                  {stats.activeDrivers}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="text-sm text-slate-500">Inactive Drivers</div>
                <div className="mt-2 text-3xl font-bold text-slate-900">
                  {stats.inactiveDrivers}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="text-sm text-slate-500">Assigned Jobs</div>
                <div className="mt-2 text-3xl font-bold text-slate-900">
                  {stats.totalAssignedJobs}
                </div>
              </div>
            </div>

            <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
              <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-semibold text-slate-900">Add Driver</h2>

                <div className="mt-4 grid gap-3">
                  <input
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Full name"
                    className="rounded-xl border p-3"
                  />

                  <input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Email"
                    className="rounded-xl border p-3"
                  />

                  <input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="Phone"
                    className="rounded-xl border p-3"
                  />

                  <input
                    value={truckNumber}
                    onChange={(e) => setTruckNumber(e.target.value)}
                    placeholder="Truck number"
                    className="rounded-xl border p-3"
                  />

                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    className="rounded-xl border p-3"
                  >
                    <option value="active">Active</option>
                    <option value="available">Available</option>
                    <option value="on duty">On Duty</option>
                    <option value="inactive">Inactive</option>
                  </select>

                  <button
                    onClick={createDriver}
                    disabled={saving}
                    className="rounded-xl bg-black px-5 py-3 text-white disabled:opacity-50"
                  >
                    {saving ? 'Saving...' : 'Add Driver'}
                  </button>
                </div>
              </section>

              <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-200 px-5 py-4">
                  <h2 className="text-lg font-semibold text-slate-900">Driver List</h2>
                </div>

                <div className="divide-y">
                  {drivers.length === 0 ? (
                    <div className="p-5 text-sm text-slate-500">No drivers found.</div>
                  ) : (
                    drivers.map((driver) => (
                      <div key={driver.id} className="grid gap-4 p-5 xl:grid-cols-6">
                        <div>
                          <div className="text-xs text-slate-500">Driver</div>
                          <div className="font-medium text-slate-900">
                            {driver.full_name || '—'}
                          </div>
                        </div>

                        <div>
                          <div className="text-xs text-slate-500">Contact</div>
                          <div className="text-sm text-slate-800">
                            {driver.email || 'No email'}
                          </div>
                          <div className="text-sm text-slate-500">
                            {driver.phone || 'No phone'}
                          </div>
                        </div>

                        <div>
                          <div className="text-xs text-slate-500">Truck</div>
                          <div className="text-sm text-slate-800">
                            {driver.truck_number || '—'}
                          </div>
                        </div>

                        <div>
                          <div className="text-xs text-slate-500">Status</div>
                          <div className="mt-1">
                            <span
                              className={`rounded-full px-3 py-1 text-xs font-semibold ${
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

                        <div>
                          <div className="text-xs text-slate-500">Jobs</div>
                          <div className="text-sm text-slate-800">
                            Total: {getDriverJobCount(driver.id)}
                          </div>
                          <div className="text-sm text-slate-500">
                            Active: {getDriverActiveJobCount(driver.id)}
                          </div>
                        </div>

                        <div>
                          <div className="text-xs text-slate-500">Quick Actions</div>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <button
                              onClick={() => updateDriverStatus(driver.id, 'active')}
                              className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700"
                            >
                              Active
                            </button>
                            <button
                              onClick={() => updateDriverStatus(driver.id, 'on duty')}
                              className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700"
                            >
                              On Duty
                            </button>
                            <button
                              onClick={() => updateDriverStatus(driver.id, 'inactive')}
                              className="rounded-lg border border-slate-200 bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700"
                            >
                              Inactive
                            </button>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </section>
            </div>
          </>
        )}
      </div>
    </DashboardShell>
  )
}