'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

// ── Types ─────────────────────────────────────────────────────────────────────

type Driver = { id: string; name: string | null; status: string | null }
type Customer = { id: string; name: string | null; status?: string | null }
type Bin = { id: string; bin_number: string | null; bin_size: string | null; bin_type?: string | null; status: string | null; location?: string | null }
type DumpSite = { id: string; name: string | null; address: string | null }
type JobSite = { id: string; customer_id: string | null; site_name: string | null; address: string | null; is_active?: boolean | null }
type PastOrder = {
  id: string
  customer_id: string | null
  bin_id: string | null
  old_bin_id: string | null
  bin_type: string | null
  service_address: string | null
  pickup_address: string | null
  updated_at?: string | null
  created_at?: string | null
}

type FormState = {
  customer_id: string
  customer_name: string
  job_site_id: string
  pickup_address: string
  scheduled_date: string
  service_time: string
  bin_size: string
  bin_type: string
  order_type: string
  driver_id: string
  old_bin_id: string
  dump_site_id: string
  notes: string
}

// ── Constants ─────────────────────────────────────────────────────────────────

const ORDER_TYPES = ['DELIVERY', 'EXCHANGE', 'REMOVAL', 'DUMP RETURN'] as const
const BIN_SIZES = ['6', '8', '10', '12', '14', '15', '20', '30', '40'] as const
const MATERIAL_TYPES = ['Garbage', 'Recycling', 'Mixed', 'Clean Fill'] as const

function buildTimeOptions() {
  const opts: string[] = []
  for (let h = 5; h <= 20; h++) {
    for (const m of [0, 30]) {
      opts.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
    }
  }
  return opts
}
const TIME_OPTIONS = buildTimeOptions()

function generateQuickDate(offsetDays = 0) {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + offsetDays)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatServiceTime(value: string | null | undefined) {
  if (!value) return '—'
  const [h, m] = value.split(':').map(Number)
  if (isNaN(h) || isNaN(m)) return value
  const d = new Date(); d.setHours(h, m, 0, 0)
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function normalizeAddress(v: string | null | undefined) {
  return String(v || '').trim().toLowerCase()
}

function generateTicketNumber() {
  return `ST-${Math.random().toString(36).slice(2, 10).toUpperCase()}`
}

function emptyForm(defaultDate?: string, defaultDriverId?: string): FormState {
  return {
    customer_id: '',
    customer_name: '',
    job_site_id: '',
    pickup_address: '',
    scheduled_date: defaultDate || generateQuickDate(0),
    service_time: '',
    bin_size: '20',
    bin_type: 'Garbage',
    order_type: 'DELIVERY',
    driver_id: defaultDriverId || '',
    old_bin_id: '',
    dump_site_id: '',
    notes: '',
  }
}

// ── Props ──────────────────────────────────────────────────────────────────────

interface Props {
  onClose: () => void
  onCreated: () => void
  defaultDate?: string
  defaultDriverId?: string
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function NewOrderModal({ onClose, onCreated, defaultDate, defaultDriverId }: Props) {
  const supabase = createClient()

  const [drivers, setDrivers] = useState<Driver[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [bins, setBins] = useState<Bin[]>([])
  const [dumpSites, setDumpSites] = useState<DumpSite[]>([])
  const [jobSites, setJobSites] = useState<JobSite[]>([])
  const [pastOrders, setPastOrders] = useState<PastOrder[]>([])

  const [form, setForm] = useState<FormState>(emptyForm(defaultDate, defaultDriverId))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    void loadAll()
  }, [])

  async function loadAll() {
    const [d, c, b, ds, js, po] = await Promise.all([
      supabase.from('drivers').select('id,name,status').order('name'),
      supabase.from('customers').select('id,name,status').eq('status', 'active').order('name'),
      supabase.from('bins').select('id,bin_number,bin_size,bin_type,status,location').order('bin_number'),
      supabase.from('dump_sites').select('id,name,address').order('name'),
      supabase.from('job_sites').select('id,customer_id,site_name,address,is_active').neq('is_active', false).order('site_name'),
      supabase.from('order')
        .select('id,customer_id,bin_id,old_bin_id,bin_type,service_address,pickup_address,updated_at,created_at')
        .order('updated_at', { ascending: false })
        .limit(1000),
    ])
    if (d.data) setDrivers(d.data as Driver[])
    if (c.data) setCustomers(c.data as Customer[])
    if (b.data) setBins(b.data as Bin[])
    if (ds.data) setDumpSites(ds.data as DumpSite[])
    if (js.data) setJobSites(js.data as JobSite[])
    if (po.data) setPastOrders(po.data as PastOrder[])
  }

  // ── Derived data ─────────────────────────────────────────────────────────────

  const selectedCustomerJobSites = useMemo(() => {
    if (!form.customer_id) return []
    return jobSites.filter((s) => s.customer_id === form.customer_id)
  }, [jobSites, form.customer_id])

  const dumpSiteAddresses = useMemo(() => {
    const set = new Set<string>()
    for (const ds of dumpSites) {
      if (ds.address) set.add(ds.address.trim().toLowerCase())
      if (ds.name) set.add(ds.name.trim().toLowerCase())
    }
    return set
  }, [dumpSites])

  // All unique addresses for this customer: saved job sites + past order addresses (excluding dump sites)
  const customerAddressSuggestions = useMemo(() => {
    const seen = new Set<string>()
    const results: string[] = []

    // First: saved job site addresses
    for (const site of selectedCustomerJobSites) {
      const addr = (site.address || '').trim()
      const key = addr.toLowerCase()
      if (addr && !seen.has(key) && !dumpSiteAddresses.has(key)) {
        seen.add(key)
        results.push(addr)
      }
    }

    // Then: past order addresses (skip dump site addresses and single-word entries like "YARD")
    if (form.customer_id) {
      for (const order of pastOrders) {
        if (order.customer_id !== form.customer_id) continue
        for (const addr of [order.service_address, order.pickup_address]) {
          const trimmed = (addr || '').trim()
          const key = trimmed.toLowerCase()
          if (trimmed && !seen.has(key) && !dumpSiteAddresses.has(key) && trimmed.includes(' ')) {
            seen.add(key)
            results.push(trimmed)
          }
        }
      }
    }

    return results
  }, [selectedCustomerJobSites, pastOrders, form.customer_id, dumpSiteAddresses])

  const binsAtJobSite = useMemo(() => {
    const addr = normalizeAddress(form.pickup_address)
    if (!addr) return []

    // Primary: bins marked in_use whose location exactly matches the address
    const byLocation = bins.filter((b) => normalizeAddress(b.location) === addr && b.status === 'in_use')
    if (byLocation.length > 0) return byLocation

    // Fallback: bins referenced in past orders at this address that are still in_use
    const binIdsAtAddr = new Set(
      pastOrders
        .filter((o) => normalizeAddress(o.service_address) === addr || normalizeAddress(o.pickup_address) === addr)
        .flatMap((o) => [o.bin_id, o.old_bin_id].filter((id): id is string => Boolean(id)))
    )
    return bins.filter((b) => binIdsAtAddr.has(b.id) && b.status === 'in_use')
  }, [bins, pastOrders, form.pickup_address])

  const isMultiStep = form.order_type === 'EXCHANGE' || form.order_type === 'REMOVAL' || form.order_type === 'DUMP RETURN'

  const jobSiteExistingBins = useMemo(() => (isMultiStep ? binsAtJobSite : []), [binsAtJobSite, isMultiStep])

  const selectedExistingBin = useMemo(
    () => jobSiteExistingBins.find((b) => b.id === form.old_bin_id) || null,
    [jobSiteExistingBins, form.old_bin_id]
  )

  const selectedExistingBinMaterial = useMemo(() => {
    if (!form.old_bin_id) return ''
    const linked = pastOrders
      .filter((o) => o.bin_id === form.old_bin_id || o.old_bin_id === form.old_bin_id)
      .sort((a, b) => new Date(b.updated_at || b.created_at || 0).getTime() - new Date(a.updated_at || a.created_at || 0).getTime())
    return linked.find((o) => o.bin_type)?.bin_type || selectedExistingBin?.bin_type || ''
  }, [pastOrders, form.old_bin_id, selectedExistingBin])

  const selectedDumpSite = useMemo(
    () => dumpSites.find((s) => s.id === form.dump_site_id) || null,
    [dumpSites, form.dump_site_id]
  )

  // Auto-select the only bin at address
  useEffect(() => {
    if (!isMultiStep) return
    if (jobSiteExistingBins.length !== 1) return
    if (form.old_bin_id) return
    const b = jobSiteExistingBins[0]
    setForm((prev) => ({
      ...prev,
      old_bin_id: b.id,
      bin_size: b.bin_size || prev.bin_size,
      bin_type: selectedExistingBinMaterial || b.bin_type || prev.bin_type,
    }))
  }, [form.order_type, form.old_bin_id, jobSiteExistingBins])

  // Fill size & material when old_bin_id is set
  useEffect(() => {
    if (!form.old_bin_id || !isMultiStep) return
    setForm((prev) => ({
      ...prev,
      bin_size: selectedExistingBin?.bin_size || prev.bin_size,
      bin_type: selectedExistingBinMaterial || selectedExistingBin?.bin_type || prev.bin_type,
    }))
  }, [form.old_bin_id, selectedExistingBin, selectedExistingBinMaterial])

  // ── Handlers ─────────────────────────────────────────────────────────────────

  function handleCustomerChange(customerId: string) {
    const customer = customers.find((c) => c.id === customerId)
    setForm((prev) => ({
      ...prev,
      customer_id: customerId,
      customer_name: customer?.name || '',
      job_site_id: '',
      pickup_address: '',
      old_bin_id: '',
    }))
  }

  function handleJobSiteAddressInput(address: string) {
    const matched = selectedCustomerJobSites.find(
      (s) => normalizeAddress(s.address) === normalizeAddress(address)
    )
    setForm((prev) => ({
      ...prev,
      pickup_address: address,
      job_site_id: matched?.id || '',
      old_bin_id: '',
    }))
  }

  async function ensureJobSite(customerId: string, address: string): Promise<string | null> {
    if (!customerId || !address) return null
    const existing = jobSites.find(
      (s) => s.customer_id === customerId && normalizeAddress(s.address) === normalizeAddress(address)
    )
    if (existing) return existing.id
    const { data, error } = await supabase
      .from('job_sites')
      .insert([{ customer_id: customerId, site_name: address, address, is_active: true }])
      .select('id')
      .single()
    if (error) throw new Error(error.message)
    return (data as { id: string } | null)?.id || null
  }

  async function syncDriverStatuses(driverId: string) {
    const { data } = await supabase.from('order').select('status').eq('driver_id', driverId)
    const hasActive = (data || []).some((o: { status?: string | null }) =>
      ['assigned', 'in_progress'].includes(o.status || '')
    )
    const { data: driverRow } = await supabase.from('drivers').select('status').eq('id', driverId).single()
    if ((driverRow as { status?: string | null } | null)?.status === 'offline') return
    await supabase.from('drivers').update({ status: hasActive ? 'busy' : 'available' }).eq('id', driverId)
  }

  async function handleCreate() {
    setError('')

    if (!form.customer_name.trim()) { setError('Customer is required.'); return }
    if (!form.pickup_address.trim()) { setError('Job Site Address is required.'); return }
    if (!form.scheduled_date) { setError('Date is required.'); return }
    if (isMultiStep && !form.old_bin_id) { setError(`${form.order_type} requires selecting the bin at this job site.`); return }
    if (isMultiStep && !form.dump_site_id) { setError('Please select a dump site.'); return }

    setSaving(true)
    try {
      const addr = form.pickup_address.trim()
      const jobSiteId = form.customer_id ? await ensureJobSite(form.customer_id, addr) : null
      const dumpSiteAddress = selectedDumpSite?.address || null
      const bin_id = isMultiStep ? (form.old_bin_id || null) : null
      const old_bin_id = isMultiStep ? (form.old_bin_id || null) : null

      const payload = {
        ticket_number: generateTicketNumber(),
        customer_id: form.customer_id || null,
        customer_name: form.customer_name.trim(),
        job_site_id: jobSiteId,
        pickup_address: addr,
        service_address: addr,
        order_type: form.order_type,
        bin_size: form.bin_size || null,
        bin_type: form.bin_type || null,
        bin_number: selectedExistingBin?.bin_number || null,
        bin_id,
        old_bin_id,
        dump_site_id: isMultiStep ? (form.dump_site_id || null) : null,
        dump_site_address: isMultiStep ? dumpSiteAddress : null,
        scheduled_date: form.scheduled_date,
        service_time: form.service_time || null,
        driver_id: form.driver_id || null,
        status: form.driver_id ? 'assigned' : 'unassigned',
        notes: form.notes || null,
        workflow_step: isMultiStep ? 'PICKUP' : 'MAIN',
      }

      const { error: insertErr } = await supabase.from('order').insert(payload)
      if (insertErr) throw new Error(insertErr.message)
      if (form.driver_id) await syncDriverStatuses(form.driver_id)
      onCreated()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create order.')
      setSaving(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40">
      <div className="flex min-h-full items-start justify-center p-4 md:p-6">
        <div className="my-6 w-full max-w-3xl max-h-[calc(100vh-3rem)] overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl">

          {/* Header */}
          <div className="mb-6 flex items-start justify-between gap-4">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">New Order</div>
              <h2 className="mt-1 text-xl font-bold text-slate-900">Create Order</h2>
            </div>
            <button onClick={onClose} className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200">
              Close
            </button>
          </div>

          {error && (
            <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
          )}

          <div className="grid gap-4 md:grid-cols-2">

            {/* Customer */}
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Customer</label>
              <select
                value={form.customer_id}
                onChange={(e) => handleCustomerChange(e.target.value)}
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-slate-400"
              >
                <option value="">Select customer</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>{c.name || 'Unnamed Customer'}</option>
                ))}
              </select>
            </div>

            {/* Customer Name */}
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Customer Name</label>
              <input
                value={form.customer_name}
                onChange={(e) => setForm((p) => ({ ...p, customer_name: e.target.value }))}
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-slate-400"
                placeholder="Customer name"
              />
            </div>

            {/* Job Site Address — full width, suggestions from job sites + past orders */}
            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Job Site Address
                {form.job_site_id && (
                  <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">Saved Site</span>
                )}
              </label>
              <input
                list="new-order-address-suggestions"
                value={form.pickup_address}
                onChange={(e) => handleJobSiteAddressInput(e.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-slate-400"
                placeholder={customerAddressSuggestions.length > 0 ? 'Start typing a saved address' : 'Job site address'}
                autoComplete="street-address"
              />
              <datalist id="new-order-address-suggestions">
                {customerAddressSuggestions.map((addr) => (
                  <option key={addr} value={addr} />
                ))}
              </datalist>
            </div>

            {/* Order Type — full width */}
            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-medium text-slate-700">Order Type</label>
              <select
                value={form.order_type}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    order_type: e.target.value,
                    old_bin_id: '',
                    dump_site_id: e.target.value === 'REMOVAL' || e.target.value === 'EXCHANGE' || e.target.value === 'DUMP RETURN' ? p.dump_site_id : '',
                  }))
                }
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-slate-400"
              >
                {ORDER_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            {/* Date */}
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Date</label>
              <div className="grid gap-2">
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => setForm((p) => ({ ...p, scheduled_date: generateQuickDate(0) }))}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Today</button>
                  <button type="button" onClick={() => setForm((p) => ({ ...p, scheduled_date: generateQuickDate(1) }))}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Tomorrow</button>
                </div>
                <input
                  type="date"
                  value={form.scheduled_date}
                  onChange={(e) => setForm((p) => ({ ...p, scheduled_date: e.target.value }))}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-slate-400"
                />
              </div>
            </div>

            {/* Time */}
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Time</label>
              <select
                value={form.service_time}
                onChange={(e) => setForm((p) => ({ ...p, service_time: e.target.value }))}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-slate-400"
              >
                <option value="">Select time</option>
                {TIME_OPTIONS.map((t) => (
                  <option key={t} value={t}>{formatServiceTime(t)}</option>
                ))}
              </select>
            </div>

            {/* Bin Size */}
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Bin Size</label>
              <select
                value={form.bin_size}
                onChange={(e) => setForm((p) => ({ ...p, bin_size: e.target.value, old_bin_id: '' }))}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-slate-400"
              >
                {BIN_SIZES.map((s) => <option key={s} value={s}>{s} Yard</option>)}
              </select>
            </div>

            {/* Material */}
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Material / Bin</label>
              <select
                value={form.bin_type}
                onChange={(e) => setForm((p) => ({ ...p, bin_type: e.target.value }))}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-slate-400"
              >
                {MATERIAL_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            {/* Dump site fields — multi-step types only */}
            {isMultiStep && (
              <>
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">Dump Site</label>
                  <select
                    value={form.dump_site_id}
                    onChange={(e) => setForm((p) => ({ ...p, dump_site_id: e.target.value }))}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-slate-400"
                  >
                    <option value="">Select dump site</option>
                    {dumpSites.map((s) => <option key={s.id} value={s.id}>{s.name || 'Unnamed'}</option>)}
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">Dump Site Address</label>
                  <div className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                    {selectedDumpSite?.address || '—'}
                  </div>
                </div>

                {/* Existing bin at job site */}
                <div className="md:col-span-2">
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    {form.order_type === 'DUMP RETURN' ? 'Bin at this Job Site' : 'Old / Existing Bin at this Job Site'}
                  </label>
                  {jobSiteExistingBins.length > 0 ? (
                    <select
                      value={form.old_bin_id}
                      onChange={(e) => {
                        const bin = jobSiteExistingBins.find((b) => b.id === e.target.value) || null
                        const linked = pastOrders
                          .filter((o) => o.bin_id === e.target.value || o.old_bin_id === e.target.value)
                          .sort((a, b) => new Date(b.updated_at || b.created_at || 0).getTime() - new Date(a.updated_at || a.created_at || 0).getTime())
                        const material = linked.find((o) => o.bin_type)?.bin_type || bin?.bin_type || ''
                        setForm((p) => ({
                          ...p,
                          old_bin_id: e.target.value,
                          bin_size: bin?.bin_size || p.bin_size,
                          bin_type: material || p.bin_type,
                        }))
                      }}
                      className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-slate-400"
                    >
                      <option value="">Select bin from this Job Site</option>
                      {jobSiteExistingBins.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.bin_number || 'Bin'} • {b.bin_size || ''}Y • {b.location || 'Job Site'}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                      No bins found at this address. Ensure the bin is marked as &ldquo;in use&rdquo; at this location in Bin Inventory.
                    </div>
                  )}

                  {form.order_type === 'DUMP RETURN' && (
                    <div className="mt-2 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
                      DUMP RETURN uses the same bin already on hold at this Job Site. Bin size and material are filled automatically from that bin.
                    </div>
                  )}

                  {(form.order_type === 'EXCHANGE' || form.order_type === 'DUMP RETURN') && (
                    <div className="mt-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                      Bins found at this Job Site: <span className="font-semibold">{jobSiteExistingBins.length}</span>
                    </div>
                  )}
                </div>

                {/* Assigned bin summary */}
                {form.old_bin_id && (
                  <div className="md:col-span-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                    Assigned bin on this order: <span className="font-semibold">{selectedExistingBin?.bin_number || form.old_bin_id.slice(0, 8)}</span>
                  </div>
                )}
              </>
            )}

            {/* Assign Driver */}
            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-medium text-slate-700">Assign Driver (optional)</label>
              <select
                value={form.driver_id}
                onChange={(e) => setForm((p) => ({ ...p, driver_id: e.target.value }))}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-slate-400"
              >
                <option value="">Unassigned</option>
                {drivers
                  .filter((d) => d.status !== 'offline')
                  .map((d) => (
                    <option key={d.id} value={d.id}>{d.name || 'Unnamed Driver'}</option>
                  ))}
              </select>
            </div>

            {/* Notes */}
            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-medium text-slate-700">Note</label>
              <textarea
                rows={4}
                value={form.notes}
                onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-slate-400"
                placeholder="Special observation or instruction"
              />
            </div>

          </div>

          {/* Footer */}
          <div className="mt-6 flex flex-wrap justify-end gap-3">
            <button
              onClick={onClose}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Close
            </button>
            <button
              onClick={handleCreate}
              disabled={saving}
              className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {saving ? 'Creating…' : 'Create Order'}
            </button>
          </div>

        </div>
      </div>
    </div>
  )
}
