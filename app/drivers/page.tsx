'use client'

import { useEffect, useState } from 'react'
import DashboardShell from '@/components/dashboard-shell'
import { supabase } from '@/lib/supabase'

type Profile = {
  id: string
  full_name: string | null
  email: string | null
  role: string | null
}

type Driver = {
  id: string
  full_name: string | null
  email: string | null
  status: string | null
}

const navItems = [
  { href: '/admin', label: 'Dashboard' },
  { href: '/dispatcher', label: 'Dispatch Window' },
  { href: '/jobs', label: 'Jobs' },
  { href: '/drivers', label: 'Drivers' },
  { href: '/bins', label: 'Bins' },
]

export default function DriversPage() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    void loadPage()
  }, [])

  async function loadPage() {
    setLoading(true)
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return

    const { data: profileData } = await supabase
      .from('profiles')
      .select('id, full_name, email, role')
      .eq('id', user.id)
      .single()

    setProfile(profileData || null)

    const { data, error } = await supabase
      .from('drivers')
      .select('id, full_name, email, status')
      .order('created_at', { ascending: false })

    if (error) setErrorMessage(error.message)

    setDrivers((data as Driver[]) || [])
    setLoading(false)
  }

  async function addDriver() {
    if (!name) return

    const { error } = await supabase.from('drivers').insert({
      full_name: name,
      email,
      status: 'active',
    })

    if (error) {
      setErrorMessage(error.message)
      return
    }

    setName('')
    setEmail('')
    loadPage()
  }

  async function toggleStatus(id: string, current: string | null) {
    const newStatus = current === 'active' ? 'inactive' : 'active'

    await supabase.from('drivers').update({ status: newStatus }).eq('id', id)
    loadPage()
  }

  async function deleteDriver(id: string) {
    await supabase.from('drivers').delete().eq('id', id)
    loadPage()
  }

  return (
    <DashboardShell
      title="Driver Management"
      subtitle="Create and manage drivers"
      roleLabel={profile?.role || 'Admin'}
      userName={profile?.full_name || profile?.email || 'User'}
      navItems={navItems}
    >
      {errorMessage && <div className="mb-4 text-red-600">{errorMessage}</div>}

      <div className="bg-white p-6 rounded-2xl shadow mb-6">
        <h2 className="font-bold mb-4">Add Driver</h2>
        <div className="grid gap-3 md:grid-cols-3">
          <input
            placeholder="Full name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="border p-3 rounded-xl"
          />
          <input
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="border p-3 rounded-xl"
          />
          <button onClick={addDriver} className="bg-black text-white rounded-xl">
            Add
          </button>
        </div>
      </div>

      <div className="bg-white p-6 rounded-2xl shadow">
        <h2 className="font-bold mb-4">Drivers</h2>

        {loading ? (
          <p>Loading...</p>
        ) : (
          <div className="space-y-3">
            {drivers.map((d) => (
              <div key={d.id} className="flex justify-between items-center border p-3 rounded-xl">
                <div>
                  <p className="font-semibold">{d.full_name}</p>
                  <p className="text-sm text-gray-500">{d.email}</p>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => toggleStatus(d.id, d.status)}
                    className={`px-3 py-1 rounded ${
                      d.status === 'active' ? 'bg-green-200' : 'bg-gray-200'
                    }`}
                  >
                    {d.status}
                  </button>

                  <button
                    onClick={() => deleteDriver(d.id)}
                    className="px-3 py-1 bg-red-500 text-white rounded"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}

            {!drivers.length && <p>No drivers</p>}
          </div>
        )}
      </div>
    </DashboardShell>
  )
}