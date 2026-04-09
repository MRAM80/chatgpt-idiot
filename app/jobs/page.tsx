'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Driver = {
  id: string
  name: string | null
  email: string | null
  phone: string | null
  status: string | null
}

type Customer = {
  id: string
  name: string | null
  phone: string | null
  email: string | null
  address: string | null
}

type Bin = {
  id: string
  bin_number: string | null
  bin_size: string | null
  bin_type: string | null
  status: string | null
}

type Job = {
  id: string
  ticket_number: string | null
  customer_id: string | null
  customer_name: string | null
  pickup_address: string | null
  bin_id: string | null
  bin_size: string | null
  bin_type: string | null
  driver_id: string | null
  scheduled_date: string | null
  status: string | null
  notes: string | null
  created_at: string | null
  updated_at: string | null
}

const JOB_STATUSES = [
  'unassigned',
  'assigned',
  'in_progress',
  'completed',
  'issue',
] as const

const BIN_SIZES = ['6', '8', '15', '20', '30', '40'] as const
const BIN_TYPES = ['Garbage', 'Recycling', 'Mixed', 'Clean Fill'] as const

const statusClasses: Record<string, string> = {
  unassigned: 'bg-slate-100 text-slate-700 border-slate-200',
  assigned: 'bg-blue-100 text-blue-700 border-blue-200',
  in_progress: 'bg-amber-100 text-amber-700 border-amber-200',
  completed: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  issue: 'bg-rose-100 text-rose-700 border-rose-200',
}

function formatStatus(status: string | null | undefined) {
  if (!status) return 'Unassigned'
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

export default function JobsPage() {
  const supabase = createClient()

  const [jobs, setJobs] = useState<Job[]>([])
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [bins, setBins] = useState<Bin[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [pageError, setPageError] = useState('')

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [driverFilter, setDriverFilter] = useState('all')

  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingJob, setEditingJob] = useState<Job | null>(null)

  const emptyForm = {
    customer_id: '',
    customer_name: '',
    pickup_address: '',
    bin_size: '20',
    bin_type: 'Garbage',
    driver_id: '',
    scheduled_date: '',
    status: 'unassigned',
    notes: '',
  }

  const [form, setForm] = useState(emptyForm)

  async function loadJobs() {
    const { data, error } = await supabase
      .from('jobs')
      .select(
        'id,ticket_number,customer_id,customer_name,pickup_address,bin_id,bin_size,bin_type,driver_id,scheduled_date,status,notes,created_at,updated_at'
      )
      .order('created_at', { ascending: false })

    if (error) {
      setPageError(error.message)
      return
    }

    setJobs((data as Job[]) || [])
  }

  async function loadDrivers() {
    const { data, error } = await supabase
      .from('drivers')
      .select('id,name,email,phone,status')
      .order('name', { ascending: true })

    if (error) {
      setPageError(error.message)
      return
    }

    setDrivers((data as Driver[]) || [])
  }

  async function loadCustomers() {
    const { data, error } = await supabase
      .from('customers')
      .select('id,name,phone,email,address')
      .order('name', { ascending: true })

    if (error) {
      setPageError(error.message)
      return
    }

    setCustomers((data as Customer[]) || [])
  }

  async function loadBins() {
    const { data, error } = await supabase
      .from('bins')
      .select('id,bin_number,bin_size,bin_type,status')
      .order('bin_number', { ascending: true })

    if (error) {
      setPageError(error.message)
      return
    }

    setBins((data as Bin[]) || [])
  }

  async function refreshAll() {
    setLoading(true)
    setPageError('')
    await Promise.all([loadJobs(), loadDrivers(), loadCustomers(), loadBins()])
    setLoading(false)
  }

  useEffect(() => {
    refreshAll()

    const channel = supabase
      .channel('jobs-page-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'jobs' },
        async () => {
          await loadJobs()
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'drivers' },
        async () => {
          await loadDrivers()
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bins' },
        async () => {
          await loadBins()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  const driverMap = useMemo(() => {
    return drivers.reduce<Record<string, Driver>>((acc, driver) => {
      acc[driver.id] = driver
      return acc
    }, {})
  }, [drivers])

  const customerMap = useMemo(() => {
    return customers.reduce<Record<string, Customer>>((acc, customer) => {
      acc[customer.id] = customer
      return acc
    }, {})
  }, [customers])

  const binMap = useMemo(() => {
    return bins.reduce<Record<string, Bin>>((acc, bin) => {
      acc[bin.id] = bin
      return acc
    }, {})
  }, [bins])

  const filteredJobs = useMemo(() => {
    const query = search.trim().toLowerCase()

    return jobs.filter((job) => {
      const driverName = job.driver_id ? driverMap[job.driver_id]?.name || '' : ''
      const customerName =
        job.customer_name || (job.customer_id ? customerMap[job.customer_id]?.name || '' : '')
      const binLabel = job.bin_id ? binMap[job.bin_id]?.bin_number || '' : ''

      const matchesSearch =
        !query ||
        customerName.toLowerCase().includes(query) ||
        (job.pickup_address || '').toLowerCase().includes(query) ||
        (job.bin_type || '').toLowerCase().includes(query) ||
        (job.bin_size || '').toLowerCase().includes(query) ||
        driverName.toLowerCase().includes(query) ||
        (job.notes || '').toLowerCase().includes(query) ||
        (job.ticket_number || '').toLowerCase().includes(query) ||
        binLabel.toLowerCase().includes(query)

      const matchesStatus =
        statusFilter === 'all' || (job.status || 'unassigned') === statusFilter

      const matchesDriver =
        driverFilter === 'all' || (job.driver_id || '') === driverFilter

      return matchesSearch && matchesStatus && matchesDriver
    })
  }, [jobs, search, statusFilter, driverFilter, driverMap, customerMap, binMap])

  const counts = useMemo(() => {
    return {
      total: jobs.length,
      unassigned: jobs.filter((job) => (job.status || 'unassigned') === 'unassigned').length,
      assigned: jobs.filter((job) => job.status === 'assigned').length,
      in_progress: jobs.filter((job) => job.status === 'in_progress').length,
      completed: jobs.filter((job) => job.status === 'completed').length,
    }
  }, [jobs])

  function openCreateModal() {
    setEditingJob(null)
    setForm(emptyForm)
    setShowCreateModal(true)
    setPageError('')
  }

  function openEditModal(job: Job) {
    setEditingJob(job)
    setShowCreateModal(false)
    setPageError('')
    setForm({
      customer_id: job.customer_id || '',
      customer_name: job.customer_name || '',
      pickup_address: job.pickup_address || '',
      bin_size: job.bin_size || '20',
      bin_type: job.bin_type || 'Garbage',
      driver_id: job.driver_id || '',
      scheduled_date: job.scheduled_date
        ? new Date(job.scheduled_date).toISOString().slice(0, 10)
        : '',
      status: job.status || 'unassigned',
      notes: job.notes || '',
    })
  }

  function closeModal() {
    setEditingJob(null)
    setShowCreateModal(false)
    setForm(emptyForm)
    setPageError('')
  }

  function handleCustomerChange(customerId: string) {
    const customer = customers.find((item) => item.id === customerId)

    setForm((prev) => ({
      ...prev,
      customer_id: customerId,
      customer_name: customer?.name || prev.customer_name,
      pickup_address: customer?.address || prev.pickup_address,
    }))
  }

  async function syncDriverStatuses(driverId: string) {
    const { data: jobData, error: jobsError } = await supabase
      .from('jobs')
      .select('status')
      .eq('driver_id', driverId)

    if (jobsError) {
      setPageError(jobsError.message)
      return
    }

    const activeStatuses = ['assigned', 'in_progress']
    const hasActiveJobs = (jobData || []).some((job) =>
      activeStatuses.includes(job.status || '')
    )

    const { data: driver, error: driverError } = await supabase
      .from('drivers')
      .select('status')
      .eq('id', driverId)
      .single()

    if (driverError) {
      setPageError(driverError.message)
      return
    }

    if (driver?.status === 'offline') return

    const { error: updateError } = await supabase
      .from('drivers')
      .update({ status: hasActiveJobs ? 'busy' : 'available' })
      .eq('id', driverId)

    if (updateError) {
      setPageError(updateError.message)
    }
  }

  async function releaseBin(binId: string | null) {
    if (!binId) return

    const { data, error } = await supabase
      .from('jobs')
      .select('id,status')
      .eq('bin_id', binId)

    if (error) {
      setPageError(error.message)
      return
    }

    const hasActiveJobs = (data || []).some((job) =>
      ['assigned', 'in_progress', 'unassigned'].includes(job.status || '')
    )

    if (!hasActiveJobs) {
      const { error: updateError } = await supabase
        .from('bins')
        .update({ status: 'available' })
        .eq('id', binId)

      if (updateError) {
        setPageError(updateError.message)
      }
    }
  }

  async function reserveMatchingBin(
    size: string,
    type: string,
    currentBinId?: string | null
  ): Promise<Bin | null> {
    if (currentBinId) {
      const currentBin = bins.find((bin) => bin.id === currentBinId)
      if (
        currentBin &&
        currentBin.bin_size === size &&
        currentBin.bin_type === type
      ) {
        return currentBin
      }
    }

    const { data, error } = await supabase
      .from('bins')
      .select('id,bin_number,bin_size,bin_type,status')
      .eq('bin_size', size)
      .eq('bin_type', type)
      .eq('status', 'available')
      .order('bin_number', { ascending: true })
      .limit(1)

    if (error) {
      setPageError(error.message)
      return null
    }

    const found = (data as Bin[] | null)?.[0] || null
    if (!found) return null

    const { error: updateError } = await supabase
      .from('bins')
      .update({ status: 'in_use' })
      .eq('id', found.id)

    if (updateError) {
      setPageError(updateError.message)
      return null
    }

    return found
  }

  async function handleCreateOrUpdate() {
    setSaving(true)
    setPageError('')

    if (!form.customer_name.trim()) {
      setPageError('Customer name is required.')
      setSaving(false)
      return
    }

    const matchedBin = await reserveMatchingBin(
      form.bin_size,
      form.bin_type,
      editingJob?.bin_id || null
    )

    if (!matchedBin) {
      setPageError(`No available ${form.bin_size} yard ${form.bin_type} bin found.`)
      setSaving(false)
      return
    }

    const payload = {
      customer_id: form.customer_id || null,
      customer_name: form.customer_name || null,
      pickup_address: form.pickup_address || null,
      bin_id: matchedBin.id,
      bin_size: form.bin_size || null,
      bin_type: form.bin_type || null,
      driver_id: form.driver_id || null,
      scheduled_date: form.scheduled_date || null,
      status: form.status || 'unassigned',
      notes: form.notes || null,
    }

    if (editingJob) {
      const previousDriverId = editingJob.driver_id
      const previousBinId = editingJob.bin_id

      const { error } = await supabase.from('jobs').update(payload).eq('id', editingJob.id)

      if (error) {
        setPageError(error.message)
      } else {
        if (previousDriverId && previousDriverId !== payload.driver_id) {
          await syncDriverStatuses(previousDriverId)
        }

        if (payload.driver_id) {
          await syncDriverStatuses(payload.driver_id)
        }

        if (previousBinId && previousBinId !== payload.bin_id) {
          await releaseBin(previousBinId)
        }

        if (payload.status === 'completed' || payload.status === 'issue') {
          await releaseBin(payload.bin_id)
        }

        await refreshAll()
        closeModal()
      }
    } else {
      const { error } = await supabase.from('jobs').insert([payload])

      if (error) {
        setPageError(error.message)
      } else {
        if (payload.driver_id) {
          await syncDriverStatuses(payload.driver_id)
        }

        await refreshAll()
        closeModal()
      }
    }

    setSaving(false)
  }

  async function handleDelete(jobId: string, driverId?: string | null, binId?: string | null) {
    const confirmed = window.confirm('Delete this job?')
    if (!confirmed) return

    setDeletingId(jobId)
    setPageError('')

    const { error } = await supabase.from('jobs').delete().eq('id', jobId)

    if (error) {
      setPageError(error.message)
    } else {
      if (driverId) {
        await syncDriverStatuses(driverId)
      }
      if (binId) {
        await releaseBin(binId)
      }
      await refreshAll()
    }

    setDeletingId(null)
  }

  async function handleQuickStatus(job: Job, value: string) {
    setPageError('')

    const { error } = await supabase
      .from('jobs')
      .update({ status: value })
      .eq('id', job.id)

    if (error) {
      setPageError(error.message)
    } else {
      if (job.driver_id) {
        await syncDriverStatuses(job.driver_id)
      }

      if ((value === 'completed' || value === 'issue') && job.bin_id) {
        await releaseBin(job.bin_id)
      }

      await refreshAll()
    }
  }

  const assignableDrivers = useMemo(() => {
    return drivers.filter((driver) => driver.status !== 'offline')
  }, [drivers])

  const availableBinCountForSelection = useMemo(() => {
    return bins.filter(
      (bin) =>
        bin.status === 'available' &&
        bin.bin_size === form.bin_size &&
        bin.bin_type === form.bin_type
    ).length
  }, [bins, form.bin_size, form.bin_type])

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="mx-auto max-w-7xl p-4 md:p-6">
        <div className="mb-6 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">Jobs</h1>
              <p className="mt-1 text-sm text-slate-500">
                Create jobs with automatic bin assignment from yard inventory
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
                New Job
              </button>
            </div>
          </div>

          {pageError ? (
            <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {pageError}
            </div>
          ) : null}

          <div className="mt-6 grid gap-4 md:grid-cols-5">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Total
              </div>
              <div className="mt-2 text-2xl font-bold text-slate-900">{counts.total}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Unassigned
              </div>
              <div className="mt-2 text-2xl font-bold text-slate-900">{counts.unassigned}</div>
            </div>
            <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-blue-700">
                Assigned
              </div>
              <div className="mt-2 text-2xl font-bold text-blue-900">{counts.assigned}</div>
            </div>
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                In Progress
              </div>
              <div className="mt-2 text-2xl font-bold text-amber-900">{counts.in_progress}</div>
            </div>
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                Completed
              </div>
              <div className="mt-2 text-2xl font-bold text-emerald-900">{counts.completed}</div>
            </div>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-3">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search ticket, customer, address, driver, bin, notes"
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-slate-400"
            />

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-slate-400"
            >
              <option value="all">All Statuses</option>
              {JOB_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {formatStatus(status)}
                </option>
              ))}
            </select>

            <select
              value={driverFilter}
              onChange={(e) => setDriverFilter(e.target.value)}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-slate-400"
            >
              <option value="all">All Drivers</option>
              {drivers.map((driver) => (
                <option key={driver.id} value={driver.id}>
                  {driver.name || 'Unnamed Driver'}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-slate-200">
          {loading ? (
            <div className="p-10 text-center text-sm text-slate-500">Loading jobs...</div>
          ) : filteredJobs.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">No jobs found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                      Ticket
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                      Customer
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                      Address
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                      Bin
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                      Driver
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                      Date
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                      Status
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wide text-slate-500">
                      Actions
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100 bg-white">
                  {filteredJobs.map((job) => {
                    const driver = job.driver_id ? driverMap[job.driver_id] : null
                    const customer =
                      job.customer_name ||
                      (job.customer_id ? customerMap[job.customer_id]?.name : null) ||
                      'No customer'
                    const bin = job.bin_id ? binMap[job.bin_id] : null

                    const badgeClass =
                      statusClasses[job.status || 'unassigned'] || statusClasses.unassigned

                    return (
                      <tr key={job.id} className="hover:bg-slate-50/80">
                        <td className="px-4 py-4 align-top">
                          <div className="font-semibold text-slate-900">
                            {job.ticket_number || 'Pending'}
                          </div>
                          <div className="mt-1 text-xs text-slate-500">#{job.id.slice(0, 8)}</div>
                        </td>

                        <td className="px-4 py-4 align-top">
                          <div className="font-semibold text-slate-900">{customer}</div>
                        </td>

                        <td className="px-4 py-4 align-top text-sm text-slate-700">
                          {job.pickup_address || '—'}
                        </td>

                        <td className="px-4 py-4 align-top text-sm text-slate-700">
                          {bin
                            ? `${bin.bin_number || 'Bin'} • ${job.bin_size || ''}Y ${job.bin_type || ''}`
                            : 'Auto assign'}
                        </td>

                        <td className="px-4 py-4 align-top text-sm text-slate-700">
                          {driver?.name || 'Unassigned'}
                        </td>

                        <td className="px-4 py-4 align-top text-sm text-slate-700">
                          {formatDate(job.scheduled_date)}
                        </td>

                        <td className="px-4 py-4 align-top">
                          <div className="flex flex-col gap-2">
                            <span
                              className={`inline-flex w-fit rounded-full border px-2.5 py-1 text-xs font-semibold ${badgeClass}`}
                            >
                              {formatStatus(job.status || 'unassigned')}
                            </span>

                            <select
                              value={job.status || 'unassigned'}
                              onChange={(e) => handleQuickStatus(job, e.target.value)}
                              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-slate-400"
                            >
                              {JOB_STATUSES.map((status) => (
                                <option key={status} value={status}>
                                  {formatStatus(status)}
                                </option>
                              ))}
                            </select>
                          </div>
                        </td>

                        <td className="px-4 py-4 align-top">
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => openEditModal(job)}
                              className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition hover:opacity-90"
                            >
                              Edit
                            </button>

                            <button
                              onClick={() => handleDelete(job.id, job.driver_id, job.bin_id)}
                              disabled={deletingId === job.id}
                              className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                            >
                              {deletingId === job.id ? 'Deleting...' : 'Delete'}
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

      {(showCreateModal || editingJob) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-3xl rounded-3xl bg-white p-6 shadow-2xl">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-slate-900">
                  {editingJob ? 'Edit Job' : 'Create Job'}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {editingJob
                    ? 'Update job details with automatic bin assignment'
                    : 'Add a new job and reserve a matching available bin'}
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

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Customer
                </label>
                <select
                  value={form.customer_id}
                  onChange={(e) => handleCustomerChange(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-slate-400"
                >
                  <option value="">Select customer</option>
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name || 'Unnamed Customer'}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Customer Name
                </label>
                <input
                  value={form.customer_name}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, customer_name: e.target.value }))
                  }
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-slate-400"
                  placeholder="Customer name"
                />
              </div>

              <div className="md:col-span-2">
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Pickup Address
                </label>
                <input
                  value={form.pickup_address}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, pickup_address: e.target.value }))
                  }
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-slate-400"
                  placeholder="Pickup address"
                />
              </div>

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

              <div className="md:col-span-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                Matching available bins: <span className="font-semibold">{availableBinCountForSelection}</span>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Driver
                </label>
                <select
                  value={form.driver_id}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, driver_id: e.target.value }))
                  }
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-slate-400"
                >
                  <option value="">Unassigned</option>
                  {assignableDrivers.map((driver) => (
                    <option key={driver.id} value={driver.id}>
                      {driver.name || 'Unnamed Driver'}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Scheduled Date
                </label>
                <input
                  type="date"
                  value={form.scheduled_date}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, scheduled_date: e.target.value }))
                  }
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-slate-400"
                />
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
                  {JOB_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {formatStatus(status)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Notes
                </label>
                <textarea
                  rows={4}
                  value={form.notes}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, notes: e.target.value }))
                  }
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-slate-400"
                  placeholder="Special instructions, gate code, contact notes..."
                />
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
                {saving ? 'Saving...' : editingJob ? 'Save Changes' : 'Create Job'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}