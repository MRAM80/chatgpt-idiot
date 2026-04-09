'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
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
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [bins, setBins] = useState<Bin[]>([])
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState({
    bin_number: '',
    bin_type: '',
    location: '',
  })

  useEffect(() => {
    void loadPage()
  }, [])

  async function loadPage() {
    setLoading(true)

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      router.push('/login')
      return
    }

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
    if (!form.bin_number) return

    setSaving(true)

    const { error } = await supabase.from('bins').insert({
      bin_number: form.bin_number,
      bin_type: form.bin_type,
      location: form.location,
      status: 'available',
    })

    if (error) {
      setErrorMessage(error.message)
      setSaving(false)
      return
    }

    setForm({ bin_number: '', bin_type: '', location: '' })
    await loadPage()
    setSaving(false)
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
      title="Bins Management"
      subtitle="Manage your bins inventory"
      roleLabel={profile?.role || 'Admin'}
      userName={profile?.full_name || profile?.email || 'User'}
      navItems={navItems}
    >
      {errorMessage && (
        <div className="mb-6 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
        <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6">
          <h2 className="text-lg font-bold mb-4">Add Bin</h2>

          <div className="grid gap-3 md:grid-cols-2">
            <input
              placeholder="Bin Number"
              value={form.bin_number}
              onChange={(e) => setForm({ ...form, bin_number: e.target.value })}
              className="input"
            />
            <input
              placeholder="Bin Type"
              value={form.bin_type}
              onChange={(e) => setForm({ ...form, bin_type: e.target.value })}
              className="input"
            />
            <input
              placeholder="Location"
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
              className="input"
            />
            <button onClick={addBin} disabled={saving} className="bg-black text-white rounded-xl">
              {saving ? 'Adding...' : 'Add Bin'}
            </button>
          </div>
        </div>

        <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6">
          <h2 className="text-lg font-bold mb-4">Summary</h2>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span>Total Bins</span>
              <span>{bins.length}</span>
            </div>
            <div className="flex justify-between">
              <span>Available</span>
              <span>{bins.filter(b => b.status === 'available').length}</span>
            </div>
            <div className="flex justify-between">
              <span>Unavailable</span>
              <span>{bins.filter(b => b.status !== 'available').length}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 bg-white rounded-3xl shadow-sm border border-slate-200 p-6">
        <h2 className="text-lg font-bold mb-4">Bins List</h2>

        {loading ? (
          <p>Loading...</p>
        ) : (
          <div className="space-y-3">
            {bins.map((b) => (
              <div key={b.id} className="flex justify-between items-center border p-4 rounded-xl">
                <div>
                  <p className="font-semibold">{b.bin_number}</p>
                  <p className="text-sm text-slate-500">
                    {b.bin_type} • {b.location}
                  </p>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => toggleStatus(b.id, b.status)}
                    className={`px-3 py-1 rounded text-xs ${
                      b.status === 'available'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {b.status}
                  </button>

                  <button
                    onClick={() => deleteBin(b.id)}
                    className="text-red-600 text-xs"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}

            {!bins.length && (
              <p className="text-center text-slate-400 py-6">No bins found</p>
            )}
          </div>
        )}
      </div>
    </DashboardShell>
  )
}