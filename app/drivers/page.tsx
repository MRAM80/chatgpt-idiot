'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type DriverJob = {
  id: string
  job_number?: string | null
  job_type?: string | null
  scheduled_date?: string | null
  service_address?: string | null
  status?: string | null
  priority?: string | null
  notes_dispatch?: string | null
  notes_driver?: string | null
  customers?: { company_name?: string | null } | null
  bins?: { bin_number?: string | null; size?: string | null } | null
}

type Profile = {
  id: string
  email?: string | null
  role?: string | null
}

type DriverRecord = {
  id: string
  full_name: string
  auth_user_id?: string | null
}

const DRIVER_STATUSES = ['assigned', 'en_route', 'on_site', 'completed', 'issue']

export default function DriverJobsPage() {
  const router = useRouter()

  const [profile, setProfile] = useState<Profile | null>(null)
  const [driver, setDriver] = useState<DriverRecord | null>(null)
  const [jobs, setJobs] = useState<DriverJob[]>([])
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({})

  async function loadPage() {
    setLoading(true)
    setErrorMessage('')

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      router.push('/login')
      return
    }

    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('id, email, role')
      .eq('id', user.id)
      .single()

    if (profileError || !profileData || profileData.role !== 'driver') {
      router.push('/login')
      return
    }

    setProfile(profileData)

    const { data: driverData, error: driverError } = await supabase
      .from('drivers')
      .select('id, full_name, auth_user_id')
      .eq('auth_user_id', user.id)
      .single()

    if (driverError || !driverData) {
      setErrorMessage('Driver record not linked to this login.')
      setLoading(false)
      return
    }

    setDriver(driverData)

    const { data: jobsData, error: jobsError } = await supabase
      .from('jobs')
      .select(`
        id,
        job_number,
        job_type,
        scheduled_date,
        service_address,
        status,
        priority,
        notes_dispatch,
        notes_driver,
        customers:customer_id ( company_name ),
        bins:assigned_bin_id ( bin_number, size )
      `)
      .eq('assigned_driver_id', driverData.id)
      .in('status', DRIVER_STATUSES)
      .order('scheduled_date', { ascending: true })
      .order('created_at', { ascending: false })

    if (jobsError) {
      setErrorMessage(jobsError.message)
      setLoading(false)
      return
    }

    const safeJobs = (jobsData as DriverJob[]) || []
    setJobs(safeJobs)

    const draftMap: Record<string, string> = {}
    safeJobs.forEach((job) => {
      draftMap[job.id] = job.notes_driver || ''
    })
    setNoteDrafts(draftMap)

    setLoading(false)
  }

  async function updateJobStatus(jobId: string, status: string) {
    setErrorMessage('')

    const currentJob = jobs.find((job) => job.id === jobId)

    const { error } = await supabase.from('jobs').update({ status }).eq('id', jobId)

    if (error) {
      setErrorMessage(error.message)
      return
    }

    if (status === 'completed' && currentJob?.bins?.bin_number) {
      const { data: jobRow } = await supabase
        .from('jobs')
        .select('assigned_bin_id')
        .eq('id', jobId)
        .single()

      if (jobRow?.assigned_bin_id) {
        await supabase.from('bins').update({ status: 'available' }).eq('id', jobRow.assigned_bin_id)
      }
    }

    await loadPage()
  }

  async function saveDriverNote(jobId: string) {
    setErrorMessage('')

    const { error } = await supabase
      .from('jobs')
      .update({
        notes_driver: noteDrafts[jobId] || null,
      })
      .eq('id', jobId)

    if (error) {
      setErrorMessage(error.message)
      return
    }

    await loadPage()
  }

  const grouped = useMemo(() => {
    return {
      assigned: jobs.filter((j) => j.status === 'assigned'),
      en_route: jobs.filter((j) => j.status === 'en_route'),
      on_site: jobs.filter((j) => j.status === 'on_site'),
      completed: jobs.filter((j) => j.status === 'completed'),
      issue: jobs.filter((j) => j.status === 'issue'),
    }
  }, [jobs])

  if (loading) {
    return <div className="p-6">Loading driver jobs...</div>
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6 space-y-6">
      <div className="rounded-2xl border bg-white p-4">
        <h1 className="text-2xl font-bold">Driver Jobs</h1>
        <p className="text-sm text-gray-600">
          {driver?.full_name || profile?.email || 'Driver'}
        </p>

        {errorMessage ? (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {errorMessage}
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <MetricCard label="Assigned" value={grouped.assigned.length} />
        <MetricCard label="En Route" value={grouped.en_route.length} />
        <MetricCard label="On Site" value={grouped.on_site.length} />
        <MetricCard label="Completed" value={grouped.completed.length} />
        <MetricCard label="Issues" value={grouped.issue.length} />
      </div>

      <div className="space-y-4">
        {jobs.length === 0 ? (
          <div className="rounded-2xl border bg-white p-4 text-sm text-gray-500">
            No assigned jobs right now.
          </div>
        ) : (
          jobs.map((job) => (
            <div key={job.id} className="space-y-4 rounded-2xl border bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm text-gray-500">Job #{job.job_number || '—'}</div>
                  <div className="text-lg font-semibold">
                    {job.customers?.company_name || 'Customer'}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-medium">{job.status || 'assigned'}</div>
                  <div className="text-xs text-gray-500">{job.priority || 'normal'}</div>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <InfoCard label="Job Type" value={job.job_type || '—'} />
                <InfoCard label="Scheduled Date" value={job.scheduled_date || '—'} />
                <InfoCard label="Service Address" value={job.service_address || '—'} />
                <InfoCard
                  label="Assigned Bin"
                  value={
                    job.bins?.bin_number
                      ? `${job.bins.bin_number}${job.bins.size ? ` • ${job.bins.size}` : ''}`
                      : 'No bin assigned'
                  }
                />
              </div>

              <div className="rounded-xl border border-blue-100 bg-blue-50 p-3">
                <div className="mb-1 text-xs text-blue-700">Dispatch Notes</div>
                <div className="text-sm text-gray-700">
                  {job.notes_dispatch || 'No dispatch notes.'}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Driver Notes</label>
                <textarea
                  value={noteDrafts[job.id] || ''}
                  onChange={(e) =>
                    setNoteDrafts((prev) => ({
                      ...prev,
                      [job.id]: e.target.value,
                    }))
                  }
                  rows={3}
                  className="w-full rounded-xl border p-3"
                  placeholder="Add notes from the field..."
                />
                <button
                  onClick={() => saveDriverNote(job.id)}
                  className="rounded-xl border px-4 py-2 text-sm"
                >
                  Save Note
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                <button
                  onClick={() => updateJobStatus(job.id, 'en_route')}
                  className="rounded-xl bg-slate-900 px-4 py-3 text-sm text-white"
                >
                  En Route
                </button>
                <button
                  onClick={() => updateJobStatus(job.id, 'on_site')}
                  className="rounded-xl bg-slate-900 px-4 py-3 text-sm text-white"
                >
                  On Site
                </button>
                <button
                  onClick={() => updateJobStatus(job.id, 'completed')}
                  className="rounded-xl bg-green-600 px-4 py-3 text-sm text-white"
                >
                  Complete
                </button>
                <button
                  onClick={() => updateJobStatus(job.id, 'issue')}
                  className="rounded-xl bg-red-600 px-4 py-3 text-sm text-white"
                >
                  Report Issue
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border bg-white p-4">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
    </div>
  )
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-gray-50 p-3">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="mt-1 text-sm font-medium">{value}</div>
    </div>
  )
}