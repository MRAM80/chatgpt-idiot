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

type Bin = {
  id: string
  bin_number: string | null
  bin_type: string | null
  location: string | null
  status: string | null
}

const navItems = [
  { href: '/admin', label: 'Dashboard' },
  { href: '/dispatcher', label: 'Dispatch Window' },
  { href: '/jobs', label: 'Jobs' },
  { href: '/drivers', label: 'Drivers' },
  { href: '/bins', label: 'Bins' },
]

export default function BinsPage() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [bins, setBins] = useState<Bin[]>([])
  const [loading, setLoading] = useState(true)
  const [binNumber, setBinNumber] = useState('')
  const [binType, setBinType] = useState('')
  const [location, setLocation] = useState('')
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
      .from('bins')
      .select('id, bin_number, bin_type, location, status')
      .order('created_at', { ascending: false })

    if (error) setErrorMessage(error.message)

    setBins((data as Bin[]) || [])
    setLoading(false)
  }

  async function addBin() {
    if (!binNumber) return

    const { error } = await supabase.from('bins').insert({
      bin_number: binNumber,
      bin_type: binType,
      location: location,
      status: 'available',
    })

    if (error) {
      setErrorMessage(error.message)
      return
    }

    setBinNumber('')
    setBinType('')
    setLocation('')
    loadPage()
  }

  async function toggleStatus(id: string, current: string | null) {
    const newStatus = current === 'available' ? 'unavailable' : 'available'

    await supabase.from('bins').update({ status: newStatus }).eq('id', id)
    loadPage()
  }

  async function deleteBin(id: string) {
    await supabase.from('bins').delete().eq('id', id)
    loadPage()
  }

  return (
    <DashboardShell
      title="Bin Management"
      subtitle="Create and manage bins"
      roleLabel={profile?.role || 'Admin'}
      userName={profile?.full_name || profile?.email || 'User'}
      navItems={navItems}
    >
      {errorMessage && <div className="mb-4 text-red-600">{errorMessage}</div>}

      <div className="bg-white p-6 rounded-2xl shadow mb-6">
        <h2 className="font-bold mb-4">Add Bin</h2>
        <div className="grid gap-3 md:grid-cols-3">
          <input
            placeholder="Bin number"
            value={binNumber}
            onChange={(e) => setBinNumber(e.target.value)}
            className="border p-3 rounded-xl"
          />
          <input
            placeholder="Bin type"
            value={binType}
            onChange={(e) => setBinType(e.target.value)}
            className="border p-3 rounded-xl"
          />
          <input
            placeholder="Location"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="border p-3 rounded-xl"
          />
          <button onClick={addBin} className="bg-black text-white rounded-xl">
            Add
          </button>
        </div>
      </div>

      <div className="bg-white p-6 rounded-2xl shadow">
        <h2 className="font-bold mb-4">Bins</h2>

        {loading ? (
          <p>Loading...</p>
        ) : (
          <div className="space-y-3">
            {bins.map((b) => (
              <div key={b.id} className="flex justify-between items-center border p-3 rounded-xl">
                <div>
                  <p className="font-semibold">{b.bin_number}</p>
                  <p className="text-sm text-gray-500">
                    {b.bin_type} • {b.location}
                  </p>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => toggleStatus(b.id, b.status)}
                    className={`px-3 py-1 rounded ${
                      b.status === 'available' ? 'bg-green-200' : 'bg-gray-200'
                    }`}
                  >
                    {b.status}
                  </button>

                  <button
                    onClick={() => deleteBin(b.id)}
                    className="px-3 py-1 bg-red-500 text-white rounded"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}

            {!bins.length && <p>No bins</p>}
          </div>
        )}
      </div>
    </DashboardShell>
  )
}