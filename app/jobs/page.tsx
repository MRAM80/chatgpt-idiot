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

type Job = {
  id: string
  ticket_number: string
  job_type: string | null
  material_type: string | null
  bin_size: number | null
  customer_name: string | null
  customer_address: string | null
  scheduled_date: string | null
  status: string | null
}

const navItems = [
  { href: '/admin', label: 'Dashboard' },
  { href: '/dispatcher', label: 'Dispatch Window' },
  { href: '/jobs', label: 'Jobs' },
  { href: '/drivers', label: 'Drivers' },
  { href: '/bins', label: 'Bins' },
]

export default function JobsPage() {
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState({
    ticket_number: '',
    job_type: '',
    material_type: '',
    bin_size: '',
    customer_name: '',
    customer_address: '',
    scheduled_date: '',
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
      .from('jobs')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) setErrorMessage(error.message)

    setJobs((data as Job[]) || [])
    setLoading(false)
  }

  async function addJob() {
    if (!form.ticket_number) return

    setSaving(true)

    const { error } = await supabase.from('jobs').insert({
      ticket_number: form.ticket_number,
      job_type: form.job_type,
      material_type: form.material_type,
      bin_size: form.bin_size ? Number(form.bin_size) : null,
      customer_name: form.customer_name,
      customer_address: form.customer_address,
      scheduled_date: form.scheduled_date || null,
      status: 'pending',
    })

    if (error) {
      setErrorMessage(error.message)
      setSaving(false)
      return
    }

    setForm({
      ticket_number: '',
      job_type: '',
      material_type: '',
      bin_size: '',
      customer_name: '',
      customer_address: '',
      scheduled_date: '',
    })

    await loadPage()
    setSaving(false)
  }

  async function deleteJob(id: string) {
    await supabase.from('jobs').delete().eq('id', id)
    loadPage()
  }

  function statusBadge(status: string | null) {
    switch ((status || '').toLowerCase()) {
      case 'completed':
        return 'bg-emerald-100 text-emerald-700'
      case 'in_progress':
        return 'bg-amber-100 text-amber-700'
      case 'assigned':
        return 'bg-blue-100 text-blue-700'
      default:
        return 'bg-slate-100 text-slate-700'
    }
  }

  return (
    <DashboardShell
      title="Jobs Management"
      subtitle="Create, manage and track all jobs"
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
        {/* CREATE JOB */}
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold mb-5">Create Job</h2>

          <div className="grid gap-3 md:grid-cols-2">
            <input placeholder="Ticket #" value={form.ticket_number} onChange={(e) => setForm({ ...form, ticket_number: e.target.value })} className="input" />
            <input placeholder="Job Type" value={form.job_type} onChange={(e) => setForm({ ...form, job_type: e.target.value })} className="input" />
            <input placeholder="Material" value={form.material_type} onChange={(e) => setForm({ ...form, material_type: e.target.value })} className="input" />
            <input placeholder="Bin Size" value={form.bin_size} onChange={(e) => setForm({ ...form, bin_size: e.target.value })} className="input" />
            <input placeholder="Customer Name" value={form.customer_name} onChange={(e) => setForm({ ...form, customer_name: e.target.value })} className="input" />
            <input placeholder="Address" value={form.customer_address} onChange={(e) => setForm({ ...form, customer_address: e.target.value })} className="input md:col-span-2" />
            <input type="date" value={form.scheduled_date} onChange={(e) => setForm({ ...form, scheduled_date: e.target.value })} className="input" />

            <button
              onClick={addJob}
              disabled={saving}
              className="rounded-xl bg-slate-900 text-white py-2 font-medium hover:bg-slate-800 transition"
            >
              {saving ? 'Creating...' : 'Create Job'}
            </button>
          </div>
        </div>

        {/* SUMMARY */}
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold mb-5">Summary</h2>

          <div className="space-y-4 text-sm">
            <div className="flex justify-between">
              <span>Total Jobs</span>
              <span className="font-semibold">{jobs.length}</span>
            </div>
            <div className="flex justify-between">
              <span>Pending</span>
              <span>{jobs.filter(j => j.status === 'pending').length}</span>
            </div>
            <div className="flex justify-between">
              <span>In Progress</span>
              <span>{jobs.filter(j => j.status === 'in_progress').length}</span>
            </div>
            <div className="flex justify-between">
              <span>Completed</span>
              <span>{jobs.filter(j => j.status === 'completed').length}</span>
            </div>
          </div>
        </div>
      </div>

      {/* JOB TABLE */}
      <div className="mt-8 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold mb-5">All Jobs</h2>

        {loading ? (
          <p className="text-sm text-slate-500">Loading jobs...</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b">
                  <th className="pb-3">Ticket</th>
                  <th className="pb-3">Customer</th>
                  <th className="pb-3">Type</th>
                  <th className="pb-3">Date</th>
                  <th className="pb-3">Status</th>
                  <th className="pb-3"></th>
                </tr>
              </thead>

              <tbody>
                {jobs.map((j) => (
                  <tr key={j.id} className="border-b last:border-0 hover:bg-slate-50">
                    <td className="py-3 font-medium text-slate-900">{j.ticket_number}</td>
                    <td>{j.customer_name}</td>
                    <td>{j.job_type}</td>
                    <td>{j.scheduled_date}</td>
                    <td>
                      <span className={`px-3 py-1 text-xs font-semibold rounded-full ${statusBadge(j.status)}`}>
                        {j.status}
                      </span>
                    </td>
                    <td>
                      <button
                        onClick={() => deleteJob(j.id)}
                        className="text-red-600 text-xs font-medium hover:underline"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}

                {!jobs.length && (
                  <tr>
                    <td colSpan={6} className="text-center py-6 text-slate-400">
                      No jobs found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </DashboardShell>
  )
}