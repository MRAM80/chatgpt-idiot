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
    loadPage()
  }, [])

  const loadPage = async () => {
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

    if (!['admin', 'dispatcher'].includes(profileData.role || '')) {
      router.push('/login')
      return
    }

    setProfile(profileData)
    await loadBins()
    setLoading(false)
  }

  const loadBins = async () => {
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

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const resetForm = () => {
    setForm(emptyForm)
    setEditingBinId(null)
  }

  const openCreateModal = () => {
    resetForm()
    setErrorMessage('')
    setSuccessMessage('')
    setIsModalOpen(true)
  }

  const openEditModal = (bin: BinRow) => {
    setForm({
      bin_number: bin.bin_number || '',
      bin_type: bin.bin_type || '',
      size: bin.size || '',
      status: bin.status || 'available',
      location: bin.location || '',
      notes: bin.notes || '',
    })
    setEditingBinId(bin.id)
    setErrorMessage('')
    setSuccessMessage('')
    setIsModalOpen(true)
  }

  const closeModal = () => {
    setIsModalOpen(false)
    resetForm()
  }

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  const handleSave = async () => {
    setSaving(true)
    setErrorMessage('')
    setSuccessMessage('')

    if (!form.bin_number || !form.bin_type) {
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

    if (editingBinId) {
      const { error } = await supabase
        .from('bins')
        .update(payload)
        .eq('id', editingBinId)

      if (error) {
        setErrorMessage(error.message)
        setSaving(false)
        return
      }

      setSuccessMessage('Bin updated successfully.')
    } else {
      const { error } = await supabase.from('bins').insert([payload])

      if (error) {
        setErrorMessage(error.message)
        setSaving(false)
        return
      }

      setSuccessMessage('Bin created successfully.')
    }

    await loadBins()
    setSaving(false)
    closeModal()
  }

  const handleDelete = async (id: string) => {
    const confirmed = window.confirm('Are you sure you want to delete this bin?')
    if (!confirmed) return

    setErrorMessage('')
    setSuccessMessage('')

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
        (bin.size || '').toLowerCase().includes(search.toLowerCase()) ||
        (bin.location || '').toLowerCase().includes(search.toLowerCase())

      const matchesStatus =
        statusFilter === 'all' ||
        (bin.status || 'available').toLowerCase() === statusFilter.toLowerCase()

      return matchesSearch && matchesStatus
    })
  }, [bins, search, statusFilter])

  const availableBins = bins.filter(
    (bin) => (bin.status || 'available').toLowerCase() === 'available'
  ).length

  const assignedBins = bins.filter(
    (bin) => (bin.status || '').toLowerCase() === 'assigned'
  ).length

  const maintenanceBins = bins.filter(
    (bin) => (bin.status || '').toLowerCase() === 'maintenance'
  ).length

  const getStatusClasses = (status: string | null) => {
    const value = (status || 'available').toLowerCase()

    if (value === 'available') {
      return 'bg-emerald-50 text-emerald-700 border border-emerald-200'
    }

    if (value === 'assigned') {
      return 'bg-amber-50 text-amber-700 border border-amber-200'
    }

    if (value === 'maintenance') {
      return 'bg-red-50 text-red-700 border border-red-200'
    }

    if (value === 'inactive') {
      return 'bg-slate-100 text-slate-700 border border-slate-200'
    }

    return 'bg-blue-50 text-blue-700 border border-blue-200'
  }

  const formatStatus = (status: string | null) => {
    if (!status) return 'Available'
    return status.replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  }

  if (loading) {
    return (
      <DashboardShell
        title="Bins Management"
        subtitle="Loading bins..."
        roleLabel={profile?.role || 'Operations'}
        userName={profile?.full_name || profile?.email || 'Loading...'}
      >
        <div className="grid gap-6">
          <div className="animate-pulse rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="h-6 w-40 rounded bg-slate-200" />
            <div className="mt-4 h-12 rounded bg-slate-100" />
            <div className="mt-3 h-12 rounded bg-slate-100" />
            <div className="mt-3 h-12 rounded bg-slate-100" />
          </div>
        </div>
      </DashboardShell>
    )
  }

  return (
    <DashboardShell
      title="Bins Management"
      subtitle="Create, update, and manage your inventory of bins."
      roleLabel={profile?.role === 'admin' ? 'Admin' : 'Dispatcher'}
      userName={profile?.full_name || profile?.email || 'User'}
    >
      {(errorMessage || successMessage) && (
        <div className="mb-6 space-y-3">
          {errorMessage && (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {errorMessage}
            </div>
          )}

          {successMessage && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {successMessage}
            </div>
          )}
        </div>
      )}

      <div className="mb-6 grid gap-4 lg:grid-cols-4">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Total Bins</p>
          <h2 className="mt-2 text-3xl font-bold text-slate-900">{bins.length}</h2>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Available</p>
          <h2 className="mt-2 text-3xl font-bold text-slate-900">{availableBins}</h2>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Assigned</p>
          <h2 className="mt-2 text-3xl font-bold text-slate-900">{assignedBins}</h2>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Maintenance</p>
          <h2 className="mt-2 text-3xl font-bold text-slate-900">{maintenanceBins}</h2>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-900">All Bins</h2>
            <p className="text-sm text-slate-500">
              Manage bin inventory and availability
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              type="text"
              placeholder="Search number, type, size, location..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="rounded-2xl border border-slate-300 px-4 py-2.5 text-sm outline-none transition focus:border-slate-900"
            />

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-2xl border border-slate-300 px-4 py-2.5 text-sm outline-none transition focus:border-slate-900"
            >
              <option value="all">All Statuses</option>
              <option value="available">Available</option>
              <option value="assigned">Assigned</option>
              <option value="maintenance">Maintenance</option>
              <option value="inactive">Inactive</option>
            </select>

            <button
              onClick={openCreateModal}
              className="rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
            >
              + New Bin
            </button>
          </div>
        </div>

        {filteredBins.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center">
            <p className="text-base font-semibold text-slate-700">No bins found</p>
            <p className="mt-2 text-sm text-slate-500">
              Create a new bin to start building inventory.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left">
              <thead>
                <tr className="border-b border-slate-200 text-sm text-slate-500">
                  <th className="px-4 py-3 font-medium">Bin Number</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">Size</th>
                  <th className="px-4 py-3 font-medium">Location</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Notes</th>
                  <th className="px-4 py-3 font-medium">Created</th>
                  <th className="px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredBins.map((bin) => (
                  <tr
                    key={bin.id}
                    className="border-b border-slate-100 text-sm text-slate-700"
                  >
                    <td className="px-4 py-4 font-medium text-slate-900">
                      {bin.bin_number || '—'}
                    </td>
                    <td className="px-4 py-4">{bin.bin_type || '—'}</td>
                    <td className="px-4 py-4">{bin.size || '—'}</td>
                    <td className="px-4 py-4">{bin.location || '—'}</td>
                    <td className="px-4 py-4">
                      <span
                        className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getStatusClasses(
                          bin.status
                        )}`}
                      >
                        {formatStatus(bin.status)}
                      </span>
                    </td>
                    <td className="max-w-[220px] px-4 py-4">
                      <span className="line-clamp-2">{bin.notes || '—'}</span>
                    </td>
                    <td className="px-4 py-4">
                      {bin.created_at
                        ? new Date(bin.created_at).toLocaleDateString()
                        : '—'}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex gap-2">
                        <button
                          onClick={() => openEditModal(bin)}
                          className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(bin.id)}
                          className="rounded-xl border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-100"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h3 className="text-2xl font-bold text-slate-900">
                  {editingBinId ? 'Edit Bin' : 'Create New Bin'}
                </h3>
                <p className="text-sm text-slate-500">
                  Fill in the bin details below
                </p>
              </div>

              <button
                onClick={closeModal}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-100"
              >
                Close
              </button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Bin Number
                </label>
                <input
                  name="bin_number"
                  value={form.bin_number}
                  onChange={handleChange}
                  className="w-full rounded-2xl border border-slate-300 px-4 py-2.5 outline-none transition focus:border-slate-900"
                  placeholder="BIN-001"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Bin Type
                </label>
                <input
                  name="bin_type"
                  value={form.bin_type}
                  onChange={handleChange}
                  className="w-full rounded-2xl border border-slate-300 px-4 py-2.5 outline-none transition focus:border-slate-900"
                  placeholder="Garbage, Recycling, Concrete..."
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Size
                </label>
                <input
                  name="size"
                  value={form.size}
                  onChange={handleChange}
                  className="w-full rounded-2xl border border-slate-300 px-4 py-2.5 outline-none transition focus:border-slate-900"
                  placeholder="10 yard, 14 yard, 20 yard..."
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Status
                </label>
                <select
                  name="status"
                  value={form.status}
                  onChange={handleChange}
                  className="w-full rounded-2xl border border-slate-300 px-4 py-2.5 outline-none transition focus:border-slate-900"
                >
                  <option value="available">Available</option>
                  <option value="assigned">Assigned</option>
                  <option value="maintenance">Maintenance</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Location
                </label>
                <input
                  name="location"
                  value={form.location}
                  onChange={handleChange}
                  className="w-full rounded-2xl border border-slate-300 px-4 py-2.5 outline-none transition focus:border-slate-900"
                  placeholder="Current yard or customer location"
                />
              </div>

              <div className="md:col-span-2">
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Notes
                </label>
                <textarea
                  name="notes"
                  value={form.notes}
                  onChange={handleChange}
                  rows={4}
                  className="w-full rounded-2xl border border-slate-300 px-4 py-2.5 outline-none transition focus:border-slate-900"
                  placeholder="Extra bin details..."
                />
              </div>
            </div>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button
                onClick={closeModal}
                className="rounded-2xl border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="rounded-2xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {saving ? 'Saving...' : editingBinId ? 'Update Bin' : 'Create Bin'}
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardShell>
  )
}