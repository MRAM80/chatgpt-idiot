'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Bin = {
  id: string
  bin_number: string | null
  bin_size: string | null
  bin_type: string | null
  status: string | null
  created_at: string | null
  updated_at: string | null
}

type Job = {
  id: string
  bin_id: string | null
  status: string | null
  scheduled_date: string | null
}

const BIN_SIZES = ['6', '8', '15', '20', '30', '40'] as const
const BIN_TYPES = ['Garbage', 'Recycling', 'Mixed', 'Clean Fill'] as const
const BIN_STATUSES = ['available', 'in_use', 'maintenance'] as const

const statusClasses: Record<string, string> = {
  available: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  in_use: 'bg-blue-100 text-blue-700 border-blue-200',
  maintenance: 'bg-amber-100 text-amber-700 border-amber-200',
}

function formatStatus(status: string | null | undefined) {
  if (!status) return 'Available'
  return status
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

function formatDate(date: string | null) {
  if (!date) return '—'
  const parsed = new Date(date)
  if (Number.isNaN(parsed.getTime())) return date
  return parsed.toLocaleDateString()
}

export default function BinsPage() {
  const supabase = createClient()

  const [bins, setBins] = useState<Bin[]>([])
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [pageError, setPageError] = useState('')

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sizeFilter, setSizeFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')

  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingBin, setEditingBin] = useState<Bin | null>(null)

  const emptyForm = {
    bin_number: '',
    bin_size: '20',
    bin_type: 'Garbage',
    status: 'available',
  }

  const [form, setForm] = useState(emptyForm)

  async function loadBins() {
    const { data, error } = await supabase
      .from('bins')
      .select('id,bin_number,bin_size,bin_type,status,created_at,updated_at')
      .order('created_at', { ascending: false })

    if (error) {
      setPageError(error.message)
      return
    }

    setBins((data as Bin[]) || [])
  }

  async function loadJobs() {
    const { data, error } = await supabase
      .from('jobs')
      .select('id,bin_id,status,scheduled_date')

    if (error) {
      setPageError(error.message)
      return
    }

    setJobs((data as Job[]) || [])
  }

  async function refreshAll() {
    setLoading(true)
    setPageError('')
    await Promise.all([loadBins(), loadJobs()])
    setLoading(false)
  }

  useEffect(() => {
    refreshAll()

    const channel = supabase
      .channel('bins-page-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bins' },
        async () => {
          await loadBins()
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'jobs' },
        async () => {
          await loadJobs()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  const binStats = useMemo(() => {
    const totalJobsByBin: Record<string, number> = {}
    const activeJobsByBin: Record<string, number> = {}

    for (const job of jobs) {
      if (!job.bin_id) continue

      totalJobsByBin[job.bin_id] = (totalJobsByBin[job.bin_id] || 0) + 1

      if (job.status === 'assigned' || job.status === 'in_progress') {
        activeJobsByBin[job.bin_id] = (activeJobsByBin[job.bin_id] || 0) + 1
      }
    }

    return { totalJobsByBin, activeJobsByBin }
  }, [jobs])

  const dashboardCounts = useMemo(() => {
    return {
      total: bins.length,
      available: bins.filter((bin) => (bin.status || 'available') === 'available').length,
      in_use: bins.filter((bin) => bin.status === 'in_use').length,
      maintenance: bins.filter((bin) => bin.status === 'maintenance').length,
    }
  }, [bins])

  const filteredBins = useMemo(() => {
    const query = search.trim().toLowerCase()

    return bins.filter((bin) => {
      const matchesSearch =
        !query ||
        (bin.bin_number || '').toLowerCase().includes(query) ||
        (bin.bin_size || '').toLowerCase().includes(query) ||
        (bin.bin_type || '').toLowerCase().includes(query)

      const matchesStatus =
        statusFilter === 'all' || (bin.status || 'available') === statusFilter

      const matchesSize =
        sizeFilter === 'all' || (bin.bin_size || '') === sizeFilter

      const matchesType =
        typeFilter === 'all' || (bin.bin_type || '') === typeFilter

      return matchesSearch && matchesStatus && matchesSize && matchesType
    })
  }, [bins, search, statusFilter, sizeFilter, typeFilter])

  function openCreateModal() {
    setEditingBin(null)
    setForm(emptyForm)
    setPageError('')
    setShowCreateModal(true)
  }

  function openEditModal(bin: Bin) {
    setEditingBin(bin)
    setShowCreateModal(false)
    setPageError('')
    setForm({
      bin_number: bin.bin_number || '',
      bin_size: bin.bin_size || '20',
      bin_type: bin.bin_type || 'Garbage',
      status: bin.status || 'available',
    })
  }

  function closeModal() {
    setEditingBin(null)
    setShowCreateModal(false)
    setForm(emptyForm)
    setPageError('')
  }

  async function handleCreateOrUpdate() {
    setSaving(true)
    setPageError('')

    if (!form.bin_number.trim()) {
      setPageError('Bin number is required.')
      setSaving(false)
      return
    }

    const payload = {
      bin_number: form.bin_number.trim(),
      bin_size: form.bin_size || null,
      bin_type: form.bin_type || null,
      status: form.status || 'available',
    }

    if (editingBin) {
      const { error } = await supabase
        .from('bins')
        .update(payload)
        .eq('id', editingBin.id)

      if (error) {
        setPageError(error.message)
      } else {
        await refreshAll()
        closeModal()
      }
    } else {
      const { error } = await supabase.from('bins').insert([payload])

      if (error) {
        setPageError(error.message)
      } else {
        await refreshAll()
        closeModal()
      }
    }

    setSaving(false)
  }

  async function handleDelete(binId: string) {
    const relatedActiveJobs = jobs.filter(
      (job) =>
        job.bin_id === binId &&
        (job.status === 'assigned' || job.status === 'in_progress')
    )

    if (relatedActiveJobs.length > 0) {
      window.alert(
        'This bin has active jobs linked to it. Complete or reassign those jobs first.'
      )
      return
    }

    const confirmed = window.confirm('Delete this bin?')
    if (!confirmed) return

    setDeletingId(binId)
    setPageError('')

    const { error } = await supabase.from('bins').delete().eq('id', binId)

    if (error) {
      setPageError(error.message)
    } else {
      await refreshAll()
    }

    setDeletingId(null)
  }

  async function handleQuickStatus(bin: Bin, value: string) {
    const activeJobs = binStats.activeJobsByBin[bin.id] || 0

    if (value === 'available' && activeJobs > 0) {
      window.alert('This bin still has active jobs. Keep it in use or reassign the jobs first.')
      return
    }

    setPageError('')

    const { error } = await supabase
      .from('bins')
      .update({ status: value })
      .eq('id', bin.id)

    if (error) {
      setPageError(error.message)
    } else {
      await refreshAll()
    }
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="mx-auto max-w-7xl p-4 md:p-6">
        <div className="mb-6 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                Bin Inventory
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                Manage your yard inventory with fixed sizes and operational status
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                onClick={refreshAll}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Refresh
              </button>
              <button
                onClick={openCreateModal}
                className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90"
              >
                New Bin
              </button>
            </div>
          </div>

          {pageError ? (
            <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {pageError}
            </div>
          ) : null}

          <div className="mt-6 grid gap-4 md:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Total Bins
              </div>
              <div className="mt-2 text-2xl font-bold text-slate-900">
                {dashboardCounts.total}
              </div>
            </div>

            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                Available
              </div>
              <div className="mt-2 text-2xl font-bold text-emerald-900">
                {dashboardCounts.available}
              </div>
            </div>

            <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-blue-700">
                In Use
              </div>
              <div className="mt-2 text-2xl font-bold text-blue-900">
                {dashboardCounts.in_use}
              </div>
            </div>

            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                Maintenance
              </div>
              <div className="mt-2 text-2xl font-bold text-amber-900">
                {dashboardCounts.maintenance}
              </div>
            </div>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-4">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search bin number, size, or type"
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-slate-400"
            />

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-slate-400"
            >
              <option value="all">All Statuses</option>
              {BIN_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {formatStatus(status)}
                </option>
              ))}
            </select>

            <select
              value={sizeFilter}
              onChange={(e) => setSizeFilter(e.target.value)}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-slate-400"
            >
              <option value="all">All Sizes</option>
              {BIN_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size} Yard
                </option>
              ))}
            </select>

            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-slate-400"
            >
              <option value="all">All Types</option>
              {BIN_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-slate-200">
          {loading ? (
            <div className="p-10 text-center text-sm text-slate-500">
              Loading bins...
            </div>
          ) : filteredBins.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">
              No bins found.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                      Bin Number
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                      Size
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                      Type
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                      Usage
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                      Added
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wide text-slate-500">
                      Actions
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100 bg-white">
                  {filteredBins.map((bin) => {
                    const totalJobs = binStats.totalJobsByBin[bin.id] || 0
                    const activeJobs = binStats.activeJobsByBin[bin.id] || 0
                    const badgeClass =
                      statusClasses[bin.status || 'available'] || statusClasses.available

                    return (
                      <tr key={bin.id} className="hover:bg-slate-50/80">
                        <td className="px-4 py-4 align-top">
                          <div className="font-semibold text-slate-900">
                            {bin.bin_number || 'No bin number'}
                          </div>
                        </td>

                        <td className="px-4 py-4 align-top text-sm text-slate-700">
                          {bin.bin_size ? `${bin.bin_size} Yard` : '—'}
                        </td>

                        <td className="px-4 py-4 align-top text-sm text-slate-700">
                          {bin.bin_type || '—'}
                        </td>

                        <td className="px-4 py-4 align-top text-sm text-slate-700">
                          <div>Total Jobs: {totalJobs}</div>
                          <div className="mt-1 text-slate-500">Active: {activeJobs}</div>
                        </td>

                        <td className="px-4 py-4 align-top">
                          <div className="flex flex-col gap-2">
                            <span
                              className={`inline-flex w-fit rounded-full border px-2.5 py-1 text-xs font-semibold ${badgeClass}`}
                            >
                              {formatStatus(bin.status || 'available')}
                            </span>

                            <select
                              value={bin.status || 'available'}
                              onChange={(e) => handleQuickStatus(bin, e.target.value)}
                              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-slate-400"
                            >
                              {BIN_STATUSES.map((status) => (
                                <option key={status} value={status}>
                                  {formatStatus(status)}
                                </option>
                              ))}
                            </select>
                          </div>
                        </td>

                        <td className="px-4 py-4 align-top text-sm text-slate-700">
                          {formatDate(bin.created_at)}
                        </td>

                        <td className="px-4 py-4 align-top">
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => openEditModal(bin)}
                              className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition hover:opacity-90"
                            >
                              Edit
                            </button>

                            <button
                              onClick={() => handleDelete(bin.id)}
                              disabled={deletingId === bin.id}
                              className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                            >
                              {deletingId === bin.id ? 'Deleting...' : 'Delete'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="mt-6 flex justify-center">
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            Back to Dashboard
          </Link>
        </div>
      </div>

      {(showCreateModal || editingBin) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-2xl rounded-3xl bg-white p-6 shadow-2xl">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-slate-900">
                  {editingBin ? 'Edit Bin' : 'Create Bin'}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {editingBin
                    ? 'Update bin details and operational status'
                    : 'Add a new bin to your yard inventory'}
                </p>
              </div>

              <button
                onClick={closeModal}
                className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200"
              >
                Close
              </button>
            </div>

            {pageError ? (
              <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {pageError}
              </div>
            ) : null}

            <div className="grid gap-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Bin Number
                </label>
                <input
                  value={form.bin_number}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, bin_number: e.target.value }))
                  }
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-slate-400"
                  placeholder="BIN-001"
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Bin Size
                  </label>
                  <select
                    value={form.bin_size}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, bin_size: e.target.value }))
                    }
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-slate-400"
                  >
                    {BIN_SIZES.map((size) => (
                      <option key={size} value={size}>
                        {size} Yard
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Bin Type
                  </label>
                  <select
                    value={form.bin_type}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, bin_type: e.target.value }))
                    }
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-slate-400"
                  >
                    {BIN_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Status
                </label>
                <select
                  value={form.status}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, status: e.target.value }))
                  }
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-slate-400"
                >
                  {BIN_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {formatStatus(status)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={closeModal}
                className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>

              <button
                onClick={handleCreateOrUpdate}
                disabled={saving}
                className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
              >
                {saving ? 'Saving...' : editingBin ? 'Save Changes' : 'Create Bin'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}