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

type BinRow = {
  id: string
  bin_number: string | null
  bin_type: string | null
  size: string | null
  status: string | null
  location: string | null
  notes: string | null
  created_at: string | null
}

type BinForm = {
  bin_number: string
  bin_type: string
  size: string
  status: string
  location: string
  notes: string
}

const emptyForm: BinForm = {
  bin_number: '',
  bin_type: '',
  size: '',
  status: 'available',
  location: '',
  notes: '',
}

export default function BinsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [bins, setBins] = useState<BinRow[]>([])
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingBinId, setEditingBinId] = useState<string | null>(null)
  const [form, setForm] = useState<BinForm>(emptyForm)

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
    await loadBins()
    setLoading(false)
  }

  async function loadBins() {
    const { data, error } = await supabase
      .from('bins')
      .select('id, bin_number, bin_type, size, status, location, notes, created_at')
      .order('created_at', { ascending: false })

    if (error) {
      setErrorMessage(error.message)
      return
    }

    setBins((data as BinRow[]) || [])
  }

  function resetForm() {
    setForm(emptyForm)
    setEditingBinId(null)
  }

  function openCreateModal() {
    resetForm()
    setIsModalOpen(true)
  }

  function openEditModal(bin: BinRow) {
    setForm({
      bin_number: bin.bin_number || '',
      bin_type: bin.bin_type || '',
      size: bin.size || '',
      status: bin.status || 'available',
      location: bin.location || '',
      notes: bin.notes || '',
    })
    setEditingBinId(bin.id)
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

    if (!form.bin_number.trim() || !form.bin_type.trim()) {
      setErrorMessage('Bin number and bin type are required.')
      setSaving(false)
      return
    }

    const payload = {
      bin_number: form.bin_number,
      bin_type: form.bin_type,
      size: form.size || null,
      status: form.status || 'available',
      location: form.location || null,
      notes: form.notes || null,
    }

    const response = editingBinId
      ? await supabase.from('bins').update(payload).eq('id', editingBinId)
      : await supabase.from('bins').insert([payload])

    if (response.error) {
      setErrorMessage(response.error.message)
      setSaving(false)
      return
    }

    setSuccessMessage(editingBinId ? 'Bin updated successfully.' : 'Bin created successfully.')
    await loadBins()
    closeModal()
    setSaving(false)
  }

  async function handleDelete(id: string) {
    if (profile?.role !== 'admin') {
      setErrorMessage('Only admin can delete bins.')
      return
    }

    if (!window.confirm('Delete this bin?')) return

    const { error } = await supabase.from('bins').delete().eq('id', id)
    if (error) {
      setErrorMessage(error.message)
      return
    }

    setSuccessMessage('Bin deleted successfully.')
    await loadBins()
  }

  const filteredBins = useMemo(() => {
    return bins.filter((bin) => {
      const matchesSearch =
        !search ||
        (bin.bin_number || '').toLowerCase().includes(search.toLowerCase()) ||
        (bin.bin_type || '').toLowerCase().includes(search.toLowerCase()) ||
        (bin.location || '').toLowerCase().includes(search.toLowerCase())

      const matchesStatus = statusFilter === 'all' || (bin.status || 'available').toLowerCase() === statusFilter.toLowerCase()
      return matchesSearch && matchesStatus
    })
  }, [bins, search, statusFilter])

  return (
    <DashboardShell
      title="Bins Management"
      subtitle="Dispatch and admin can maintain the bin inventory. Delete is admin-only."
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

      <div className="mb-6 grid gap-4 lg:grid-cols-4">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-sm text-slate-500">Total Bins</p><h2 className="mt-2 text-3xl font-bold text-slate-900">{bins.length}</h2></div>
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-sm text-slate-500">Available</p><h2 className="mt-2 text-3xl font-bold text-slate-900">{bins.filter((b) => (b.status || 'available') === 'available').length}</h2></div>
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-sm text-slate-500">Assigned</p><h2 className="mt-2 text-3xl font-bold text-slate-900">{bins.filter((b) => (b.status || '') === 'assigned').length}</h2></div>
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-sm text-slate-500">Maintenance</p><h2 className="mt-2 text-3xl font-bold text-slate-900">{bins.filter((b) => (b.status || '') === 'maintenance').length}</h2></div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-900">All Bins</h2>
            <p className="text-sm text-slate-500">Bin inventory and availability</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search bin, type, location..." className="rounded-2xl border border-slate-300 px-4 py-2.5 text-sm outline-none transition focus:border-slate-900" />
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-2xl border border-slate-300 px-4 py-2.5 text-sm outline-none transition focus:border-slate-900">
              <option value="all">All statuses</option>
              <option value="available">Available</option>
              <option value="assigned">Assigned</option>
              <option value="maintenance">Maintenance</option>
              <option value="inactive">Inactive</option>
            </select>
            <button onClick={openCreateModal} className="rounded-2xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800">+ New Bin</button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-left">
            <thead>
              <tr className="border-b border-slate-200 text-sm text-slate-500">
                <th className="px-4 py-3 font-medium">Bin Number</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Size</th>
                <th className="px-4 py-3 font-medium">Location</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredBins.map((bin) => (
                <tr key={bin.id} className="border-b border-slate-100 text-sm text-slate-700">
                  <td className="px-4 py-4 font-medium text-slate-900">{bin.bin_number || '—'}</td>
                  <td className="px-4 py-4">{bin.bin_type || '—'}</td>
                  <td className="px-4 py-4">{bin.size || '—'}</td>
                  <td className="px-4 py-4">{bin.location || '—'}</td>
                  <td className="px-4 py-4">{bin.status || 'available'}</td>
                  <td className="px-4 py-4">
                    <div className="flex gap-2">
                      <button onClick={() => openEditModal(bin)} className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100">Edit</button>
                      {profile?.role === 'admin' ? (
                        <button onClick={() => handleDelete(bin.id)} className="rounded-xl border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-100">Delete</button>
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
                <h3 className="text-2xl font-bold text-slate-900">{editingBinId ? 'Edit Bin' : 'New Bin'}</h3>
                <p className="text-sm text-slate-500">Bin record form</p>
              </div>
              <button onClick={closeModal} className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-100">Close</button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <input value={form.bin_number} onChange={(e) => setForm((prev) => ({ ...prev, bin_number: e.target.value }))} placeholder="Bin number" className="rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-slate-900" />
              <input value={form.bin_type} onChange={(e) => setForm((prev) => ({ ...prev, bin_type: e.target.value }))} placeholder="Bin type" className="rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-slate-900" />
              <input value={form.size} onChange={(e) => setForm((prev) => ({ ...prev, size: e.target.value }))} placeholder="Size" className="rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-slate-900" />
              <input value={form.location} onChange={(e) => setForm((prev) => ({ ...prev, location: e.target.value }))} placeholder="Location" className="rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-slate-900" />
              <select value={form.status} onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value }))} className="rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-slate-900 md:col-span-2">
                <option value="available">Available</option>
                <option value="assigned">Assigned</option>
                <option value="maintenance">Maintenance</option>
                <option value="inactive">Inactive</option>
              </select>
              <textarea value={form.notes} onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))} placeholder="Notes" rows={4} className="rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-slate-900 md:col-span-2" />
            </div>

            <div className="mt-5 flex gap-3">
              <button onClick={handleSave} disabled={saving} className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60">{saving ? 'Saving...' : editingBinId ? 'Update Bin' : 'Create Bin'}</button>
              <button onClick={closeModal} className="rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">Cancel</button>
            </div>
          </div>
        </div>
      ) : null}
    </DashboardShell>
  )
}
