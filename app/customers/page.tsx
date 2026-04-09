'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Customer = {
  id: string
  name: string | null
  phone: string | null
  email: string | null
  address: string | null
  created_at: string | null
  updated_at: string | null
}

type Job = {
  id: string
  customer_id: string | null
  customer_name: string | null
  pickup_address: string | null
  status: string | null
  scheduled_date: string | null
}

const CUSTOMER_STATUS_STYLES: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  inactive: 'bg-slate-100 text-slate-700 border-slate-200',
}

function formatDate(date: string | null) {
  if (!date) return '—'
  const parsed = new Date(date)
  if (Number.isNaN(parsed.getTime())) return date
  return parsed.toLocaleDateString()
}

export default function CustomersPage() {
  const supabase = createClient()

  const [customers, setCustomers] = useState<Customer[]>([])
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null)

  const emptyForm = {
    name: '',
    phone: '',
    email: '',
    address: '',
  }

  const [form, setForm] = useState(emptyForm)

  async function loadCustomers() {
    const { data, error } = await supabase
      .from('customers')
      .select('id,name,phone,email,address,created_at,updated_at')
      .order('created_at', { ascending: false })

    if (!error) {
      setCustomers((data as Customer[]) || [])
    }
  }

  async function loadJobs() {
    const { data, error } = await supabase
      .from('jobs')
      .select('id,customer_id,customer_name,pickup_address,status,scheduled_date')

    if (!error) {
      setJobs((data as Job[]) || [])
    }
  }

  async function refreshAll() {
    setLoading(true)
    await Promise.all([loadCustomers(), loadJobs()])
    setLoading(false)
  }

  useEffect(() => {
    refreshAll()

    const channel = supabase
      .channel('customers-page-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'customers' },
        async () => {
          await loadCustomers()
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

  const filteredCustomers = useMemo(() => {
    const query = search.trim().toLowerCase()

    return customers.filter((customer) => {
      if (!query) return true

      return (
        (customer.name || '').toLowerCase().includes(query) ||
        (customer.phone || '').toLowerCase().includes(query) ||
        (customer.email || '').toLowerCase().includes(query) ||
        (customer.address || '').toLowerCase().includes(query)
      )
    })
  }, [customers, search])

  const customerStats = useMemo(() => {
    const jobCountByCustomer: Record<string, number> = {}
    const activeJobCountByCustomer: Record<string, number> = {}

    for (const job of jobs) {
      if (!job.customer_id) continue
      jobCountByCustomer[job.customer_id] = (jobCountByCustomer[job.customer_id] || 0) + 1

      if (job.status === 'assigned' || job.status === 'in_progress') {
        activeJobCountByCustomer[job.customer_id] =
          (activeJobCountByCustomer[job.customer_id] || 0) + 1
      }
    }

    return { jobCountByCustomer, activeJobCountByCustomer }
  }, [jobs])

  const dashboardCounts = useMemo(() => {
    let activeCustomers = 0

    for (const customer of customers) {
      if ((customerStats.jobCountByCustomer[customer.id] || 0) > 0) {
        activeCustomers += 1
      }
    }

    return {
      total: customers.length,
      active: activeCustomers,
      withOpenJobs: Object.keys(customerStats.activeJobCountByCustomer).length,
    }
  }, [customers, customerStats])

  function openCreateModal() {
    setEditingCustomer(null)
    setForm(emptyForm)
    setShowCreateModal(true)
  }

  function openEditModal(customer: Customer) {
    setEditingCustomer(customer)
    setShowCreateModal(false)
    setForm({
      name: customer.name || '',
      phone: customer.phone || '',
      email: customer.email || '',
      address: customer.address || '',
    })
  }

  function closeModal() {
    setEditingCustomer(null)
    setShowCreateModal(false)
    setForm(emptyForm)
  }

  async function handleCreateOrUpdate() {
    setSaving(true)

    const payload = {
      name: form.name || null,
      phone: form.phone || null,
      email: form.email || null,
      address: form.address || null,
    }

    if (editingCustomer) {
      const { error } = await supabase
        .from('customers')
        .update(payload)
        .eq('id', editingCustomer.id)

      if (!error) {
        await refreshAll()
        closeModal()
      }
    } else {
      const { error } = await supabase.from('customers').insert([payload])

      if (!error) {
        await refreshAll()
        closeModal()
      }
    }

    setSaving(false)
  }

  async function handleDelete(customerId: string) {
    const relatedJobs = jobs.filter((job) => job.customer_id === customerId)

    if (relatedJobs.length > 0) {
      window.alert(
        'This customer has linked jobs. Delete or reassign those jobs first.'
      )
      return
    }

    const confirmed = window.confirm('Delete this customer?')
    if (!confirmed) return

    setDeletingId(customerId)

    const { error } = await supabase.from('customers').delete().eq('id', customerId)

    if (!error) {
      await refreshAll()
    }

    setDeletingId(null)
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="mx-auto max-w-7xl p-4 md:p-6">
        <div className="mb-6 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                Customers
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                Manage customer records for jobs, dispatching, and future growth
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
                New Customer
              </button>
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Total Customers
              </div>
              <div className="mt-2 text-2xl font-bold text-slate-900">
                {dashboardCounts.total}
              </div>
            </div>

            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                Active Customers
              </div>
              <div className="mt-2 text-2xl font-bold text-emerald-900">
                {dashboardCounts.active}
              </div>
            </div>

            <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-blue-700">
                Customers With Open Jobs
              </div>
              <div className="mt-2 text-2xl font-bold text-blue-900">
                {dashboardCounts.withOpenJobs}
              </div>
            </div>
          </div>

          <div className="mt-6">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search customer name, phone, email, or address"
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-slate-400"
            />
          </div>
        </div>

        <div className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-slate-200">
          {loading ? (
            <div className="p-10 text-center text-sm text-slate-500">
              Loading customers...
            </div>
          ) : filteredCustomers.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">
              No customers found.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                      Customer
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                      Contact
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                      Address
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                      Jobs
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
                  {filteredCustomers.map((customer) => {
                    const totalJobs = customerStats.jobCountByCustomer[customer.id] || 0
                    const activeJobs =
                      customerStats.activeJobCountByCustomer[customer.id] || 0
                    const status = totalJobs > 0 ? 'active' : 'inactive'
                    const badgeClass =
                      CUSTOMER_STATUS_STYLES[status] || CUSTOMER_STATUS_STYLES.inactive

                    return (
                      <tr key={customer.id} className="hover:bg-slate-50/80">
                        <td className="px-4 py-4 align-top">
                          <div className="font-semibold text-slate-900">
                            {customer.name || 'Unnamed Customer'}
                          </div>
                          <div className="mt-1 text-xs text-slate-500">
                            Added {formatDate(customer.created_at)}
                          </div>
                        </td>

                        <td className="px-4 py-4 align-top text-sm text-slate-700">
                          <div>{customer.phone || '—'}</div>
                          <div className="mt-1 text-slate-500">{customer.email || '—'}</div>
                        </td>

                        <td className="px-4 py-4 align-top text-sm text-slate-700">
                          {customer.address || '—'}
                        </td>

                        <td className="px-4 py-4 align-top text-sm text-slate-700">
                          <div>Total: {totalJobs}</div>
                          <div className="mt-1 text-slate-500">Open: {activeJobs}</div>
                        </td>

                        <td className="px-4 py-4 align-top">
                          <span
                            className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${badgeClass}`}
                          >
                            {status === 'active' ? 'Active' : 'Inactive'}
                          </span>
                        </td>

                        <td className="px-4 py-4 align-top">
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => openEditModal(customer)}
                              className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition hover:opacity-90"
                            >
                              Edit
                            </button>

                            <button
                              onClick={() => handleDelete(customer.id)}
                              disabled={deletingId === customer.id}
                              className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                            >
                              {deletingId === customer.id ? 'Deleting...' : 'Delete'}
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
      </div>

      {(showCreateModal || editingCustomer) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-2xl rounded-3xl bg-white p-6 shadow-2xl">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-slate-900">
                  {editingCustomer ? 'Edit Customer' : 'Create Customer'}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {editingCustomer
                    ? 'Update customer information'
                    : 'Add a new customer to your operations system'}
                </p>
              </div>

              <button
                onClick={closeModal}
                className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200"
              >
                Close
              </button>
            </div>

            <div className="grid gap-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Name
                </label>
                <input
                  value={form.name}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, name: e.target.value }))
                  }
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-slate-400"
                  placeholder="Customer name"
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Phone
                  </label>
                  <input
                    value={form.phone}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, phone: e.target.value }))
                    }
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-slate-400"
                    placeholder="Phone number"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Email
                  </label>
                  <input
                    value={form.email}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, email: e.target.value }))
                    }
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-slate-400"
                    placeholder="Email address"
                  />
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Address
                </label>
                <textarea
                  rows={4}
                  value={form.address}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, address: e.target.value }))
                  }
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-slate-400"
                  placeholder="Customer address"
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
                {saving ? 'Saving...' : editingCustomer ? 'Save Changes' : 'Create Customer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}