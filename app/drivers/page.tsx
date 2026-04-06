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
  phone: string | null
  email: string | null
  truck_number: string | null
  status: string | null
  created_at: string | null
}

type DriverForm = {
  full_name: string
  phone: string
  email: string
  truck_number: string
  status: string
}

const emptyForm: DriverForm = {
  full_name: '',
  phone: '',
  email: '',
  truck_number: '',
  status: 'active',
}

export default function DriversPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [drivers, setDrivers] = useState<DriverRow[]>([])
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingDriverId, setEditingDriverId] = useState<string | null>(null)
  const [form, setForm] = useState<DriverForm>(emptyForm)

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

    if (profileError || !profileData || !['admin', 'dispatcher'].includes(profileData.role || '')) {
      router.push('/login')
      return
    }

    setProfile(profileData)
    await loadDrivers()
    setLoading(false)
  }

  async function loadDrivers() {
    const { data, error } = await supabase
      .from('drivers')
      .select('id, full_name, phone, email, truck_number, status, created_at')
      .order('created_at', { ascending: false })

    if (error) {
      setErrorMessage(error.message)
      return
    }

    setDrivers((data as DriverRow[]) || [])
  }

  function resetForm() {
    setForm(emptyForm)
    setEditingDriverId(null)
  }

  function openCreateModal() {
    resetForm()
    setIsModalOpen(true)
  }

  function openEditModal(driver: DriverRow) {
    setForm({
      full_name: driver.full_name || '',
      phone: driver.phone || '',
      email: driver.email || '',
      truck_number: driver.truck_number || '',
      status: driver.status || 'active',
    })
    setEditingDriverId(driver.id)
    setIsModalOpen(true)
  }

  function closeModal() {
    setIsModalOpen(false)
    resetForm()
  }

  async function handleSave() {
    setSaving(true)
    setErrorMessage('')
    setSuccessMessage('')

    if (!form.full_name.trim()) {
      setErrorMessage('Driver name is required.')
      setSaving(false)
      return
    }

    const payload = {
      full_name: form.full_name,
      phone: form.phone || null,
      email: form.email || null,
      truck_number: form.truck_number || null,
      status: form.status || 'active',
    }

    const response = editingDriverId
      ? await supabase.from('drivers').update(payload).eq('id', editingDriverId)
      : await supabase.from('drivers').insert([payload])

    if (response.error) {
      setErrorMessage(response.error.message)
      setSaving(false)
      return
    }

    setSuccessMessage(editingDriverId ? 'Driver updated successfully.' : 'Driver created successfully.')
    await loadDrivers()
    closeModal()
    setSaving(false)
  }

  async function handleDelete(id: string) {
    if (profile?.role !== 'admin') {
      setErrorMessage('Only admin can delete drivers.')
      return
    }

    if (!window.confirm('Delete this driver?')) return

    const { error } = await supabase.from('drivers').delete().eq('id', id)
    if (error) {
      setErrorMessage(error.message)
      return
    }

    setSuccessMessage('Driver deleted successfully.')
    await loadDrivers()
  }

  const filteredDrivers = useMemo(() => {
    return drivers.filter((driver) => {
      const matchesSearch =
        !search ||
        (driver.full_name || '').toLowerCase().includes(search.toLowerCase()) ||
        (driver.email || '').toLowerCase().includes(search.toLowerCase()) ||
        (driver.phone || '').toLowerCase().includes(search.toLowerCase()) ||
        (driver.truck_number || '').toLowerCase().includes(search.toLowerCase())

      const matchesStatus = statusFilter === 'all' || (driver.status || 'active').toLowerCase() === statusFilter.toLowerCase()
      return matchesSearch && matchesStatus
    })
  }, [drivers, search, statusFilter])

  return (
    <DashboardShell
      title="Drivers Management"
      subtitle="Dispatch and admin can maintain driver records. Delete is admin-only."
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
      {(errorMessage || successMessage) && (
        <div className="mb-6 space-y-3">
          {errorMessage ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorMessage}</div> : null}
          {successMessage ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{successMessage}</div> : null}
        </div>
      )}

      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-sm text-slate-500">Total Drivers</p><h2 className="mt-2 text-3xl font-bold text-slate-900">{drivers.length}</h2></div>
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-sm text-slate-500">Active</p><h2 className="mt-2 text-3xl font-bold text-slate-900">{drivers.filter((d) => (d.status || 'active') === 'active').length}</h2></div>
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-sm text-slate-500">Inactive / Leave</p><h2 className="mt-2 text-3xl font-bold text-slate-900">{drivers.filter((d) => (d.status || 'active') !== 'active').length}</h2></div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-900">All Drivers</h2>
            <p className="text-sm text-slate-500">Operational driver records</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, email, truck..." className="rounded-2xl border border-slate-300 px-4 py-2.5 text-sm outline-none transition focus:border-slate-900" />
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-2xl border border-slate-300 px-4 py-2.5 text-sm outline-none transition focus:border-slate-900">
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="on_leave">On leave</option>
            </select>
            <button onClick={openCreateModal} className="rounded-2xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800">+ New Driver</button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-left">
            <thead>
              <tr className="border-b border-slate-200 text-sm text-slate-500">
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Phone</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Truck</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredDrivers.map((driver) => (
                <tr key={driver.id} className="border-b border-slate-100 text-sm text-slate-700">
                  <td className="px-4 py-4 font-medium text-slate-900">{driver.full_name || '—'}</td>
                  <td className="px-4 py-4">{driver.phone || '—'}</td>
                  <td className="px-4 py-4">{driver.email || '—'}</td>
                  <td className="px-4 py-4">{driver.truck_number || '—'}</td>
                  <td className="px-4 py-4">{driver.status || 'active'}</td>
                  <td className="px-4 py-4">
                    <div className="flex gap-2">
                      <button onClick={() => openEditModal(driver)} className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100">Edit</button>
                      {profile?.role === 'admin' ? (
                        <button onClick={() => handleDelete(driver.id)} className="rounded-xl border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-100">Delete</button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-2xl rounded-3xl bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h3 className="text-2xl font-bold text-slate-900">{editingDriverId ? 'Edit Driver' : 'New Driver'}</h3>
                <p className="text-sm text-slate-500">Driver record form</p>
              </div>
              <button onClick={closeModal} className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-100">Close</button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <input name="full_name" value={form.full_name} onChange={(e) => setForm((prev) => ({ ...prev, full_name: e.target.value }))} placeholder="Full name" className="rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-slate-900" />
              <input name="phone" value={form.phone} onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))} placeholder="Phone" className="rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-slate-900" />
              <input name="email" value={form.email} onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))} placeholder="Email" className="rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-slate-900" />
              <input name="truck_number" value={form.truck_number} onChange={(e) => setForm((prev) => ({ ...prev, truck_number: e.target.value }))} placeholder="Truck number" className="rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-slate-900" />
              <select name="status" value={form.status} onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value }))} className="rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-slate-900 md:col-span-2">
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="on_leave">On leave</option>
              </select>
            </div>

            <div className="mt-5 flex gap-3">
              <button onClick={handleSave} disabled={saving} className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60">{saving ? 'Saving...' : editingDriverId ? 'Update Driver' : 'Create Driver'}</button>
              <button onClick={closeModal} className="rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">Cancel</button>
            </div>
          </div>
        </div>
      ) : null}
    </DashboardShell>
  )
}
