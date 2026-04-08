'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import DashboardShell from '@/components/dashboard-shell'
import { supabase } from '@/lib/supabase'

type Profile = {
  id: string
  full_name: string | null
  email: string | null
  role: string | null
}

type Customer = {
  id: string
  company_name: string
  service_address?: string | null
}

type Driver = {
  id: string
  full_name: string
  truck_number?: string | null
  status?: string | null
}

type Bin = {
  id: string
  bin_number: string
  size?: string | null
  status?: string | null
}

type JobRow = {
  id: string
  job_number?: string | null
  customer_id?: string | null
  assigned_driver_id?: string | null
  assigned_bin_id?: string | null
  job_type?: string | null
  scheduled_date?: string | null
  service_address?: string | null
  status?: string | null
  priority?: string | null
  notes_dispatch?: string | null
}

const navItems = [
  { href: '/admin', label: 'Dashboard' },
  { href: '/dispatcher', label: 'Dispatch' },
  { href: '/jobs', label: 'Jobs' },
  { href: '/loads', label: 'Loads' },
  { href: '/drivers', label: 'Drivers' },
  { href: '/bins', label: 'Bins' },
]

const JOB_TYPES = [
  { value: 'delivery', label: 'Delivery' },
  { value: 'exchange', label: 'Exchange' },
  { value: 'removal', label: 'Removal' },
  { value: 'dump_return', label: 'Dump Return' },
]

const MATERIAL_TYPES = ['Garbage', 'Dirt']
const BIN_SIZES = ['14', '15', '20', '30', '40']

export default function JobsPage() {
  const router = useRouter()

  const [profile, setProfile] = useState<Profile | null>(null)
  const [jobs, setJobs] = useState<JobRow[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [bins, setBins] = useState<Bin[]>([])

  const [customerId, setCustomerId] = useState('')
  const [assignedDriverId, setAssignedDriverId] = useState('')
  const [assignedBinId, setAssignedBinId] = useState('')
  const [jobType, setJobType] = useState('delivery')
  const [scheduledDate, setScheduledDate] = useState('')
  const [serviceAddress, setServiceAddress] = useState('')
  const [priority, setPriority] = useState('normal')
  const [materialType, setMaterialType] = useState('Garbage')
  const [requestedBinSize, setRequestedBinSize] = useState('14')
  const [notesDispatch, setNotesDispatch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [errorMessage, setErrorMessage] = useState('')
  const [loading, setLoading] = useState(false)

  const activeDrivers = useMemo(
    () =>
      drivers.filter((d) =>
        ['active', 'available', 'on duty'].includes((d.status || 'active').toLowerCase())
      ),
    [drivers]
  )

  const availableBins = useMemo(
    () => bins.filter((b) => (b.status || 'available').toLowerCase() === 'available'),
    [bins]
  )

  const visibleJobs = useMemo(() => {
    if (statusFilter === 'all') return jobs
    return jobs.filter((job) => (job.status || 'new').toLowerCase() === statusFilter)
  }, [jobs, statusFilter])

  useEffect(() => {
    void initialize()
  }, [])

  useEffect(() => {
    const channel = supabase
      .channel('jobs-page-final')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'jobs' }, () => {
        void loadData()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bins' }, () => {
        void loadData()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'drivers' }, () => {
        void loadData()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'customers' }, () => {
        void loadData()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  async function initialize() {
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
      .select('id, full_name, email, role')
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
    await loadData()
  }

  async function loadData() {
    setErrorMessage('')

    const [jobsRes, customersRes, driversRes, binsRes] = await Promise.all([
      supabase
        .from('jobs')
        .select(
          'id, job_number, customer_id, assigned_driver_id, assigned_bin_id, job_type, scheduled_date, service_address, status, priority, notes_dispatch'
        )
        .order('created_at', { ascending: false }),
      supabase
        .from('customers')
        .select('id, company_name, service_address')
        .eq('is_active', true)
        .order('company_name', { ascending: true }),
      supabase
        .from('drivers')
        .select('id, full_name, truck_number, status')
        .order('full_name', { ascending: true }),
      supabase
        .from('bins')
        .select('id, bin_number, size, status')
        .order('bin_number', { ascending: true }),
    ])

    if (jobsRes.error) setErrorMessage(jobsRes.error.message)
    if (customersRes.error) setErrorMessage(customersRes.error.message)
    if (driversRes.error) setErrorMessage(driversRes.error.message)
    if (binsRes.error) setErrorMessage(binsRes.error.message)

    setJobs((jobsRes.data as JobRow[]) || [])
    setCustomers((customersRes.data as Customer[]) || [])
    setDrivers((driversRes.data as Driver[]) || [])
    setBins((binsRes.data as Bin[]) || [])
  }

  function nextJobNumber() {
    const now = new Date()
    const y = now.getFullYear()
    const m = String(now.getMonth() + 1).padStart(2, '0')
    const d = String(now.getDate()).padStart(2, '0')
    const random = Math.floor(1000 + Math.random() * 9000)
    return `TKT-${y}${m}${d}-${random}`
  }

  async function createJob() {
    if (!customerId || !scheduledDate || !jobType) {
      setErrorMessage('Please select customer, job type, and scheduled date.')
      return
    }

    setLoading(true)
    setErrorMessage('')

    const selectedCustomer = customers.find((c) => c.id === customerId)
    const selectedBin = bins.find((b) => b.id === assignedBinId)

    const formattedNotes = [
      `Material: ${materialType}`,
      `Requested Bin Size: ${requestedBinSize} yards`,
      selectedBin?.size ? `Assigned Bin Size: ${selectedBin.size} yards` : '',
      notesDispatch ? `Notes: ${notesDispatch}` : '',
    ]
      .filter(Boolean)
      .join(' | ')

    const ticketNumber = nextJobNumber()

    const { error } = await supabase.from('jobs').insert([
      {
        job_number: ticketNumber,
        customer_id: customerId,
        assigned_driver_id: assignedDriverId || null,
        assigned_bin_id: assignedBinId || null,
        job_type: jobType,
        scheduled_date: scheduledDate,
        service_address: serviceAddress || selectedCustomer?.service_address || null,
        priority,
        notes_dispatch: formattedNotes || null,
        status: assignedDriverId ? 'assigned' : 'new',
      },
    ])

    if (error) {
      setErrorMessage(error.message)
      setLoading(false)
      return
    }

    if (assignedBinId) {
      await supabase.from('bins').update({ status: 'assigned' }).eq('id', assignedBinId)
    }

    setCustomerId('')
    setAssignedDriverId('')
    setAssignedBinId('')
    setJobType('delivery')
    setScheduledDate('')
    setServiceAddress('')
    setPriority('normal')
    setMaterialType('Garbage')
    setRequestedBinSize('14')
    setNotesDispatch('')
    setLoading(false)

    await loadData()
  }

  async function updateJobStatus(jobId: string, status: string) {
    const { error } = await supabase.from('jobs').update({ status }).eq('id', jobId)

    if (error) {
      setErrorMessage(error.message)
      return
    }

    await loadData()
  }

  function badgeClasses(value: string | null) {
    switch ((value || '').toLowerCase()) {
      case 'completed':
        return 'border border-emerald-200 bg-emerald-50 text-emerald-700'
      case 'assigned':
        return 'border border-blue-200 bg-blue-50 text-blue-700'
      case 'in_progress':
      case 'in progress':
        return 'border border-amber-200 bg-amber-50 text-amber-700'
      default:
        return 'border border-slate-200 bg-slate-100 text-slate-700'
    }
  }

  function getCustomerName(customerId: string | null | undefined) {
    if (!customerId) return '—'
    return customers.find((customer) => customer.id === customerId)?.company_name || '—'
  }

  function getDriverName(driverId: string | null | undefined) {
    if (!driverId) return 'Unassigned'
    return drivers.find((driver) => driver.id === driverId)?.full_name || 'Unassigned'
  }

  function getBinLabel(binId: string | null | undefined) {
    if (!binId) return 'No bin'
    const bin = bins.find((item) => item.id === binId)
    if (!bin) return 'No bin'
    return `${bin.bin_number}${bin.size ? ` • ${bin.size} yards` : ''}`
  }

  return (
    <DashboardShell
      title="Jobs"
      subtitle="Create ticketed jobs for live operations."
      roleLabel={profile?.role === 'admin' ? 'Admin' : 'Dispatcher'}
      userName={profile?.full_name || profile?.email || 'User'}
      navItems={navItems}
    >
      <div className="space-y-6 pb-24 md:pb-6">
        <div className="rounded-3xl border border-gray-200 bg-gradient-to-r from-slate-950 to-emerald-700 p-6 text-white shadow-sm">
          <h1 className="text-2xl font-bold">Job Desk</h1>
          <p className="mt-1 text-sm text-white/80">
            Delivery, Exchange, Removal, and Dump Return with required ticket number tracking.
          </p>
        </div>

        {errorMessage ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {errorMessage}
          </div>
        ) : null}

        <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Create Job</h2>

            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <select
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                className="rounded-xl border p-3"
              >
                <option value="">Select customer</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.company_name}
                  </option>
                ))}
              </select>

              <select
                value={jobType}
                onChange={(e) => setJobType(e.target.value)}
                className="rounded-xl border p-3"
              >
                {JOB_TYPES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>

              <input
                type="date"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
                className="rounded-xl border p-3"
              />

              <select
                value={assignedDriverId}
                onChange={(e) => setAssignedDriverId(e.target.value)}
                className="rounded-xl border p-3"
              >
                <option value="">Unassigned driver</option>
                {activeDrivers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.full_name}
                    {d.truck_number ? ` • ${d.truck_number}` : ''}
                  </option>
                ))}
              </select>

              <select
                value={assignedBinId}
                onChange={(e) => setAssignedBinId(e.target.value)}
                className="rounded-xl border p-3"
              >
                <option value="">No bin assigned</option>
                {availableBins.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.bin_number}
                    {b.size ? ` • ${b.size} yards` : ''}
                  </option>
                ))}
              </select>

              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="rounded-xl border p-3"
              >
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>

              <select
                value={materialType}
                onChange={(e) => setMaterialType(e.target.value)}
                className="rounded-xl border p-3"
              >
                {MATERIAL_TYPES.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>

              <select
                value={requestedBinSize}
                onChange={(e) => setRequestedBinSize(e.target.value)}
                className="rounded-xl border p-3"
              >
                {BIN_SIZES.map((size) => (
                  <option key={size} value={size}>
                    {size} yards
                  </option>
                ))}
              </select>

              <input
                value={serviceAddress}
                onChange={(e) => setServiceAddress(e.target.value)}
                placeholder="Service address"
                className="rounded-xl border p-3 md:col-span-2 xl:col-span-1"
              />

              <textarea
                value={notesDispatch}
                onChange={(e) => setNotesDispatch(e.target.value)}
                placeholder="Extra dispatch notes"
                className="rounded-xl border p-3 md:col-span-2 xl:col-span-3"
                rows={4}
              />
            </div>

            <button
              onClick={createJob}
              disabled={loading}
              className="mt-4 rounded-xl bg-black px-5 py-3 text-white disabled:opacity-50"
            >
              {loading ? 'Creating...' : 'Create Job'}
            </button>
          </section>

          <aside className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Job Rules</h2>
            <div className="mt-4 grid gap-3">
              <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">
                Ticket number is generated automatically for every job.
              </div>
              <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">
                Dump Return means driver takes the same bin, dumps it, and returns it.
              </div>
              <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">
                Bin size request and material type are saved inside dispatch notes.
              </div>
              <button
                onClick={() => router.push('/dispatcher')}
                className="rounded-2xl bg-emerald-600 px-4 py-3 text-left text-sm font-semibold text-white transition hover:bg-emerald-700"
              >
                Open Dispatch Board
              </button>
            </div>
          </aside>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b p-4 md:flex-row md:items-center md:justify-between">
            <h2 className="text-lg font-semibold">Recent Jobs</h2>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-xl border px-3 py-2 text-sm"
            >
              <option value="all">All status</option>
              <option value="new">New</option>
              <option value="assigned">Assigned</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
            </select>
          </div>

          <div className="divide-y">
            {visibleJobs.length === 0 ? (
              <div className="p-4 text-sm text-gray-500">No jobs yet.</div>
            ) : (
              visibleJobs.map((job) => (
                <div key={job.id} className="grid gap-3 p-4 xl:grid-cols-8">
                  <div>
                    <div className="text-xs text-gray-500">Ticket #</div>
                    <div className="font-medium">{job.job_number || '—'}</div>
                  </div>

                  <div>
                    <div className="text-xs text-gray-500">Customer</div>
                    <div className="font-medium">{getCustomerName(job.customer_id)}</div>
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
                    <div className="text-xs text-gray-500">Driver / Bin</div>
                    <div>{getDriverName(job.assigned_driver_id)}</div>
                    <div className="text-sm text-gray-500">
                      {getBinLabel(job.assigned_bin_id)}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-gray-500">Address</div>
                    <div className="text-sm">{job.service_address || '—'}</div>
                  </div>

                  <div>
                    <div className="text-xs text-gray-500">Status / Priority</div>
                    <div className="flex flex-wrap gap-2">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${badgeClasses(job.status ?? null)}`}
                      >
                        {job.status || 'new'}
                      </span>
                      <span className="rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                        {job.priority || 'normal'}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="text-xs text-gray-500">Actions</div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => updateJobStatus(job.id, 'assigned')}
                        className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700"
                      >
                        Assign
                      </button>
                      <button
                        onClick={() => updateJobStatus(job.id, 'in_progress')}
                        className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700"
                      >
                        Start
                      </button>
                      <button
                        onClick={() => updateJobStatus(job.id, 'completed')}
                        className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700"
                      >
                        Complete
                      </button>
                    </div>
                    <div className="text-xs text-slate-500">{job.notes_dispatch || '—'}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </DashboardShell>
  )
}