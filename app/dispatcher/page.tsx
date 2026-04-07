'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import DashboardShell from '@/components/dashboard-shell'
import { supabase } from '@/lib/supabase'

type Profile = {
  id: string
  email: string | null
  role: string | null
}

type LoadRow = {
  id: string
  customer_name: string | null
  pickup_address: string | null
  dropoff_address: string | null
  service_date: string | null
  status: string | null
  driver_id: string | null
  ticket_type: string | null
  priority: string | null
}

type DriverRow = {
  id: string
  full_name: string | null
  truck_number: string | null
  status: string | null
}

const navItems = [
  { href: '/dispatcher', label: 'Dispatch Window' },
  { href: '/loads', label: 'Tickets' },
  { href: '/drivers', label: 'Drivers' },
  { href: '/bins', label: 'Bins' },
]

export default function DispatcherPage() {
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [tickets, setTickets] = useState<LoadRow[]>([])
  const [drivers, setDrivers] = useState<DriverRow[]>([])
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [driverFilter, setDriverFilter] = useState('all')

  useEffect(() => {
    void initialize()
  }, [])

  async function initialize() {
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

    if (profileError || !profileData || !['admin', 'dispatcher'].includes(profileData.role || '')) {
      router.push('/login')
      return
    }

    setProfile(profileData)
    await Promise.all([loadTickets(), loadDrivers()])
    setLoading(false)

    const loadsChannel = supabase
      .channel('dispatcher-loads')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'loads' }, () => {
        void loadTickets()
      })
      .subscribe()

    const driversChannel = supabase
      .channel('dispatcher-drivers')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'drivers' }, () => {
        void loadDrivers()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(loadsChannel)
      supabase.removeChannel(driversChannel)
    }
  }

  async function loadTickets() {
    const { data, error } = await supabase
      .from('loads')
      .select('id, customer_name, pickup_address, dropoff_address, service_date, status, driver_id, ticket_type, priority')
      .order('service_date', { ascending: true })
      .order('created_at', { ascending: false })

    if (error) {
      setErrorMessage(error.message)
      return
    }

    setTickets((data as LoadRow[]) || [])
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
    const { error } = await supabase
      .from('loads')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id)

    if (error) {
      setErrorMessage(error.message)
      return
    }

    await loadTickets()
  }

  const visibleTickets = useMemo(() => {
    if (driverFilter === 'all') return tickets
    if (driverFilter === 'unassigned') return tickets.filter((ticket) => !ticket.driver_id)
    return tickets.filter((ticket) => ticket.driver_id === driverFilter)
  }, [tickets, driverFilter])

  const pendingTickets = visibleTickets.filter((t) => ['pending', 'assigned'].includes((t.status || 'pending').toLowerCase()))
  const progressTickets = visibleTickets.filter((t) => (t.status || '').toLowerCase() === 'in_progress')
  const completedTickets = visibleTickets.filter((t) => (t.status || '').toLowerCase() === 'completed')

  function driverName(id: string | null) {
    if (!id) return 'Unassigned'
    const driver = drivers.find((item) => item.id === id)
    return driver?.full_name || 'Unassigned'
  }

  function priorityClasses(value: string | null) {
    switch ((value || '').toLowerCase()) {
      case 'high':
        return 'bg-red-50 text-red-700 border border-red-200'
      case 'medium':
        return 'bg-amber-50 text-amber-700 border border-amber-200'
      default:
        return 'bg-slate-100 text-slate-700 border border-slate-200'
    }
  }

  return (
    <DashboardShell
      title="Dispatch Window"
      subtitle="Live operation board for tickets, driver flow, and quick status movement."
      roleLabel={profile?.role === 'admin' ? 'Admin' : 'Dispatcher'}
      userName={profile?.email || 'Dispatcher'}
      navItems={navItems}
    >
      {errorMessage ? (
        <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorMessage}</div>
      ) : null}

      <div className="mb-6 grid gap-4 xl:grid-cols-[1fr_360px]">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-950">Flow Board</h2>
              <p className="text-sm text-slate-500">Watch tickets move from pending to completion.</p>
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
                  <option key={driver.id} value={driver.id}>{driver.full_name || 'Unnamed Driver'}</option>
                ))}
              </select>

              <button onClick={() => router.push('/loads')} className="rounded-2xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800">
                Open ticket desk
              </button>
            </div>
          </div>

          <div className="mt-6 grid gap-4 xl:grid-cols-3">
            {([
              ['Pending / Assigned', pendingTickets],
              ['In Progress', progressTickets],
              ['Completed', completedTickets],
            ] as [string, LoadRow[]][]).map(([label, list]) => (
              <div key={String(label)} className="rounded-3xl bg-slate-50 p-4">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="font-bold text-slate-900">{label}</h3>
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600">{Array.isArray(list) ? list.length : 0}</span>
                </div>

                <div className="space-y-3">
                  {(list as LoadRow[]).map((ticket) => (
                    <div key={ticket.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-slate-900">{ticket.customer_name || 'No client'}</p>
                          <p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-400">{ticket.ticket_type || 'General ticket'}</p>
                        </div>
                        <span className={`inline-flex rounded-full px-3 py-1 text-[11px] font-semibold ${priorityClasses(ticket.priority)}`}>
                          {ticket.priority || 'low'}
                        </span>
                      </div>

                      <div className="mt-4 space-y-1.5 text-sm text-slate-600">
                        <p><span className="font-medium text-slate-800">Pickup:</span> {ticket.pickup_address || '—'}</p>
                        <p><span className="font-medium text-slate-800">Dropoff:</span> {ticket.dropoff_address || '—'}</p>
                        <p><span className="font-medium text-slate-800">Driver:</span> {driverName(ticket.driver_id)}</p>
                        <p><span className="font-medium text-slate-800">Date:</span> {ticket.service_date || '—'}</p>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        {(ticket.status || 'pending') !== 'assigned' ? (
                          <button onClick={() => quickMove(ticket.id, 'assigned')} className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700">Assign</button>
                        ) : null}
                        {(ticket.status || 'pending') !== 'in_progress' ? (
                          <button onClick={() => quickMove(ticket.id, 'in_progress')} className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">Start</button>
                        ) : null}
                        {(ticket.status || 'pending') !== 'completed' ? (
                          <button onClick={() => quickMove(ticket.id, 'completed')} className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">Complete</button>
                        ) : null}
                      </div>
                    </div>
                  ))}

                  {!(list as LoadRow[]).length ? (
                    <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-500">
                      No tickets in this stage.
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
                      <p className="font-medium text-slate-900">{driver.full_name || 'Unnamed Driver'}</p>
                      <p className="text-sm text-slate-500">Truck: {driver.truck_number || '—'}</p>
                    </div>
                    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${(driver.status || 'inactive') === 'active' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-700 border border-slate-200'}`}>
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
              <button onClick={() => router.push('/drivers')} className="rounded-2xl border border-slate-200 px-4 py-3 text-left text-sm font-semibold text-slate-800 transition hover:bg-slate-50">Manage drivers</button>
              <button onClick={() => router.push('/bins')} className="rounded-2xl border border-slate-200 px-4 py-3 text-left text-sm font-semibold text-slate-800 transition hover:bg-slate-50">Manage bins</button>
              <button onClick={() => router.push('/loads')} className="rounded-2xl bg-emerald-600 px-4 py-3 text-left text-sm font-semibold text-white transition hover:bg-emerald-700">Create or edit tickets</button>
            </div>
          </section>
        </aside>
      </div>
    </DashboardShell>
  )
}
