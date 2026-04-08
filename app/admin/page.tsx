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
    void initialize()
  }, [])

  async function initialize() {
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
      .maybeSingle()

    if (profileError || !profileData) {
      router.push('/login')
      return
    }

    if (profileData.role !== 'admin') {
      if (profileData.role === 'dispatcher') {
        router.push('/dispatcher')
      } else {
        router.push('/login')
      }
      return
    }

    setProfile(profileData)
    await loadDashboard()
    setLoading(false)
  }

  useEffect(() => {
    const loadsChannel = supabase
      .channel('admin-loads')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'loads' }, () => {
        void loadDashboard()
      })
      .subscribe()

    const driversChannel = supabase
      .channel('admin-drivers')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'drivers' }, () => {
        void loadDashboard()
      })
      .subscribe()

    const binsChannel = supabase
      .channel('admin-bins')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bins' }, () => {
        void loadDashboard()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(loadsChannel)
      supabase.removeChannel(driversChannel)
      supabase.removeChannel(binsChannel)
    }
  }, [])

  async function loadDashboard() {
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
      supabase
        .from('loads')
        .select('*', { count: 'exact', head: true })
        .in('status', ['pending', 'assigned']),
      supabase
        .from('loads')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'in_progress'),
      supabase
        .from('loads')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'completed'),
      supabase
        .from('drivers')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active'),
      supabase
        .from('bins')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'available'),
      supabase
        .from('loads')
        .select('id, customer_name, service_date, status, driver_id, ticket_type')
        .order('created_at', { ascending: false })
        .limit(8),
      supabase
        .from('drivers')
        .select('id, full_name, status')
        .order('created_at', { ascending: false })
        .limit(6),
    ])

    const firstError =
      allTicketsRes.error ||
      openRes.error ||
      progressRes.error ||
      completedRes.error ||
      activeDriversRes.error ||
      binsRes.error ||
      recentRes.error ||
      driversRes.error

    if (firstError) {
      setErrorMessage(firstError.message)
    } else {
      setErrorMessage('')
    }

    setTotalTickets(allTicketsRes.count || 0)
    setOpenTickets(openRes.count || 0)
    setInProgressTickets(progressRes.count || 0)
    setCompletedTickets(completedRes.count || 0)
    setActiveDrivers(activeDriversRes.count || 0)
    setAvailableBins(binsRes.count || 0)
    setRecentTickets((recentRes.data as TicketRow[]) || [])
    setDriverRows((driversRes.data as DriverRow[]) || [])
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  function getStatusClasses(status: string | null) {
    switch ((status || '').toLowerCase()) {
      case 'completed':
        return 'border border-emerald-200 bg-emerald-50 text-emerald-700'
      case 'in_progress':
        return 'border border-amber-200 bg-amber-50 text-amber-700'
      case 'assigned':
        return 'border border-blue-200 bg-blue-50 text-blue-700'
      case 'cancelled':
        return 'border border-red-200 bg-red-50 text-red-700'
      default:
        return 'border border-slate-200 bg-slate-100 text-slate-700'
    }
  }

  if (loading) {
    return (
      <DashboardShell
        title="Admin Dashboard"
        subtitle="Full system control for tickets, drivers, bins, and dispatch visibility."
        roleLabel="Admin"
        userName={profile?.full_name || profile?.email || 'Admin'}
        navItems={navItems}
      >
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm text-slate-500">Loading dashboard...</p>
        </div>
      </DashboardShell>
    )
  }

  return (
    <DashboardShell
      title="Admin Dashboard"
      subtitle="Full system control for tickets, drivers, bins, and dispatch visibility."
      roleLabel="Admin"
      userName={profile?.full_name || profile?.email || 'Admin'}
      navItems={navItems}
    >
      <div className="mb-6 flex flex-wrap gap-3">
        <button
          onClick={() => router.push('/dispatcher')}
          className="rounded-2xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
        >
          Open dispatch window
        </button>
        <button
          onClick={() => router.push('/loads')}
          className="rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-50"
        >
          Manage tickets
        </button>
        <button
          onClick={() => router.push('/drivers')}
          className="rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-50"
        >
          Manage drivers
        </button>
        <button
          onClick={() => router.push('/bins')}
          className="rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-50"
        >
          Manage bins
        </button>
        <button
          onClick={handleLogout}
          className="rounded-2xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-700 transition hover:bg-red-100"
        >
          Logout
        </button>
      </div>

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
            <h2 className="mt-2 text-3xl font-bold text-slate-950">{value}</h2>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold text-slate-950">Recent Tickets</h2>
              <p className="mt-1 text-sm text-slate-500">
                Latest operational activity across the system.
              </p>
            </div>
            <button
              onClick={() => router.push('/loads')}
              className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-50"
            >
              View all
            </button>
          </div>

          <div className="mt-5 space-y-3">
            {recentTickets.map((ticket) => (
              <div
                key={ticket.id}
                className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-900">
                      {ticket.customer_name || 'No client'}
                    </p>
                    <p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-400">
                      {ticket.ticket_type || 'General ticket'}
                    </p>
                  </div>

                  <span
                    className={`inline-flex rounded-full px-3 py-1 text-[11px] font-semibold ${getStatusClasses(ticket.status)}`}
                  >
                    {ticket.status || 'pending'}
                  </span>
                </div>

                <div className="mt-4 grid gap-2 text-sm text-slate-600 sm:grid-cols-3">
                  <p>
                    <span className="font-medium text-slate-800">Date:</span>{' '}
                    {ticket.service_date || '—'}
                  </p>
                  <p>
                    <span className="font-medium text-slate-800">Driver:</span>{' '}
                    {ticket.driver_id || 'Unassigned'}
                  </p>
                  <p>
                    <span className="font-medium text-slate-800">Ticket ID:</span>{' '}
                    {ticket.id.slice(0, 8)}
                  </p>
                </div>
              </div>
            ))}

            {!recentTickets.length ? (
              <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">
                No tickets found yet.
              </div>
            ) : null}
          </div>
        </section>

        <aside className="space-y-4">
          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-bold text-slate-950">Driver Snapshot</h2>
            <p className="mt-1 text-sm text-slate-500">
              Quick view of the latest driver records.
            </p>

            <div className="mt-4 space-y-3">
              {driverRows.map((driver) => (
                <div
                  key={driver.id}
                  className="rounded-2xl border border-slate-200 px-4 py-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-slate-900">
                        {driver.full_name || 'Unnamed Driver'}
                      </p>
                      <p className="text-sm text-slate-500">ID: {driver.id.slice(0, 8)}</p>
                    </div>

                    <span
                      className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                        (driver.status || 'inactive') === 'active'
                          ? 'border border-emerald-200 bg-emerald-50 text-emerald-700'
                          : 'border border-slate-200 bg-slate-100 text-slate-700'
                      }`}
                    >
                      {driver.status || 'inactive'}
                    </span>
                  </div>
                </div>
              ))}

              {!driverRows.length ? (
                <p className="text-sm text-slate-500">No drivers found.</p>
              ) : null}
            </div>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-bold text-slate-950">Admin Notes</h2>
            <div className="mt-4 space-y-3 text-sm text-slate-600">
              <p className="rounded-2xl bg-slate-50 px-4 py-3">
                Use <span className="font-semibold text-slate-900">Tickets</span> to create,
                edit, and review work orders.
              </p>
              <p className="rounded-2xl bg-slate-50 px-4 py-3">
                Use <span className="font-semibold text-slate-900">Drivers</span> to manage the
                active team and assignments.
              </p>
              <p className="rounded-2xl bg-slate-50 px-4 py-3">
                Use <span className="font-semibold text-slate-900">Bins</span> to track available
                inventory for operations.
              </p>
            </div>
          </section>
        </aside>
      </div>
    </DashboardShell>
  )
}