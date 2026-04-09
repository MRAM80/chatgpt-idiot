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

type JobRow = {
  id: string
  ticket_number: string | null
  job_type: string | null
  scheduled_date: string | null
  status: string | null
}

type DriverRow = {
  id: string
  full_name: string | null
  status: string | null
}

const navItems = [
  { href: '/admin', label: 'Dashboard' },
  { href: '/dispatcher', label: 'Dispatch Window' },
  { href: '/jobs', label: 'Jobs' },
  { href: '/drivers', label: 'Drivers' },
  { href: '/bins', label: 'Bins' },
]

export default function AdminPage() {
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')

  const [stats, setStats] = useState({
    total: 0,
    open: 0,
    progress: 0,
    completed: 0,
    drivers: 0,
    bins: 0,
  })

  const [recentJobs, setRecentJobs] = useState<JobRow[]>([])
  const [drivers, setDrivers] = useState<DriverRow[]>([])

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

    if (profileError || !profileData || profileData.role !== 'admin') {
      router.push('/login')
      return
    }

    setProfile(profileData)

    const [
      total,
      open,
      progress,
      completed,
      driversCount,
      binsCount,
      jobsRes,
      driversRes,
    ] = await Promise.all([
      supabase.from('jobs').select('*', { count: 'exact', head: true }),
      supabase.from('jobs').select('*', { count: 'exact', head: true }).in('status', ['pending', 'assigned']),
      supabase.from('jobs').select('*', { count: 'exact', head: true }).eq('status', 'in_progress'),
      supabase.from('jobs').select('*', { count: 'exact', head: true }).eq('status', 'completed'),
      supabase.from('drivers').select('*', { count: 'exact', head: true }).eq('status', 'active'),
      supabase.from('bins').select('*', { count: 'exact', head: true }).eq('status', 'available'),
      supabase
        .from('jobs')
        .select('id, ticket_number, job_type, scheduled_date, status')
        .order('created_at', { ascending: false })
        .limit(8),
      supabase
        .from('drivers')
        .select('id, full_name, status')
        .order('created_at', { ascending: false })
        .limit(6),
    ])

    if (jobsRes.error || driversRes.error) {
      setErrorMessage(jobsRes.error?.message || driversRes.error?.message || 'Error loading data')
    }

    setStats({
      total: total.count || 0,
      open: open.count || 0,
      progress: progress.count || 0,
      completed: completed.count || 0,
      drivers: driversCount.count || 0,
      bins: binsCount.count || 0,
    })

    setRecentJobs((jobsRes.data as JobRow[]) || [])
    setDrivers((driversRes.data as DriverRow[]) || [])
    setLoading(false)
  }

  function badge(status: string | null) {
    switch ((status || '').toLowerCase()) {
      case 'completed':
        return 'bg-emerald-100 text-emerald-700'
      case 'in_progress':
        return 'bg-amber-100 text-amber-700'
      case 'assigned':
        return 'bg-blue-100 text-blue-700'
      default:
        return 'bg-gray-100 text-gray-700'
    }
  }

  return (
    <DashboardShell
      title="Admin Dashboard"
      subtitle="Operations overview and system activity"
      roleLabel="Administrator"
      userName={profile?.full_name || profile?.email || 'Admin'}
      navItems={navItems}
    >
      {errorMessage && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      )}

      {/* STATS */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        {[
          ['Total Jobs', stats.total],
          ['Open Jobs', stats.open],
          ['In Progress', stats.progress],
          ['Completed', stats.completed],
          ['Active Drivers', stats.drivers],
          ['Available Bins', stats.bins],
        ].map(([label, value]) => (
          <div
            key={String(label)}
            className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm hover:shadow-md transition"
          >
            <p className="text-sm text-slate-500">{label as string}</p>
            <p className="mt-2 text-3xl font-bold text-slate-900">
              {loading ? '...' : value}
            </p>
          </div>
        ))}
      </div>

      {/* MAIN GRID */}
      <div className="mt-8 grid gap-6 xl:grid-cols-2">
        {/* JOBS */}
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-semibold text-slate-900">Recent Jobs</h2>
            <button
              onClick={() => router.push('/jobs')}
              className="text-sm font-medium text-blue-600 hover:underline"
            >
              View all
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b">
                  <th className="pb-2">Ticket</th>
                  <th className="pb-2">Type</th>
                  <th className="pb-2">Date</th>
                  <th className="pb-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {recentJobs.map(job => (
                  <tr key={job.id} className="border-b last:border-0 hover:bg-slate-50">
                    <td className="py-3 font-medium text-slate-900">
                      {job.ticket_number}
                    </td>
                    <td>{job.job_type}</td>
                    <td>{job.scheduled_date}</td>
                    <td>
                      <span className={`px-3 py-1 text-xs font-semibold rounded-full ${badge(job.status)}`}>
                        {job.status}
                      </span>
                    </td>
                  </tr>
                ))}

                {!recentJobs.length && (
                  <tr>
                    <td colSpan={4} className="text-center py-6 text-slate-400">
                      No jobs available
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* DRIVERS */}
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900 mb-5">
            Drivers Overview
          </h2>

          <div className="space-y-3">
            {drivers.map(d => (
              <div
                key={d.id}
                className="flex items-center justify-between rounded-2xl border border-slate-200 px-4 py-3 hover:bg-slate-50 transition"
              >
                <span className="font-medium text-slate-900">
                  {d.full_name || 'Driver'}
                </span>

                <span
                  className={`text-sm font-semibold ${
                    d.status === 'active'
                      ? 'text-emerald-600'
                      : 'text-slate-400'
                  }`}
                >
                  {d.status}
                </span>
              </div>
            ))}

            {!drivers.length && (
              <p className="text-sm text-slate-400">No drivers found</p>
            )}
          </div>
        </div>
      </div>
    </DashboardShell>
  )
}