'use client'

import Link from 'next/link'
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

type Bin = {
  id: string
  bin_number: string
  size: string
  current_location: string | null
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

export default function BinsPage() {
  const router = useRouter()

  const [profile, setProfile] = useState<Profile | null>(null)
  const [bins, setBins] = useState<Bin[]>([])
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  const [binNumber, setBinNumber] = useState('')
  const [size, setSize] = useState('')
  const [currentLocation, setCurrentLocation] = useState('yard')
  const [status, setStatus] = useState('available')
  const [driverId, setDriverId] = useState('')

  useEffect(() => {
    loadPage()
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
    await Promise.all([loadBins(), loadDrivers()])
    setLoading(false)
  }

  async function loadBins() {
    const { data, error } = await supabase
      .from('bins')
      .select(
        'id, bin_number, size, current_location, status, driver_id, created_at'
      )
      .order('created_at', { ascending: false })

    if (error) {
      setErrorMessage(error.message)
      return
    }

    setBins(data || [])
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

  async function handleAddBin(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setErrorMessage('')

    const cleanBinNumber = binNumber.trim()
    const cleanSize = size.trim()
    const cleanLocation = currentLocation.trim()

    if (!cleanBinNumber || !cleanSize || !cleanLocation) {
      setErrorMessage('Please fill all required fields.')
      setSaving(false)
      return
    }

    const payload = {
      bin_number: cleanBinNumber,
      size: cleanSize,
      current_location: cleanLocation,
      status,
      driver_id: driverId || null,
    }

    const { error } = await supabase.from('bins').insert(payload)

    if (error) {
      setErrorMessage(error.message)
      setSaving(false)
      return
    }

    setBinNumber('')
    setSize('')
    setCurrentLocation('yard')
    setStatus('available')
    setDriverId('')

    await loadBins()
    setSaving(false)
  }

  async function handleDeleteBin(id: string) {
    const confirmed = window.confirm('Delete this bin?')
    if (!confirmed) return

    setErrorMessage('')

    const { error } = await supabase.from('bins').delete().eq('id', id)

    if (error) {
      setErrorMessage(error.message)
      return
    }

    await loadBins()
  }

  async function handleQuickUpdate(
    id: string,
    field: 'current_location' | 'status' | 'driver_id',
    value: string
  ) {
    setErrorMessage('')

    const updateValue =
      field === 'driver_id' ? (value === '' ? null : value) : value

    const { error } = await supabase
      .from('bins')
      .update({ [field]: updateValue })
      .eq('id', id)

    if (error) {
      setErrorMessage(error.message)
      return
    }

    await loadBins()
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <DashboardShell
      title="Bins"
      subtitle="Track available and assigned bins."
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
                Dashboard / Bins
              </div>
              <h1 className="text-xl font-semibold text-gray-900">
                Bins Operations
              </h1>
              <p className="text-sm text-gray-500">
                Manage location, status, and driver assignment.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => router.push('/admin')}
                className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-100"
              >
                ← Back to Dashboard
              </button>

              <button
                onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                className="rounded-xl bg-black px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
              >
                + Add New Bin
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

          <form onSubmit={handleAddBin} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <input
                type="text"
                placeholder="Bin number"
                value={binNumber}
                onChange={(e) => setBinNumber(e.target.value)}
                className="rounded-xl border border-gray-300 px-4 py-3 outline-none transition focus:border-black"
              />

              <input
                type="text"
                placeholder="Size"
                value={size}
                onChange={(e) => setSize(e.target.value)}
                className="rounded-xl border border-gray-300 px-4 py-3 outline-none transition focus:border-black"
              />

              <select
                value={currentLocation}
                onChange={(e) => setCurrentLocation(e.target.value)}
                className="rounded-xl border border-gray-300 px-4 py-3 outline-none transition focus:border-black"
              >
                <option value="yard">yard</option>
                <option value="customer site">customer site</option>
                <option value="landfill">landfill</option>
                <option value="in transit">in transit</option>
                <option value="shop">shop</option>
              </select>

              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="rounded-xl border border-gray-300 px-4 py-3 outline-none transition focus:border-black"
              >
                <option value="available">available</option>
                <option value="assigned">assigned</option>
                <option value="delivered">delivered</option>
                <option value="picked up">picked up</option>
                <option value="maintenance">maintenance</option>
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
              {saving ? 'Saving...' : 'Add Bin'}
            </button>
          </form>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-200 px-5 py-4">
            <h2 className="text-xl font-semibold text-gray-900">All Bins</h2>
          </div>

          {loading ? (
            <div className="p-5 text-sm text-gray-500">Loading bins...</div>
          ) : bins.length === 0 ? (
            <div className="p-5 text-sm text-gray-500">No bins found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-left text-gray-600">
                  <tr>
                    <th className="px-5 py-3 font-semibold">Bin #</th>
                    <th className="px-5 py-3 font-semibold">Size</th>
                    <th className="px-5 py-3 font-semibold">Location</th>
                    <th className="px-5 py-3 font-semibold">Status</th>
                    <th className="px-5 py-3 font-semibold">Driver</th>
                    <th className="px-5 py-3 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {bins.map((bin) => (
                    <tr key={bin.id} className="border-t border-gray-100">
                      <td className="px-5 py-4 font-medium text-gray-900">
                        {bin.bin_number}
                      </td>

                      <td className="px-5 py-4 text-gray-700">{bin.size}</td>

                      <td className="px-5 py-4">
                        <select
                          value={bin.current_location || 'yard'}
                          onChange={(e) =>
                            handleQuickUpdate(
                              bin.id,
                              'current_location',
                              e.target.value
                            )
                          }
                          className="rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-black"
                        >
                          <option value="yard">yard</option>
                          <option value="customer site">customer site</option>
                          <option value="landfill">landfill</option>
                          <option value="in transit">in transit</option>
                          <option value="shop">shop</option>
                        </select>
                      </td>

                      <td className="px-5 py-4">
                        <select
                          value={bin.status || 'available'}
                          onChange={(e) =>
                            handleQuickUpdate(bin.id, 'status', e.target.value)
                          }
                          className="rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-black"
                        >
                          <option value="available">available</option>
                          <option value="assigned">assigned</option>
                          <option value="delivered">delivered</option>
                          <option value="picked up">picked up</option>
                          <option value="maintenance">maintenance</option>
                        </select>
                      </td>

                      <td className="px-5 py-4">
                        <select
                          value={bin.driver_id || ''}
                          onChange={(e) =>
                            handleQuickUpdate(bin.id, 'driver_id', e.target.value)
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
                          onClick={() => handleDeleteBin(bin.id)}
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

        <div className="fixed bottom-4 left-1/2 z-30 w-[calc(100%-24px)] max-w-md -translate-x-1/2 rounded-2xl border border-gray-200 bg-white/95 p-2 shadow-lg backdrop-blur md:hidden">
          <div className="grid grid-cols-4 gap-2 text-center text-xs font-medium">
            <Link
              href="/admin"
              className="rounded-xl px-2 py-3 text-gray-700 hover:bg-gray-100"
            >
              Home
            </Link>
            <Link
              href="/loads"
              className="rounded-xl px-2 py-3 text-gray-700 hover:bg-gray-100"
            >
              Loads
            </Link>
            <Link
              href="/drivers"
              className="rounded-xl px-2 py-3 text-gray-700 hover:bg-gray-100"
            >
              Drivers
            </Link>
            <Link href="/bins" className="rounded-xl bg-black px-2 py-3 text-white">
              Bins
            </Link>
          </div>
        </div>
      </div>
    </DashboardShell>
  )
}