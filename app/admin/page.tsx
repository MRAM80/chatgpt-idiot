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

type TicketRow = {
  id: string
  customer_name: string | null
  service_date: string | null
  status: string | null
  driver_id: string | null
  ticket_type: string | null
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

  const [totalTickets, setTotalTickets] = useState(0)
  const [openTickets, setOpenTickets] = useState(0)
  const [inProgressTickets, setInProgressTickets] = useState(0)
  const [completedTickets, setCompletedTickets] = useState(0)
  const [activeDrivers, setActiveDrivers] = useState(0)
  const [availableBins, setAvailableBins] = useState(0)
  const [recentTickets, setRecentTickets] = useState<TicketRow[]>([])
  const [driverRows, setDriverRows] = useState<DriverRow[]>([])

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
      allTicketsRes,
      openRes,
      progressRes,
      completedRes,
      activeDriversRes,
      binsRes,
      recentRes,
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
        .select('id, customer_name, scheduled_date, status, driver_id, job_type')
        .order('created_at', { ascending: false })
        .limit(8),
      supabase.from('drivers').select('id, full_name, status').order('created_at', { ascending: false }).limit(6),
    ])

    if (allTicketsRes.error || recentRes.error || driversRes.error) {
      setErrorMessage(allTicketsRes.error?.message || recentRes.error?.message || driversRes.error?.message || 'Could not load dashboard.')
    }

    setTotalTickets(allTicketsRes.count || 0)
    setOpenTickets(openRes.count || 0)
    setInProgressTickets(progressRes.count || 0)
    setCompletedTickets(completedRes.count || 0)
    setActiveDrivers(activeDriversRes.count || 0)
    setAvailableBins(binsRes.count || 0)
    setRecentTickets((recentRes.data as any[]) || [])
    setDriverRows((driversRes.data as DriverRow[]) || [])
    setLoading(false)
  }

  function getStatusClasses(status: string | null) {
    switch ((status || '').toLowerCase()) {
      case 'completed':
        return 'bg-emerald-50 text-emerald-700 border border-emerald-200'
      case 'in_progress':
        return 'bg-amber-50 text-amber-700 border border-amber-200'
      case 'assigned':
        return 'bg-blue-50 text-blue-700 border border-blue-200'
      default:
        return 'bg-slate-100 text-slate-700 border border-slate-200'
    }
  }

  return (
    <DashboardShell
      title="Admin Dashboard"
      subtitle="Full system control"
      roleLabel="Admin"
      userName={profile?.full_name || profile?.email || 'Admin'}
      navItems={navItems}
    >
      {errorMessage && (
        <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        {[
          ['Total Jobs', totalTickets],
          ['Open', openTickets],
          ['In Progress', inProgressTickets],
          ['Completed', completedTickets],
          ['Drivers', activeDrivers],
          ['Bins', availableBins],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">{label as string}</p>
            <h2 className="mt-2 text-3xl font-bold text-slate-950">{loading ? '...' : value}</h2>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.35fr_1fr]">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-xl font-bold text-slate-950">Recent Jobs</h2>
            <button onClick={() => router.push('/jobs')} className="rounded-2xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white">
              Open Jobs
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-left">
              <thead>
                <tr className="border-b border-slate-200 text-sm text-slate-500">
                  <th className="px-3 py-3 font-semibold">Client</th>
                  <th className="px-3 py-3 font-semibold">Type</th>
                  <th className="px-3 py-3 font-semibold">Date</th>
                  <th className="px-3 py-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {recentTickets.map((job: any) => (
                  <tr key={job.id} className="border-b border-slate-100 text-sm">
                    <td className="px-3 py-4">{job.customer_name || 'No client'}</td>
                    <td className="px-3 py-4">{job.job_type || '-'}</td>
                    <td className="px-3 py-4">{job.scheduled_date || '-'}</td>
                    <td className="px-3 py-4">
                      <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getStatusClasses(job.status)}`}>
                        {job.status || 'pending'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="space-y-6">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-bold text-slate-950">Drivers</h2>
            <div className="mt-4 space-y-3">
              {driverRows.map((driver) => (
                <div key={driver.id} className="flex justify-between">
                  <span>{driver.full_name || 'Driver'}</span>
                  <span>{driver.status}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </DashboardShell>
  )
}