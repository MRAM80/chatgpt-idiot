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
    await loadDrivers()
    setLoading(false)
  }

  const loadDrivers = async () => {
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

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const resetForm = () => {
    setForm(emptyForm)
    setEditingDriverId(null)
  }

  const openCreateModal = () => {
    resetForm()
    setErrorMessage('')
    setSuccessMessage('')
    setIsModalOpen(true)
  }

  const openEditModal = (driver: DriverRow) => {
    setForm({
      full_name: driver.full_name || '',
      phone: driver.phone || '',
      email: driver.email || '',
      truck_number: driver.truck_number || '',
      status: driver.status || 'active',
    })
    setEditingDriverId(driver.id)
    setErrorMessage('')
    setSuccessMessage('')
    setIsModalOpen(true)
  }

  const closeModal = () => {
    setIsModalOpen(false)
    resetForm()
  }

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  const handleSave = async () => {
    setSaving(true)
    setErrorMessage('')
    setSuccessMessage('')

    if (!form.full_name) {
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

    if (editingDriverId) {
      const { error } = await supabase
        .from('drivers')
        .update(payload)
        .eq('id', editingDriverId)

      if (error) {
        setErrorMessage(error.message)
        setSaving(false)
        return
      }

      setSuccessMessage('Driver updated successfully.')
    } else {
      const { error } = await supabase.from('drivers').insert([payload])

      if (error) {
        setErrorMessage(error.message)
        setSaving(false)
        return
      }

      setSuccessMessage('Driver created successfully.')
    }

    await loadDrivers()
    setSaving(false)
    closeModal()
  }

  const handleDelete = async (id: string) => {
    const confirmed = window.confirm('Are you sure you want to delete this driver?')
    if (!confirmed) return

    setErrorMessage('')
    setSuccessMessage('')

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

      const matchesStatus =
        statusFilter === 'all' ||
        (driver.status || 'active').toLowerCase() === statusFilter.toLowerCase()

      return matchesSearch && matchesStatus
    })
  }, [drivers, search, statusFilter])

  const activeDrivers = drivers.filter(
    (driver) => (driver.status || 'active').toLowerCase() === 'active'
  ).length

  const inactiveDrivers = drivers.filter(
    (driver) => (driver.status || '').toLowerCase() === 'inactive'
  ).length

  const getStatusClasses = (status: string | null) => {
    const value = (status || 'active').toLowerCase()

    if (value === 'active') {
      return 'bg-emerald-50 text-emerald-700 border border-emerald-200'
    }

    if (value === 'inactive') {
      return 'bg-slate-100 text-slate-700 border border-slate-200'
    }

    if (value === 'on_leave') {
      return 'bg-amber-50 text-amber-700 border border-amber-200'
    }

    return 'bg-blue-50 text-blue-700 border border-blue-200'
  }

  const formatStatus = (status: string | null) => {
    if (!status) return 'Active'
    return status.replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  }

  if (loading) {
    return (
      <DashboardShell
        title="Drivers Management"
        subtitle="Loading drivers..."
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
      title="Drivers Management"
      subtitle="Create, update, and manage your driver team."
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

      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Total Drivers</p>
          <h2 className="mt-2 text-3xl font-bold text-slate-900">{drivers.length}</h2>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Active Drivers</p>
          <h2 className="mt-2 text-3xl font-bold text-slate-900">{activeDrivers}</h2>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Inactive Drivers</p>
          <h2 className="mt-2 text-3xl font-bold text-slate-900">{inactiveDrivers}</h2>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-900">All Drivers</h2>
            <p className="text-sm text-slate-500">
              Manage driver records and availability
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              type="text"
              placeholder="Search name, email, phone, truck..."
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
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="on_leave">On Leave</option>
            </select>

            <button
              onClick={openCreateModal}
              className="rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
            >
              + New Driver
            </button>
          </div>
        </div>

        {filteredDrivers.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center">
            <p className="text-base font-semibold text-slate-700">No drivers found</p>
            <p className="mt-2 text-sm text-slate-500">
              Create a new driver to start building your team.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left">
              <thead>
                <tr className="border-b border-slate-200 text-sm text-slate-500">
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Phone</th>
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">Truck</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Created</th>
                  <th className="px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredDrivers.map((driver) => (
                  <tr
                    key={driver.id}
                    className="border-b border-slate-100 text-sm text-slate-700"
                  >
                    <td className="px-4 py-4 font-medium text-slate-900">
                      {driver.full_name || '—'}
                    </td>
                    <td className="px-4 py-4">{driver.phone || '—'}</td>
                    <td className="px-4 py-4">{driver.email || '—'}</td>
                    <td className="px-4 py-4">{driver.truck_number || '—'}</td>
                    <td className="px-4 py-4">
                      <span
                        className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getStatusClasses(
                          driver.status
                        )}`}
                      >
                        {formatStatus(driver.status)}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      {driver.created_at
                        ? new Date(driver.created_at).toLocaleDateString()
                        : '—'}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex gap-2">
                        <button
                          onClick={() => openEditModal(driver)}
                          className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(driver.id)}
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
                  {editingDriverId ? 'Edit Driver' : 'Create New Driver'}
                </h3>
                <p className="text-sm text-slate-500">
                  Fill in the driver details below
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
                  Full Name
                </label>
                <input
                  name="full_name"
                  value={form.full_name}
                  onChange={handleChange}
                  className="w-full rounded-2xl border border-slate-300 px-4 py-2.5 outline-none transition focus:border-slate-900"
                  placeholder="Driver full name"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Phone
                </label>
                <input
                  name="phone"
                  value={form.phone}
                  onChange={handleChange}
                  className="w-full rounded-2xl border border-slate-300 px-4 py-2.5 outline-none transition focus:border-slate-900"
                  placeholder="Phone number"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Email
                </label>
                <input
                  name="email"
                  value={form.email}
                  onChange={handleChange}
                  className="w-full rounded-2xl border border-slate-300 px-4 py-2.5 outline-none transition focus:border-slate-900"
                  placeholder="Email address"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Truck Number
                </label>
                <input
                  name="truck_number"
                  value={form.truck_number}
                  onChange={handleChange}
                  className="w-full rounded-2xl border border-slate-300 px-4 py-2.5 outline-none transition focus:border-slate-900"
                  placeholder="Truck number"
                />
              </div>

              <div className="md:col-span-2">
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Status
                </label>
                <select
                  name="status"
                  value={form.status}
                  onChange={handleChange}
                  className="w-full rounded-2xl border border-slate-300 px-4 py-2.5 outline-none transition focus:border-slate-900"
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="on_leave">On Leave</option>
                </select>
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
                {saving
                  ? 'Saving...'
                  : editingDriverId
                  ? 'Update Driver'
                  : 'Create Driver'}
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardShell>
  )
}