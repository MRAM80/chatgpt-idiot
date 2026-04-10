'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Customer = {
  id: string
  name: string | null
  phone: string | null
  email: string | null
  address: string | null
  status: string | null
  created_at: string | null
  updated_at: string | null
}

type Order = {
  id: string
  customer_id: string | null
  customer_name: string | null
  pickup_address: string | null
  status: string | null
  scheduled_date: string | null
}

const CUSTOMER_STATUSES = ['active', 'inactive'] as const

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

function formatStatus(status: string | null | undefined) {
  if (!status) return 'Active'
  return status.charAt(0).toUpperCase() + status.slice(1)
}

export default function CustomersPage() {
  const supabase = createClient()

  const [customers, setCustomers] = useState<Customer[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [pageError, setPageError] = useState('')

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null)

  const emptyForm = {
    name: '',
    phone: '',
    email: '',
    address: '',
    status: 'active',
  }

  const [form, setForm] = useState(emptyForm)

  async function loadCustomers() {
    const { data, error } = await supabase
      .from('customers')
      .select('id,name,phone,email,address,status,created_at,updated_at')
      .order('created_at', { ascending: false })

    if (error) {
      setPageError(error.message)
      return
    }

    setCustomers((data as Customer[]) || [])
  }

  async function loadOrders() {
    const { data, error } = await supabase
      .from('order')
      .select('id,customer_id,customer_name,pickup_address,status,scheduled_date')

    if (error) {
      setPageError(error.message)
      return
    }

    setOrders((data as Order[]) || [])
  }

  async function refreshAll() {
    setLoading(true)
    setPageError('')
    await Promise.all([loadCustomers(), loadOrders()])
    setLoading(false)
  }

  useEffect(() => {
    void refreshAll()

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
        { event: '*', schema: 'public', table: 'order' },
        async () => {
          await loadOrders()
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
      const matchesSearch =
        !query ||
        (customer.name || '').toLowerCase().includes(query) ||
        (customer.phone || '').toLowerCase().includes(query) ||
        (customer.email || '').toLowerCase().includes(query) ||
        (customer.address || '').toLowerCase().includes(query)

      const matchesStatus =
        statusFilter === 'all' || (customer.status || 'active') === statusFilter

      return matchesSearch && matchesStatus
    })
  }, [customers, search, statusFilter])

  const customerStats = useMemo(() => {
    const orderCountByCustomer: Record<string, number> = {}
    const activeOrderCountByCustomer: Record<string, number> = {}

    for (const order of orders) {
      if (!order.customer_id) continue

      orderCountByCustomer[order.customer_id] =
        (orderCountByCustomer[order.customer_id] || 0) + 1

      if (order.status === 'assigned' || order.status === 'in_progress') {
        activeOrderCountByCustomer[order.customer_id] =
          (activeOrderCountByCustomer[order.customer_id] || 0) + 1
      }
    }

    return { orderCountByCustomer, activeOrderCountByCustomer }
  }, [orders])

  const dashboardCounts = useMemo(() => {
    return {
      total: customers.length,
      active: customers.filter((customer) => (customer.status || 'active') === 'active').length,
      inactive: customers.filter((customer) => customer.status === 'inactive').length,
      withOpenOrders: Object.keys(customerStats.activeOrderCountByCustomer).length,
    }
  }, [customers, customerStats])

  function openCreateModal() {
    setEditingCustomer(null)
    setForm(emptyForm)
    setPageError('')
    setShowCreateModal(true)
  }

  function openEditModal(customer: Customer) {
    setEditingCustomer(customer)
    setShowCreateModal(false)
    setPageError('')
    setForm({
      name: customer.name || '',
      phone: customer.phone || '',
      email: customer.email || '',
      address: customer.address || '',
      status: customer.status || 'active',
    })
  }

  function closeModal() {
    setEditingCustomer(null)
    setShowCreateModal(false)
    setForm(emptyForm)
    setPageError('')
  }

  async function handleCreateOrUpdate() {
    setSaving(true)
    setPageError('')

    if (!form.name.trim()) {
      setPageError('Customer name is required.')
      setSaving(false)
      return
    }

    const payload = {
      name: form.name.trim(),
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      address: form.address.trim() || null,
      status: form.status || 'active',
    }

    if (editingCustomer) {
      const { error } = await supabase
        .from('customers')
        .update(payload)
        .eq('id', editingCustomer.id)

      if (error) {
        setPageError(error.message)
      } else {
        await refreshAll()
        closeModal()
      }
    } else {
      const { error } = await supabase.from('customers').insert([payload])

      if (error) {
        setPageError(error.message)
      } else {
        await refreshAll()
        closeModal()
      }
    }

    setSaving(false)
  }

  async function handleDelete(customerId: string) {
    const relatedOrders = orders.filter((order) => order.customer_id === customerId)

    if (relatedOrders.length > 0) {
      window.alert(
        'This customer has linked orders. Delete or reassign those orders first.'
      )
      return
    }

    const confirmed = window.confirm('Delete this customer?')
    if (!confirmed) return

    setDeletingId(customerId)
    setPageError('')

    const { error } = await supabase.from('customers').delete().eq('id', customerId)

    if (error) {
      setPageError(error.message)
    } else {
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
                Manage customer companies and contacts separately from job site / bin placement addresses
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

          {pageError ? (
            <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {pageError}
            </div>
          ) : null}

          <div className="mt-6 grid gap-4 md:grid-cols-4">
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

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                Inactive Customers
              </div>
              <div className="mt-2 text-2xl font-bold text-slate-900">
                {dashboardCounts.inactive}
              </div>
            </div>

            <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-blue-700">
                Customers With Open Orders
              </div>
              <div className="mt-2 text-2xl font-bold text-blue-900">
                {dashboardCounts.withOpenOrders}
              </div>
            </div>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search customer name, phone, email, or company address"
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-slate-400"
            />

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-slate-400"
            >
              <option value="all">All Statuses</option>
              {CUSTOMER_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {formatStatus(status)}
                </option>
              ))}
            </select>
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
                      Company / Billing Address
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                      Orders
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
                    const totalOrders = customerStats.orderCountByCustomer[customer.id] || 0
                    const activeOrders =
                      customerStats.activeOrderCountByCustomer[customer.id] || 0
                    const status = customer.status || 'active'
                    const badgeClass =
                      CUSTOMER_STATUS_STYLES[status] || CUSTOMER_STATUS_STYLES.active

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
                          <div>Total: {totalOrders}</div>
                          <div className="mt-1 text-slate-500">Open: {activeOrders}</div>
                        </td>

                        <td className="px-4 py-4 align-top">
                          <span
                            className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${badgeClass}`}
                          >
                            {formatStatus(status)}
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

        <div className="mt-6 flex justify-center">
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            Back to Dashboard
          </Link>
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
                  Save company/customer details here. Job site or bin placement address belongs on the order.
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
                  Name
                </label>
                <input
                  value={form.name}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, name: e.target.value }))
                  }
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-slate-400"
                  placeholder="Customer or company name"
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
                  Company / Billing Address
                </label>
                <textarea
                  rows={4}
                  value={form.address}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, address: e.target.value }))
                  }
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-slate-400"
                  placeholder="Company office address or residential billing address"
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
                  {CUSTOMER_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {formatStatus(status)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                Customer address is for the company or billing contact.  
                The bin placement / job site address should be entered on the order.
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