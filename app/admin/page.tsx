'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import DashboardShell from '@/components/dashboard-shell'
import { supabase } from '@/lib/supabase'

type Profile = {
  id: string
  full_name: string | null
  email: string | null
  role: string | null
}

type LoadRow = {
  id: string
  customer_name: string | null
  service_date: string | null
  status: string | null
  pickup_address: string | null
  created_at: string | null
}

export default function AdminPage() {
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [errorMessage, setErrorMessage] = useState('')

  const [totalLoads, setTotalLoads] = useState(0)
  const [pendingLoads, setPendingLoads] = useState(0)
  const [completedLoads, setCompletedLoads] = useState(0)
  const [totalDrivers, setTotalDrivers] = useState(0)
  const [totalBins, setTotalBins] = useState(0)
  const [recentLoads, setRecentLoads] = useState<LoadRow[]>([])

  useEffect(() => {
    loadDashboard()
  }, [])

  async function loadDashboard() {
    setLoading(true)
    setErrorMessage('')

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      router.push('/login')
      return
    }

    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('id, full_name, email, role')
      .eq('id', user.id)
      .single()

    if (profileError || !profileData) {
      setErrorMessage('Profile not found.')
      setLoading(false)
      return
    }

    setProfile(profileData)

    const [
      loadsCountRes,
      pendingLoadsRes,
      completedLoadsRes,
      driversCountRes,
      binsCountRes,
      recentLoadsRes,
    ] = await Promise.all([
      supabase.from('loads').select('*', { count: 'exact', head: true }),
      supabase.from('loads').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('loads').select('*', { count: 'exact', head: true }).eq('status', 'completed'),
      supabase.from('drivers').select('*', { count: 'exact', head: true }),
      supabase.from('bins').select('*', { count: 'exact', head: true }),
      supabase
        .from('loads')
        .select('id, customer_name, service_date, status, pickup_address, created_at')
        .order('created_at', { ascending: false })
        .limit(6),
    ])

    if (loadsCountRes.error) setErrorMessage(loadsCountRes.error.message)
    if (driversCountRes.error) setErrorMessage(driversCountRes.error.message)
    if (binsCountRes.error) setErrorMessage(binsCountRes.error.message)
    if (recentLoadsRes.error) setErrorMessage(recentLoadsRes.error.message)

    setTotalLoads(loadsCountRes.count || 0)
    setPendingLoads(pendingLoadsRes.count || 0)
    setCompletedLoads(completedLoadsRes.count || 0)
    setTotalDrivers(driversCountRes.count || 0)
    setTotalBins(binsCountRes.count || 0)
    setRecentLoads((recentLoadsRes.data as LoadRow[]) || [])

    setLoading(false)
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  function getStatusClasses(status: string | null) {
    switch ((status || '').toLowerCase()) {
      case 'completed':
        return 'bg-emerald-50 text-emerald-700 border border-emerald-200'
      case 'in_progress':
        return 'bg-amber-50 text-amber-700 border border-amber-200'
      case 'assigned':
        return 'bg-blue-50 text-blue-700 border border-blue-200'
      case 'cancelled':
        return 'bg-red-50 text-red-700 border border-red-200'
      default:
        return 'bg-slate-100 text-slate-700 border border-slate-200'
    }
  }

  return (
    <DashboardShell
      title="Admin Dashboard"
      subtitle="Monitor operations, loads, drivers, and bins in real time."
      roleLabel={profile?.role === 'admin' ? 'Admin' : 'Operations'}
      userName={profile?.full_name || profile?.email || 'User'}
      navItems={[
        { href: '/admin', label: 'Dashboard' },
        { href: '/loads', label: 'Loads' },
        { href: '/drivers', label: 'Drivers' },
        { href: '/bins', label: 'Bins' },
      ]}
    >
      {errorMessage ? (
        <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Total Loads</p>
          <h2 className="mt-2 text-3xl font-bold text-slate-900">
            {loading ? '...' : totalLoads}
          </h2>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Pending Loads</p>
          <h2 className="mt-2 text-3xl font-bold text-slate-900">
            {loading ? '...' : pendingLoads}
          </h2>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Completed Loads</p>
          <h2 className="mt-2 text-3xl font-bold text-slate-900">
            {loading ? '...' : completedLoads}
          </h2>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Drivers</p>
          <h2 className="mt-2 text-3xl font-bold text-slate-900">
            {loading ? '...' : totalDrivers}
          </h2>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Bins</p>
          <h2 className="mt-2 text-3xl font-bold text-slate-900">
            {loading ? '...' : totalBins}
          </h2>
        </div>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-900">Recent Loads</h2>
              <p className="text-sm text-slate-500">Latest activity in the system</p>
            </div>
          </div>

          {loading ? (
            <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">
              Loading dashboard...
            </div>
          ) : recentLoads.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center">
              <p className="text-base font-semibold text-slate-700">No loads yet</p>
              <p className="mt-1 text-sm text-slate-500">
                Create your first load from the Loads page.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left">
                <thead>
                  <tr className="border-b border-slate-200 text-sm text-slate-500">
                    <th className="px-3 py-3 font-semibold">Customer</th>
                    <th className="px-3 py-3 font-semibold">Service Date</th>
                    <th className="px-3 py-3 font-semibold">Status</th>
                    <th className="px-3 py-3 font-semibold">Pickup</th>
                  </tr>
                </thead>
                <tbody>
                  {recentLoads.map((load) => (
                    <tr key={load.id} className="border-b border-slate-100">
                      <td className="px-3 py-4 font-medium text-slate-900">
                        {load.customer_name || 'No name'}
                      </td>
                      <td className="px-3 py-4 text-sm text-slate-700">
                        {load.service_date || 'Not set'}
                      </td>
                      <td className="px-3 py-4">
                        <span
                          className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getStatusClasses(
                            load.status
                          )}`}
                        >
                          {load.status || 'pending'}
                        </span>
                      </td>
                      <td className="px-3 py-4 text-sm text-slate-700">
                        {load.pickup_address || 'No pickup address'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold text-slate-900">Quick Actions</h2>
          <p className="mt-1 text-sm text-slate-500">
            Jump into the main operational areas
          </p>

          <div className="mt-5 grid gap-3">
            <button
              onClick={() => router.push('/loads')}
              className="rounded-2xl bg-slate-900 px-4 py-3 text-left text-sm font-semibold text-white transition hover:opacity-90"
            >
              Open Loads Management
            </button>

            <button
              onClick={() => router.push('/drivers')}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left text-sm font-semibold text-slate-800 transition hover:bg-slate-50"
            >
              Open Drivers
            </button>

            <button
              onClick={() => router.push('/bins')}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left text-sm font-semibold text-slate-800 transition hover:bg-slate-50"
            >
              Open Bins
            </button>
          </div>

          <div className="mt-6 rounded-2xl bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Summary
            </p>
            <p className="mt-2 text-sm text-slate-700">
              You currently have <span className="font-semibold">{totalLoads}</span> loads,
              <span className="font-semibold"> {totalDrivers}</span> drivers, and
              <span className="font-semibold"> {totalBins}</span> bins in the system.
            </p>
          </div>
        </div>
      </div>
    </DashboardShell>
  )
}