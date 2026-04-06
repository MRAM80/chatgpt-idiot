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
  { href: '/loads', label: 'Tickets' },
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
    setTimeout(() => {
      void loadPage()
    }, 200)
  }, [])

  async function loadPage() {
    setLoading(true)
    setErrorMessage('')

    const {
      data: { session },
    } = await supabase.auth.getSession()
    const user = session?.user

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
      supabase.from('loads').select('*', { count: 'exact', head: true }),
      supabase.from('loads').select('*', { count: 'exact', head: true }).in('status', ['pending', 'assigned']),
      supabase.from('loads').select('*', { count: 'exact', head: true }).eq('status', 'in_progress'),
      supabase.from('loads').select('*', { count: 'exact', head: true }).eq('status', 'completed'),
      supabase.from('drivers').select('*', { count: 'exact', head: true }).eq('status', 'active'),
      supabase.from('bins').select('*', { count: 'exact', head: true }).eq('status', 'available'),
      supabase
        .from('loads')
        .select('id, customer_name, service_date, status, driver_id, ticket_type')
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
    setRecentTickets((recentRes.data as TicketRow[]) || [])
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
      case 'cancelled':
        return 'bg-red-50 text-red-700 border border-red-200'
      default:
        return 'bg-slate-100 text-slate-700 border border-slate-200'
    }
  }

  return (
    <DashboardShell
      title="Admin Dashboard"
      subtitle="Full system control for tickets, drivers, bins, and dispatch visibility."
      roleLabel="Admin"
      userName={profile?.full_name || profile?.email || 'Admin'}
      navItems={navItems}
    >
      {errorMessage ? (
        <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        {[
          ['Total Tickets', totalTickets],
          ['Open Tickets', openTickets],
          ['In Progress', inProgressTickets],
          ['Completed', completedTickets],
          ['Active Drivers', activeDrivers],
          ['Available Bins', availableBins],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">{label}</p>
            <h2 className="mt-2 text-3xl font-bold text-slate-950">{loading ? '...' : value}</h2>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.35fr_1fr]">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-950">Recent Tickets</h2>
              <p className="text-sm text-slate-500">Latest operational activity</p>
            </div>
            <button
              onClick={() => router.push('/loads')}
              className="rounded-2xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Open tickets
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
                {recentTickets.map((ticket) => (
                  <tr key={ticket.id} className="border-b border-slate-100 text-sm">
                    <td className="px-3 py-4 font-medium text-slate-900">{ticket.customer_name || 'No client'}</td>
                    <td className="px-3 py-4 text-slate-600">{ticket.ticket_type || 'General'}</td>
                    <td className="px-3 py-4 text-slate-600">{ticket.service_date || 'Not set'}</td>
                    <td className="px-3 py-4">
                      <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getStatusClasses(ticket.status)}`}>
                        {ticket.status || 'pending'}
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
            <h2 className="text-xl font-bold text-slate-950">Quick Access</h2>
            <div className="mt-4 grid gap-3">
              <button onClick={() => router.push('/dispatcher')} className="rounded-2xl bg-emerald-600 px-4 py-3 text-left text-sm font-semibold text-white transition hover:bg-emerald-700">Open dispatch window</button>
              <button onClick={() => router.push('/drivers')} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left text-sm font-semibold text-slate-800 transition hover:bg-slate-50">Manage drivers</button>
              <button onClick={() => router.push('/bins')} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left text-sm font-semibold text-slate-800 transition hover:bg-slate-50">Manage bins</button>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-bold text-slate-950">Driver Snapshot</h2>
            <div className="mt-4 space-y-3">
              {driverRows.map((driver) => (
                <div key={driver.id} className="flex items-center justify-between rounded-2xl border border-slate-200 px-4 py-3">
                  <span className="font-medium text-slate-900">{driver.full_name || 'Unnamed Driver'}</span>
                  <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${driver.status === 'active' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-700 border border-slate-200'}`}>
                    {driver.status || 'inactive'}
                  </span>
                </div>
              ))}
              {!driverRows.length ? <p className="text-sm text-slate-500">No drivers found.</p> : null}
            </div>
          </div>
        </section>
      </div>
    </DashboardShell>
  )
}
