'use client'

import { useEffect, useMemo, useState } from 'react'
import DashboardShell from '@/components/dashboard-shell'
import { supabase } from '@/lib/supabase'

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
  created_at: string | null
}

type DriverItem = {
  id: string
  full_name: string | null
  name?: string | null
}

type BinItem = {
  id: string
  bin_number: string | null
  name?: string | null
  status: string | null
}

const statusOptions = [
  'pending',
  'assigned',
  'in_progress',
  'completed',
  'cancelled',
]

const defaultForm = {
  customer_name: '',
  customer_phone: '',
  pickup_address: '',
  dropoff_address: '',
  service_date: '',
  status: 'pending',
  driver_id: '',
  bin_id: '',
  notes: '',
}

export default function LoadsPage() {
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

  async function fetchLoads() {
    const { data, error } = await supabase
      .from('loads')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      setErrorMessage(error.message)
      return
    }

    setLoads((data as LoadItem[]) || [])
  }

  async function fetchDrivers() {
    const { data, error } = await supabase
      .from('drivers')
      .select('id, full_name, name')
      .order('created_at', { ascending: false })

    if (!error) {
      setDrivers((data as DriverItem[]) || [])
    }
  }

  async function fetchBins() {
    const { data, error } = await supabase
      .from('bins')
      .select('id, bin_number, name, status')
      .order('created_at', { ascending: false })

    if (!error) {
      setBins((data as BinItem[]) || [])
    }
  }

  async function loadPageData() {
    setLoading(true)
    setErrorMessage('')

    await Promise.all([fetchLoads(), fetchDrivers(), fetchBins()])

    setLoading(false)
  }

  useEffect(() => {
    loadPageData()
  }, [])

  function resetForm() {
    setForm(defaultForm)
    setEditingId(null)
  }

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setErrorMessage('')
    setSuccessMessage('')

    const payload = {
      customer_name: form.customer_name || null,
      customer_phone: form.customer_phone || null,
      pickup_address: form.pickup_address || null,
      dropoff_address: form.dropoff_address || null,
      service_date: form.service_date || null,
      status: form.status || 'pending',
      driver_id: form.driver_id || null,
      bin_id: form.bin_id || null,
      notes: form.notes || null,
      updated_at: new Date().toISOString(),
    }

    if (!form.customer_name.trim()) {
      setErrorMessage('Customer name is required.')
      setSaving(false)
      return
    }

    let error = null

    if (editingId) {
      const response = await supabase
        .from('loads')
        .update(payload)
        .eq('id', editingId)

      error = response.error
    } else {
      const response = await supabase.from('loads').insert([payload])
      error = response.error
    }

    if (error) {
      setErrorMessage(error.message)
      setSaving(false)
      return
    }

    setSuccessMessage(editingId ? 'Load updated successfully.' : 'Load created successfully.')
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
      notes: load.notes || '',
    })

    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function handleDelete(id: string) {
    const confirmed = window.confirm('Delete this load?')
    if (!confirmed) return

    setErrorMessage('')
    setSuccessMessage('')

    const { error } = await supabase.from('loads').delete().eq('id', id)

    if (error) {
      setErrorMessage(error.message)
      return
    }

    if (editingId === id) {
      resetForm()
    }

    setSuccessMessage('Load deleted successfully.')
    await fetchLoads()
  }

  async function handleQuickStatusUpdate(id: string, status: string) {
    setErrorMessage('')
    setSuccessMessage('')

    const { error } = await supabase
      .from('loads')
      .update({
        status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)

    if (error) {
      setErrorMessage(error.message)
      return
    }

    await fetchLoads()
  }

  const filteredLoads = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return loads

    return loads.filter((load) => {
      return (
        (load.customer_name || '').toLowerCase().includes(term) ||
        (load.customer_phone || '').toLowerCase().includes(term) ||
        (load.pickup_address || '').toLowerCase().includes(term) ||
        (load.dropoff_address || '').toLowerCase().includes(term) ||
        (load.status || '').toLowerCase().includes(term)
      )
    })
  }, [loads, search])

  function getDriverName(driverId: string | null) {
    if (!driverId) return 'Unassigned'
    const driver = drivers.find((item) => item.id === driverId)
    return driver?.full_name || driver?.name || 'Unassigned'
  }

  function getBinName(binId: string | null) {
    if (!binId) return 'Unassigned'
    const bin = bins.find((item) => item.id === binId)
    return bin?.bin_number || bin?.name || 'Unassigned'
  }

  function getStatusClasses(status: string | null) {
    switch (status) {
      case 'completed':
        return 'bg-emerald-100 text-emerald-700 border border-emerald-200'
      case 'in_progress':
        return 'bg-amber-100 text-amber-700 border border-amber-200'
      case 'assigned':
        return 'bg-blue-100 text-blue-700 border border-blue-200'
      case 'cancelled':
        return 'bg-red-100 text-red-700 border border-red-200'
      default:
        return 'bg-slate-100 text-slate-700 border border-slate-200'
    }
  }

  return (
    <DashboardShell
      title="Loads"
      subtitle="Create, assign, update, and track service loads."
      roleLabel="Admin"
      userName="Admin User"
      navItems={[
        { href: '/admin', label: 'Dashboard' },
        { href: '/loads', label: 'Loads' },
        { href: '/drivers', label: 'Drivers' },
        { href: '/bins', label: 'Bins' },
        { href: '/customers', label: 'Customers' },
        { href: '/reports', label: 'Reports' },
      ]}
    >
      <div className="space-y-6">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-emerald-600">
                Loads Management
              </p>
              <h1 className="text-2xl font-bold text-slate-900">
                {editingId ? 'Edit Load' : 'Create New Load'}
              </h1>
            </div>

            {editingId ? (
              <button
                onClick={resetForm}
                className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Cancel Edit
              </button>
            ) : null}
          </div>

          {errorMessage ? (
            <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
              {errorMessage}
            </div>
          ) : null}

          {successMessage ? (
            <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {successMessage}
            </div>
          ) : null}

          <form onSubmit={handleSave} className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Customer Name
              </label>
              <input
                name="customer_name"
                value={form.customer_name}
                onChange={handleChange}
                placeholder="Customer name"
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-slate-400"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Customer Phone
              </label>
              <input
                name="customer_phone"
                value={form.customer_phone}
                onChange={handleChange}
                placeholder="Phone number"
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-slate-400"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Pickup Address
              </label>
              <input
                name="pickup_address"
                value={form.pickup_address}
                onChange={handleChange}
                placeholder="Pickup address"
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-slate-400"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Dropoff Address
              </label>
              <input
                name="dropoff_address"
                value={form.dropoff_address}
                onChange={handleChange}
                placeholder="Dropoff address"
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-slate-400"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Service Date
              </label>
              <input
                type="date"
                name="service_date"
                value={form.service_date}
                onChange={handleChange}
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-slate-400"
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
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-slate-400"
              >
                {statusOptions.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Driver
              </label>
              <select
                name="driver_id"
                value={form.driver_id}
                onChange={handleChange}
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-slate-400"
              >
                <option value="">Unassigned</option>
                {drivers.map((driver) => (
                  <option key={driver.id} value={driver.id}>
                    {driver.full_name || driver.name || 'Unnamed Driver'}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Bin
              </label>
              <select
                name="bin_id"
                value={form.bin_id}
                onChange={handleChange}
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-slate-400"
              >
                <option value="">Unassigned</option>
                {bins.map((bin) => (
                  <option key={bin.id} value={bin.id}>
                    {bin.bin_number || bin.name || 'Unnamed Bin'}
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Notes
              </label>
              <textarea
                name="notes"
                value={form.notes}
                onChange={handleChange}
                placeholder="Extra notes"
                rows={4}
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-slate-400"
              />
            </div>

            <div className="md:col-span-2 flex flex-col gap-3 sm:flex-row">
              <button
                type="submit"
                disabled={saving}
                className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving
                  ? 'Saving...'
                  : editingId
                  ? 'Update Load'
                  : 'Create Load'}
              </button>

              <button
                type="button"
                onClick={resetForm}
                className="rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Clear Form
              </button>
            </div>
          </form>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-900">All Loads</h2>
              <p className="text-sm text-slate-500">
                Search, update, and manage operational loads.
              </p>
            </div>

            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search loads..."
              className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-slate-400 sm:w-72"
            />
          </div>

          {loading ? (
            <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">
              Loading loads...
            </div>
          ) : filteredLoads.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center">
              <p className="text-base font-semibold text-slate-700">No loads found</p>
              <p className="mt-1 text-sm text-slate-500">
                Create your first load using the form above.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left">
                <thead>
                  <tr className="border-b border-slate-200 text-sm text-slate-500">
                    <th className="px-3 py-3 font-semibold">Customer</th>
                    <th className="px-3 py-3 font-semibold">Service Date</th>
                    <th className="px-3 py-3 font-semibold">Status</th>
                    <th className="px-3 py-3 font-semibold">Driver</th>
                    <th className="px-3 py-3 font-semibold">Bin</th>
                    <th className="px-3 py-3 font-semibold">Pickup</th>
                    <th className="px-3 py-3 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLoads.map((load) => (
                    <tr key={load.id} className="border-b border-slate-100 align-top">
                      <td className="px-3 py-4">
                        <p className="font-semibold text-slate-900">
                          {load.customer_name || 'No name'}
                        </p>
                        <p className="text-sm text-slate-500">
                          {load.customer_phone || 'No phone'}
                        </p>
                      </td>

                      <td className="px-3 py-4 text-sm text-slate-700">
                        {load.service_date || 'Not set'}
                      </td>

                      <td className="px-3 py-4">
                        <div className="mb-2">
                          <span
                            className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getStatusClasses(
                              load.status
                            )}`}
                          >
                            {load.status || 'pending'}
                          </span>
                        </div>

                        <select
                          value={load.status || 'pending'}
                          onChange={(e) =>
                            handleQuickStatusUpdate(load.id, e.target.value)
                          }
                          className="rounded-xl border border-slate-200 px-2 py-2 text-xs outline-none"
                        >
                          {statusOptions.map((status) => (
                            <option key={status} value={status}>
                              {status}
                            </option>
                          ))}
                        </select>
                      </td>

                      <td className="px-3 py-4 text-sm text-slate-700">
                        {getDriverName(load.driver_id)}
                      </td>

                      <td className="px-3 py-4 text-sm text-slate-700">
                        {getBinName(load.bin_id)}
                      </td>

                      <td className="px-3 py-4 text-sm text-slate-700">
                        <div className="max-w-[220px]">
                          {load.pickup_address || 'No pickup address'}
                        </div>
                      </td>

                      <td className="px-3 py-4">
                        <div className="flex flex-col gap-2">
                          <button
                            onClick={() => handleEdit(load)}
                            className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(load.id)}
                            className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-600 transition hover:bg-red-100"
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
        </section>
      </div>
    </DashboardShell>
  )
}