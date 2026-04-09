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
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState({
    full_name: '',
    email: '',
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
      .from('drivers')
      .select('id, full_name, email, status')
      .order('created_at', { ascending: false })

    if (error) setErrorMessage(error.message)

    setDrivers((data as Driver[]) || [])
    setLoading(false)
  }

  async function addDriver() {
    if (!form.full_name) return

    setSaving(true)

    const { error } = await supabase.from('drivers').insert({
      full_name: form.full_name,
      email: form.email,
      status: 'active',
    })

    if (error) {
      setErrorMessage(error.message)
      setSaving(false)
      return
    }

    setForm({ full_name: '', email: '' })
    await loadPage()
    setSaving(false)
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

  function badge(status: string | null) {
    return status === 'active'
      ? 'bg-emerald-100 text-emerald-700'
      : 'bg-slate-100 text-slate-600'
  }

  return (
    <DashboardShell
      title="Drivers Management"
      subtitle="Manage your driver team and availability"
      roleLabel={profile?.role || 'Admin'}
      userName={profile?.full_name || profile?.email || 'User'}
      navItems={navItems}
    >
      {errorMessage && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      )}

      {/* TOP GRID */}
      <div className="grid gap-6 xl:grid-cols-[1.3fr_1fr]">
        {/* ADD DRIVER */}
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold mb-5">Add Driver</h2>

          <div className="grid gap-3 md:grid-cols-2">
            <input
              placeholder="Full Name"
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              className="input"
            />
            <input
              placeholder="Email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="input"
            />

            <button
              onClick={addDriver}
              disabled={saving}
              className="rounded-xl bg-slate-900 text-white py-2 font-medium hover:bg-slate-800 transition"
            >
              {saving ? 'Adding...' : 'Add Driver'}
            </button>
          </div>
        </div>

        {/* SUMMARY */}
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold mb-5">Summary</h2>

          <div className="space-y-4 text-sm">
            <div className="flex justify-between">
              <span>Total Drivers</span>
              <span className="font-semibold">{drivers.length}</span>
            </div>
            <div className="flex justify-between">
              <span>Active</span>
              <span>{drivers.filter(d => d.status === 'active').length}</span>
            </div>
            <div className="flex justify-between">
              <span>Inactive</span>
              <span>{drivers.filter(d => d.status !== 'active').length}</span>
            </div>
          </div>
        </div>
      </div>

      {/* DRIVERS LIST */}
      <div className="mt-8 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold mb-5">Drivers List</h2>

        {loading ? (
          <p className="text-sm text-slate-500">Loading drivers...</p>
        ) : (
          <div className="space-y-3">
            {drivers.map((d) => (
              <div
                key={d.id}
                className="flex items-center justify-between rounded-2xl border border-slate-200 px-4 py-3 hover:bg-slate-50 transition"
              >
                <div>
                  <p className="font-semibold text-slate-900">
                    {d.full_name}
                  </p>
                  <p className="text-sm text-slate-500">{d.email}</p>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={() => toggleStatus(d.id, d.status)}
                    className={`px-3 py-1 text-xs font-semibold rounded-full ${badge(d.status)}`}
                  >
                    {d.status}
                  </button>

                  <button
                    onClick={() => deleteDriver(d.id)}
                    className="text-red-600 text-xs font-medium hover:underline"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}

            {!drivers.length && (
              <p className="text-center text-slate-400 py-6">
                No drivers found
              </p>
            )}
          </div>
        )}
      </div>
    </DashboardShell>
  )
}