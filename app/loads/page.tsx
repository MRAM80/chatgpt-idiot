'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import DashboardShell from '@/components/dashboard-shell'

type Profile = {
  id: string
  email: string
  role: string
  full_name?: string | null
}

type Driver = {
  id: string
  full_name: string
}

type Load = {
  id: string
  customer_name: string
  material: string | null
  pickup_address: string | null
  dropoff_address: string | null
  scheduled_date: string | null
  status: string | null
  driver_id: string | null
  created_at: string
}

const navItems = [
  { href: '/admin', label: 'Dashboard' },
  { href: '/loads', label: 'Loads' },
  { href: '/drivers', label: 'Drivers' },
  { href: '/bins', label: 'Bins' },
]

export default function LoadsPage() {
  const router = useRouter()

  const [profile, setProfile] = useState<Profile | null>(null)
  const [loads, setLoads] = useState<Load[]>([])
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  const [customerName, setCustomerName] = useState('')
  const [material, setMaterial] = useState('')
  const [pickupAddress, setPickupAddress] = useState('')
  const [dropoffAddress, setDropoffAddress] = useState('')
  const [scheduledDate, setScheduledDate] = useState('')
  const [status, setStatus] = useState('pending')
  const [driverId, setDriverId] = useState('')

  useEffect(() => {
    let cleanup: (() => void) | undefined

    async function init() {
      cleanup = await loadPage()
    }

    init()

    return () => {
      if (cleanup) cleanup()
    }
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
      .select('id, email, role, full_name')
      .eq('id', user.id)
      .single()

    if (
      profileError ||
      !profileData ||
      !['admin', 'dispatcher'].includes(profileData.role || '')
    ) {
      router.push('/login')
      return
    }

    setProfile(profileData)
    await Promise.all([loadLoads(), loadDrivers()])
    setLoading(false)

    return setupRealtime()
  }

  function setupRealtime() {
    const channel = supabase
      .channel('loads-page-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'loads' },
        async () => {
          await loadLoads()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }

  async function loadLoads() {
    const { data, error } = await supabase
      .from('loads')
      .select(
        'id, customer_name, material, pickup_address, dropoff_address, scheduled_date, status, driver_id, created_at'
      )
      .order('created_at', { ascending: false })

    if (error) {
      setErrorMessage(error.message)
      return
    }

    setLoads(data || [])
  }

  async function loadDrivers() {
    const { data, error } = await supabase
      .from('drivers')
      .select('id, full_name')
      .order('full_name', { ascending: true })

    if (error) {
      setErrorMessage(error.message)
      return
    }

    setDrivers(data || [])
  }

  async function handleAddLoad(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setErrorMessage('')

    const cleanCustomer = customerName.trim()

    if (!cleanCustomer) {
      setErrorMessage('Customer name is required.')
      setSaving(false)
      return
    }

    const { error } = await supabase.from('loads').insert({
      customer_name: cleanCustomer,
      material: material.trim() || null,
      pickup_address: pickupAddress.trim() || null,
      dropoff_address: dropoffAddress.trim() || null,
      scheduled_date: scheduledDate || null,
      status,
      driver_id: driverId || null,
    })

    if (error) {
      setErrorMessage(error.message)
      setSaving(false)
      return
    }

    setCustomerName('')
    setMaterial('')
    setPickupAddress('')
    setDropoffAddress('')
    setScheduledDate('')
    setStatus('pending')
    setDriverId('')
    setSaving(false)

    await loadLoads()
  }

  async function handleDeleteLoad(id: string) {
    const confirmed = window.confirm('Delete this load?')
    if (!confirmed) return

    const { error } = await supabase.from('loads').delete().eq('id', id)

    if (error) {
      setErrorMessage(error.message)
      return
    }

    await loadLoads()
  }

  async function handleQuickUpdate(
    id: string,
    field: 'status' | 'driver_id',
    value: string
  ) {
    const updateValue = field === 'driver_id' ? value || null : value

    const { error } = await supabase
      .from('loads')
      .update({ [field]: updateValue })
      .eq('id', id)

    if (error) {
      setErrorMessage(error.message)
      return
    }

    await loadLoads()
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <DashboardShell
      title="Loads"
      subtitle="Track loads, scheduling, and driver assignment."
      roleLabel={profile?.role?.toUpperCase()}
      userName={profile?.full_name || profile?.email || 'User'}
      navItems={navItems}
      onLogout={handleLogout}
    >
      <div className="space-y-6 pb-24 md:pb-6">
        <div className="sticky top-0 z-20 -mx-1 rounded-2xl border border-gray-200 bg-white/95 px-4 py-3 shadow-sm backdrop-blur">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500">
                Dashboard / Loads
              </div>
              <h1 className="text-xl font-semibold text-gray-900">
                Load Operations
              </h1>
              <p className="text-sm text-gray-500">
                Schedule jobs and assign drivers.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => router.push('/admin')}
                className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-100"
              >
                ← Back to Dashboard
              </button>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          {errorMessage ? (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {errorMessage}
            </div>
          ) : null}

          <form onSubmit={handleAddLoad} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <input
                type="text"
                placeholder="Customer name"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="rounded-xl border border-gray-300 px-4 py-3 outline-none transition focus:border-black"
              />

              <input
                type="text"
                placeholder="Material"
                value={material}
                onChange={(e) => setMaterial(e.target.value)}
                className="rounded-xl border border-gray-300 px-4 py-3 outline-none transition focus:border-black"
              />

              <input
                type="text"
                placeholder="Pickup address"
                value={pickupAddress}
                onChange={(e) => setPickupAddress(e.target.value)}
                className="rounded-xl border border-gray-300 px-4 py-3 outline-none transition focus:border-black"
              />

              <input
                type="text"
                placeholder="Dropoff address"
                value={dropoffAddress}
                onChange={(e) => setDropoffAddress(e.target.value)}
                className="rounded-xl border border-gray-300 px-4 py-3 outline-none transition focus:border-black"
              />

              <input
                type="date"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
                className="rounded-xl border border-gray-300 px-4 py-3 outline-none transition focus:border-black"
              />

              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="rounded-xl border border-gray-300 px-4 py-3 outline-none transition focus:border-black"
              >
                <option value="pending">pending</option>
                <option value="scheduled">scheduled</option>
                <option value="assigned">assigned</option>
                <option value="in progress">in progress</option>
                <option value="completed">completed</option>
                <option value="cancelled">cancelled</option>
              </select>

              <select
                value={driverId}
                onChange={(e) => setDriverId(e.target.value)}
                className="rounded-xl border border-gray-300 px-4 py-3 outline-none transition focus:border-black"
              >
                <option value="">No driver</option>
                {drivers.map((driver) => (
                  <option key={driver.id} value={driver.id}>
                    {driver.full_name}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-black px-5 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? 'Saving...' : 'Add Load'}
            </button>
          </form>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-200 px-5 py-4">
            <h2 className="text-xl font-semibold text-gray-900">All Loads</h2>
          </div>

          {loading ? (
            <div className="p-5 text-sm text-gray-500">Loading loads...</div>
          ) : loads.length === 0 ? (
            <div className="p-5 text-sm text-gray-500">No loads found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-left text-gray-600">
                  <tr>
                    <th className="px-5 py-3 font-semibold">Customer</th>
                    <th className="px-5 py-3 font-semibold">Material</th>
                    <th className="px-5 py-3 font-semibold">Pickup</th>
                    <th className="px-5 py-3 font-semibold">Dropoff</th>
                    <th className="px-5 py-3 font-semibold">Date</th>
                    <th className="px-5 py-3 font-semibold">Status</th>
                    <th className="px-5 py-3 font-semibold">Driver</th>
                    <th className="px-5 py-3 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loads.map((load) => (
                    <tr key={load.id} className="border-t border-gray-100">
                      <td className="px-5 py-4 font-medium text-gray-900">
                        {load.customer_name}
                      </td>
                      <td className="px-5 py-4 text-gray-700">
                        {load.material || '-'}
                      </td>
                      <td className="px-5 py-4 text-gray-700">
                        {load.pickup_address || '-'}
                      </td>
                      <td className="px-5 py-4 text-gray-700">
                        {load.dropoff_address || '-'}
                      </td>
                      <td className="px-5 py-4 text-gray-700">
                        {load.scheduled_date || '-'}
                      </td>
                      <td className="px-5 py-4">
                        <select
                          value={load.status || 'pending'}
                          onChange={(e) =>
                            handleQuickUpdate(load.id, 'status', e.target.value)
                          }
                          className="rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-black"
                        >
                          <option value="pending">pending</option>
                          <option value="scheduled">scheduled</option>
                          <option value="assigned">assigned</option>
                          <option value="in progress">in progress</option>
                          <option value="completed">completed</option>
                          <option value="cancelled">cancelled</option>
                        </select>
                      </td>
                      <td className="px-5 py-4">
                        <select
                          value={load.driver_id || ''}
                          onChange={(e) =>
                            handleQuickUpdate(load.id, 'driver_id', e.target.value)
                          }
                          className="rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-black"
                        >
                          <option value="">No driver</option>
                          {drivers.map((driver) => (
                            <option key={driver.id} value={driver.id}>
                              {driver.full_name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-5 py-4">
                        <button
                          onClick={() => handleDeleteLoad(load.id)}
                          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 font-medium text-red-700 transition hover:bg-red-100"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </DashboardShell>
  )
}