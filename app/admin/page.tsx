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
        return 'bg-green-100 text-green-700'
      case 'in_progress':
        return 'bg-yellow-100 text-yellow-700'
      case 'assigned':
        return 'bg-blue-100 text-blue-700'
      default:
        return 'bg-gray-100 text-gray-700'
    }
  }

  return (
    <DashboardShell
      title="Admin Dashboard"
      subtitle="System overview"
      roleLabel="Admin"
      userName={profile?.full_name || profile?.email || 'Admin'}
      navItems={navItems}
    >
      {errorMessage && <div className="mb-4 text-red-600">{errorMessage}</div>}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        {[
          ['Total', stats.total],
          ['Open', stats.open],
          ['In Progress', stats.progress],
          ['Completed', stats.completed],
          ['Drivers', stats.drivers],
          ['Bins', stats.bins],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-2xl bg-white p-4 shadow">
            <p className="text-sm text-gray-500">{label as string}</p>
            <p className="text-2xl font-bold">{loading ? '...' : value}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <div className="bg-white p-6 rounded-2xl shadow">
          <div className="flex justify-between mb-4">
            <h2 className="font-bold text-lg">Recent Jobs</h2>
            <button onClick={() => router.push('/jobs')} className="text-sm text-blue-600">View all</button>
          </div>

          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500">
                <th>Ticket</th>
                <th>Type</th>
                <th>Date</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {recentJobs.map(job => (
                <tr key={job.id} className="border-t">
                  <td>{job.ticket_number}</td>
                  <td>{job.job_type}</td>
                  <td>{job.scheduled_date}</td>
                  <td>
                    <span className={`px-2 py-1 rounded ${badge(job.status)}`}>
                      {job.status}
                    </span>
                  </td>
                </tr>
              ))}
              {!recentJobs.length && (
                <tr>
                  <td colSpan={4} className="text-center py-4 text-gray-400">No data</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow">
          <h2 className="font-bold text-lg mb-4">Drivers</h2>
          <div className="space-y-3">
            {drivers.map(d => (
              <div key={d.id} className="flex justify-between border p-3 rounded-xl">
                <span>{d.full_name || 'Driver'}</span>
                <span className={d.status === 'active' ? 'text-green-600' : 'text-gray-400'}>
                  {d.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </DashboardShell>
  )
}