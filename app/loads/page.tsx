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

type LoadItem = {
  id: string
  customer_name: string | null
  customer_phone: string | null
  pickup_address: string | null
  dropoff_address: string | null
  service_date: string | null
  status: string | null
  driver_id: string | null
  bin_id: string | null
  notes: string | null
  ticket_type: string | null
  priority: string | null
  created_at: string | null
}

type DriverItem = {
  id: string
  full_name: string | null
}

type BinItem = {
  id: string
  bin_number: string | null
}

const statusOptions = ['pending', 'assigned', 'in_progress', 'completed', 'cancelled']
const typeOptions = ['delivery', 'pickup', 'dump_return']
const priorityOptions = ['low', 'medium', 'high']

const defaultForm = {
  customer_name: '',
  customer_phone: '',
  pickup_address: '',
  dropoff_address: '',
  service_date: '',
  status: 'pending',
  driver_id: '',
  bin_id: '',
  ticket_type: 'delivery',
  priority: 'medium',
  notes: '',
}

export default function LoadsPage() {
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loads, setLoads] = useState<LoadItem[]>([])
  const [drivers, setDrivers] = useState<DriverItem[]>([])
  const [bins, setBins] = useState<BinItem[]>([])
  const [form, setForm] = useState(defaultForm)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  useEffect(() => {
    void loadPageData()
  }, [])

  async function loadPageData() {
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

    if (profileError || !profileData || !['admin', 'dispatcher'].includes(profileData.role || '')) {
      router.push('/login')
      return
    }

    setProfile(profileData)
    await Promise.all([fetchLoads(), fetchDrivers(), fetchBins()])
    setLoading(false)
  }

  async function fetchLoads() {
    const { data, error } = await supabase
      .from('loads')
      .select('id, customer_name, customer_phone, pickup_address, dropoff_address, service_date, status, driver_id, bin_id, notes, ticket_type, priority, created_at')
      .order('created_at', { ascending: false })

    if (error) {
      setErrorMessage(error.message)
      return
    }

    setLoads((data as LoadItem[]) || [])
  }

  async function fetchDrivers() {
    const { data } = await supabase.from('drivers').select('id, full_name').order('created_at', { ascending: false })
    setDrivers((data as DriverItem[]) || [])
  }

  async function fetchBins() {
    const { data } = await supabase.from('bins').select('id, bin_number').order('created_at', { ascending: false })
    setBins((data as BinItem[]) || [])
  }

  function resetForm() {
    setForm(defaultForm)
    setEditingId(null)
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setErrorMessage('')
    setSuccessMessage('')

    if (!form.customer_name.trim()) {
      setErrorMessage('Client name is required.')
      setSaving(false)
      return
    }

    const payload = {
      customer_name: form.customer_name || null,
      customer_phone: form.customer_phone || null,
      pickup_address: form.pickup_address || null,
      dropoff_address: form.dropoff_address || null,
      service_date: form.service_date || null,
      status: form.status || 'pending',
      driver_id: form.driver_id || null,
      bin_id: form.bin_id || null,
      ticket_type: form.ticket_type || 'delivery',
      priority: form.priority || 'medium',
      notes: form.notes || null,
      updated_at: new Date().toISOString(),
    }

    const response = editingId
      ? await supabase.from('loads').update(payload).eq('id', editingId)
      : await supabase.from('loads').insert([payload])

    if (response.error) {
      setErrorMessage(response.error.message)
      setSaving(false)
      return
    }

    setSuccessMessage(editingId ? 'Ticket updated successfully.' : 'Ticket created successfully.')
    resetForm()
    await fetchLoads()
    setSaving(false)
  }

  function handleEdit(load: LoadItem) {
    setEditingId(load.id)
    setForm({
      customer_name: load.customer_name || '',
      customer_phone: load.customer_phone || '',
      pickup_address: load.pickup_address || '',
      dropoff_address: load.dropoff_address || '',
      service_date: load.service_date || '',
      status: load.status || 'pending',
      driver_id: load.driver_id || '',
      bin_id: load.bin_id || '',
      ticket_type: load.ticket_type || 'delivery',
      priority: load.priority || 'medium',
      notes: load.notes || '',
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function handleDelete(id: string) {
    if (profile?.role !== 'admin') {
      setErrorMessage('Only admin can delete tickets.')
      return
    }

    if (!window.confirm('Delete this ticket?')) return

    const { error } = await supabase.from('loads').delete().eq('id', id)
    if (error) {
      setErrorMessage(error.message)
      return
    }

    setSuccessMessage('Ticket deleted successfully.')
    await fetchLoads()
  }

  const filteredLoads = useMemo(() => {
    return loads.filter((load) => {
      const term = search.trim().toLowerCase()
      const matchesSearch =
        !term ||
        (load.customer_name || '').toLowerCase().includes(term) ||
        (load.customer_phone || '').toLowerCase().includes(term) ||
        (load.pickup_address || '').toLowerCase().includes(term) ||
        (load.dropoff_address || '').toLowerCase().includes(term) ||
        (load.ticket_type || '').toLowerCase().includes(term)

      const matchesStatus = statusFilter === 'all' || (load.status || 'pending').toLowerCase() === statusFilter.toLowerCase()
      return matchesSearch && matchesStatus
    })
  }, [loads, search, statusFilter])

  function getDriverName(driverId: string | null) {
    if (!driverId) return 'Unassigned'
    const driver = drivers.find((item) => item.id === driverId)
    return driver?.full_name || 'Unassigned'
  }

  return (
    <DashboardShell
      title="Ticket Desk"
      subtitle="Create and manage delivery, pickup, and dump return tickets."
      roleLabel={profile?.role === 'admin' ? 'Admin' : 'Dispatcher'}
      userName={profile?.full_name || profile?.email || 'User'}
      navItems={profile?.role === 'admin'
        ? [
            { href: '/admin', label: 'Dashboard' },
            { href: '/dispatcher', label: 'Dispatch Window' },
            { href: '/loads', label: 'Tickets' },
            { href: '/drivers', label: 'Drivers' },
            { href: '/bins', label: 'Bins' },
          ]
        : [
            { href: '/dispatcher', label: 'Dispatch Window' },
            { href: '/loads', label: 'Tickets' },
            { href: '/drivers', label: 'Drivers' },
            { href: '/bins', label: 'Bins' },
          ]}
    >
      <div className="space-y-6">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-emerald-600">Operation tickets</p>
              <h1 className="text-2xl font-bold text-slate-900">{editingId ? 'Edit Ticket' : 'Create New Ticket'}</h1>
            </div>
            {editingId ? <button onClick={resetForm} className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">Cancel Edit</button> : null}
          </div>

          {errorMessage ? <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{errorMessage}</div> : null}
          {successMessage ? <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{successMessage}</div> : null}

          <form onSubmit={handleSave} className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            <input name="customer_name" value={form.customer_name} onChange={handleChange} placeholder="Client name" className="rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-slate-400" />
            <input name="customer_phone" value={form.customer_phone} onChange={handleChange} placeholder="Client phone" className="rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-slate-400" />
            <input type="date" name="service_date" value={form.service_date} onChange={handleChange} className="rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-slate-400" />
            <select name="ticket_type" value={form.ticket_type} onChange={handleChange} className="rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-slate-400">{typeOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select>
            <select name="priority" value={form.priority} onChange={handleChange} className="rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-slate-400">{priorityOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select>
            <select name="status" value={form.status} onChange={handleChange} className="rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-slate-400">{statusOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select>
            <input name="pickup_address" value={form.pickup_address} onChange={handleChange} placeholder="Pickup address" className="rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-slate-400 xl:col-span-2" />
            <input name="dropoff_address" value={form.dropoff_address} onChange={handleChange} placeholder="Dropoff address" className="rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-slate-400" />
            <select name="driver_id" value={form.driver_id} onChange={handleChange} className="rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-slate-400">
              <option value="">Unassigned driver</option>
              {drivers.map((driver) => <option key={driver.id} value={driver.id}>{driver.full_name || 'Unnamed Driver'}</option>)}
            </select>
            <select name="bin_id" value={form.bin_id} onChange={handleChange} className="rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-slate-400">
              <option value="">Unassigned bin</option>
              {bins.map((bin) => <option key={bin.id} value={bin.id}>{bin.bin_number || 'Unnamed Bin'}</option>)}
            </select>
            <textarea name="notes" value={form.notes} onChange={handleChange} placeholder="Notes" rows={4} className="rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-slate-400 md:col-span-2 xl:col-span-3" />
            <div className="md:col-span-2 xl:col-span-3 flex flex-col gap-3 sm:flex-row">
              <button type="submit" disabled={saving} className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60">{saving ? 'Saving...' : editingId ? 'Update Ticket' : 'Create Ticket'}</button>
              <button type="button" onClick={resetForm} className="rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">Clear Form</button>
            </div>
          </form>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-900">All Tickets</h2>
              <p className="text-sm text-slate-500">Search and manage operational tickets.</p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search tickets..." className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-slate-400" />
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-slate-400">
                <option value="all">All statuses</option>
                {statusOptions.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </div>
          </div>

          {loading ? (
            <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">Loading tickets...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left">
                <thead>
                  <tr className="border-b border-slate-200 text-sm text-slate-500">
                    <th className="px-3 py-3 font-semibold">Client</th>
                    <th className="px-3 py-3 font-semibold">Type</th>
                    <th className="px-3 py-3 font-semibold">Priority</th>
                    <th className="px-3 py-3 font-semibold">Date</th>
                    <th className="px-3 py-3 font-semibold">Status</th>
                    <th className="px-3 py-3 font-semibold">Driver</th>
                    <th className="px-3 py-3 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLoads.map((load) => (
                    <tr key={load.id} className="border-b border-slate-100 text-sm">
                      <td className="px-3 py-4 font-medium text-slate-900">{load.customer_name || 'No client'}</td>
                      <td className="px-3 py-4 text-slate-700">{load.ticket_type || 'delivery'}</td>
                      <td className="px-3 py-4 text-slate-700">{load.priority || 'low'}</td>
                      <td className="px-3 py-4 text-slate-700">{load.service_date || '—'}</td>
                      <td className="px-3 py-4 text-slate-700">{load.status || 'pending'}</td>
                      <td className="px-3 py-4 text-slate-700">{getDriverName(load.driver_id)}</td>
                      <td className="px-3 py-4">
                        <div className="flex gap-2">
                          <button onClick={() => handleEdit(load)} className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100">Edit</button>
                          {profile?.role === 'admin' ? <button onClick={() => handleDelete(load.id)} className="rounded-xl border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-100">Delete</button> : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </DashboardShell>
  )
}
