'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Driver = {
  id: string
  full_name: string
  status?: string | null
}

type Bin = {
  id: string
  bin_number: string
  status?: string | null
}

type Job = {
  id: string
  job_number?: string | null
  job_type?: string | null
  scheduled_date?: string | null
  service_address?: string | null
  status?: string | null
  priority?: string | null
  assigned_driver_id?: string | null
  assigned_bin_id?: string | null
  notes_dispatch?: string | null
  notes_driver?: string | null
  customers?: { company_name?: string | null } | null
  drivers?: { full_name?: string | null } | null
  bins?: { bin_number?: string | null } | null
}

const STATUS_OPTIONS = ['new', 'assigned', 'en_route', 'on_site', 'completed', 'cancelled', 'issue']

export default function DispatchBoardPage() {
  const [jobs, setJobs] = useState<Job[]>([])
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [bins, setBins] = useState<Bin[]>([])
  const [statusFilter, setStatusFilter] = useState('all')
  const [driverFilter, setDriverFilter] = useState('all')
  const [errorMessage, setErrorMessage] = useState('')

  async function loadData() {
    setErrorMessage('')

    const [jobsRes, driversRes, binsRes] = await Promise.all([
      supabase
        .from('jobs')
        .select(`
          id,
          job_number,
          job_type,
          scheduled_date,
          service_address,
          status,
          priority,
          assigned_driver_id,
          assigned_bin_id,
          notes_dispatch,
          notes_driver,
          customers:customer_id ( company_name ),
          drivers:assigned_driver_id ( full_name ),
          bins:assigned_bin_id ( bin_number )
        `)
        .order('scheduled_date', { ascending: true })
        .order('created_at', { ascending: false }),
      supabase
        .from('drivers')
        .select('id, full_name, status')
        .order('full_name', { ascending: true }),
      supabase
        .from('bins')
        .select('id, bin_number, status')
        .order('bin_number', { ascending: true }),
    ])

    if (jobsRes.error) setErrorMessage(jobsRes.error.message)
    if (driversRes.error) setErrorMessage(driversRes.error.message)
    if (binsRes.error) setErrorMessage(binsRes.error.message)

    setJobs((jobsRes.data as Job[]) || [])
    setDrivers((driversRes.data as Driver[]) || [])
    setBins((binsRes.data as Bin[]) || [])
  }

  useEffect(() => {
    loadData()
  }, [])

  async function updateJob(id: string, values: Record<string, string | null>) {
    setErrorMessage('')

    const currentJob = jobs.find((job) => job.id === id)

    if (
      currentJob?.assigned_bin_id &&
      values.assigned_bin_id &&
      currentJob.assigned_bin_id !== values.assigned_bin_id
    ) {
      await supabase
        .from('bins')
        .update({ status: 'available' })
        .eq('id', currentJob.assigned_bin_id)
    }

    const { error } = await supabase.from('jobs').update(values).eq('id', id)

    if (error) {
      setErrorMessage(error.message)
      return
    }

    if (values.assigned_bin_id) {
      await supabase
        .from('bins')
        .update({ status: 'assigned' })
        .eq('id', values.assigned_bin_id)
    }

    if (values.status === 'completed' && currentJob?.assigned_bin_id) {
      await supabase
        .from('bins')
        .update({ status: 'available' })
        .eq('id', currentJob.assigned_bin_id)
    }

    await loadData()
  }

  const filteredJobs = useMemo(() => {
    return jobs.filter((job) => {
      const matchStatus = statusFilter === 'all' || job.status === statusFilter
      const matchDriver = driverFilter === 'all' || job.assigned_driver_id === driverFilter
      return matchStatus && matchDriver
    })
  }, [jobs, statusFilter, driverFilter])

  const counts = useMemo(() => {
    return {
      total: jobs.length,
      new: jobs.filter((j) => j.status === 'new').length,
      assigned: jobs.filter((j) => j.status === 'assigned').length,
      inProgress: jobs.filter((j) => ['en_route', 'on_site'].includes(j.status || '')).length,
      completed: jobs.filter((j) => j.status === 'completed').length,
    }
  }, [jobs])

  const activeDrivers = drivers.filter((d) => (d.status || 'active') === 'active')
  const availableBins = bins.filter((b) => (b.status || 'available') === 'available')

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Dispatch Board</h1>
        <p className="text-sm text-gray-600">Manage assignments and live job flow.</p>
      </div>

      {errorMessage ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-5">
        <MetricCard label="Total" value={counts.total} />
        <MetricCard label="New" value={counts.new} />
        <MetricCard label="Assigned" value={counts.assigned} />
        <MetricCard label="In Progress" value={counts.inProgress} />
        <MetricCard label="Completed" value={counts.completed} />
      </div>

      <div className="grid gap-3 rounded-2xl border bg-white p-4 md:grid-cols-2">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-xl border p-3"
        >
          <option value="all">All statuses</option>
          {STATUS_OPTIONS.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>

        <select
          value={driverFilter}
          onChange={(e) => setDriverFilter(e.target.value)}
          className="rounded-xl border p-3"
        >
          <option value="all">All drivers</option>
          {activeDrivers.map((driver) => (
            <option key={driver.id} value={driver.id}>
              {driver.full_name}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-4">
        {filteredJobs.length === 0 ? (
          <div className="rounded-2xl border bg-white p-4 text-sm text-gray-500">
            No jobs found for the selected filters.
          </div>
        ) : (
          filteredJobs.map((job) => (
            <div key={job.id} className="space-y-4 rounded-2xl border bg-white p-4">
              <div className="grid gap-3 md:grid-cols-6">
                <div>
                  <div className="text-xs text-gray-500">Job #</div>
                  <div className="font-semibold">{job.job_number || '—'}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">Customer</div>
                  <div className="font-medium">{job.customers?.company_name || '—'}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">Type</div>
                  <div>{job.job_type || '—'}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">Date</div>
                  <div>{job.scheduled_date || '—'}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">Priority</div>
                  <div>{job.priority || 'normal'}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">Status</div>
                  <div>{job.status || 'new'}</div>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-xl bg-gray-50 p-3">
                  <div className="text-xs text-gray-500">Service Address</div>
                  <div>{job.service_address || '—'}</div>
                </div>
                <div className="rounded-xl bg-gray-50 p-3">
                  <div className="text-xs text-gray-500">Current Assignment</div>
                  <div>Driver: {job.drivers?.full_name || 'Unassigned'}</div>
                  <div>Bin: {job.bins?.bin_number || 'No bin'}</div>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-xl bg-blue-50 p-3">
                  <div className="text-xs text-blue-700">Dispatch Notes</div>
                  <div className="mt-1 text-sm text-gray-700">
                    {job.notes_dispatch || 'No dispatch notes'}
                  </div>
                </div>

                <div className="rounded-xl bg-amber-50 p-3">
                  <div className="text-xs text-amber-700">Driver Notes</div>
                  <div className="mt-1 text-sm text-gray-700">
                    {job.notes_driver || 'No driver notes'}
                  </div>
                </div>
              </div>

              <div className="grid gap-3 lg:grid-cols-4">
                <select
                  value={job.assigned_driver_id || ''}
                  onChange={(e) =>
                    updateJob(job.id, {
                      assigned_driver_id: e.target.value || null,
                      status: e.target.value ? 'assigned' : 'new',
                    })
                  }
                  className="rounded-xl border p-3"
                >
                  <option value="">Unassigned driver</option>
                  {activeDrivers.map((driver) => (
                    <option key={driver.id} value={driver.id}>
                      {driver.full_name}
                    </option>
                  ))}
                </select>

                <select
                  value={job.assigned_bin_id || ''}
                  onChange={(e) =>
                    updateJob(job.id, {
                      assigned_bin_id: e.target.value || null,
                    })
                  }
                  className="rounded-xl border p-3"
                >
                  <option value="">No bin assigned</option>
                  {[
                    ...(job.assigned_bin_id && job.bins?.bin_number
                      ? [{ id: job.assigned_bin_id, bin_number: job.bins.bin_number }]
                      : []),
                    ...availableBins.filter((b) => b.id !== job.assigned_bin_id),
                  ].map((bin) => (
                    <option key={bin.id} value={bin.id}>
                      {bin.bin_number}
                    </option>
                  ))}
                </select>

                <select
                  value={job.status || 'new'}
                  onChange={(e) =>
                    updateJob(job.id, {
                      status: e.target.value,
                    })
                  }
                  className="rounded-xl border p-3"
                >
                  {STATUS_OPTIONS.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>

                <select
                  value={job.priority || 'normal'}
                  onChange={(e) =>
                    updateJob(job.id, {
                      priority: e.target.value,
                    })
                  }
                  className="rounded-xl border p-3"
                >
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
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
      <div className="text-sm text-gray-500">{label}</div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
    </div>
  )
}