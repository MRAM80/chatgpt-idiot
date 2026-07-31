'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { CLIENT_CONFIG } from '@/lib/client-config'

// ── Shared types (must match dispatch page types) ─────────────────────────────

export type NOMDriver = { id: string; name: string | null; status: string | null }
export type NOMCustomer = { id: string; name: string | null }
export type NOMBin = { id: string; bin_number: string | null; bin_size: string | null; bin_type?: string | null; status: string | null; location?: string | null }
export type NOMDumpSite = { id: string; name: string | null; address: string | null }
export type NOMJobSite = { id: string; customer_id: string | null; site_name: string | null; address: string | null; is_active?: boolean | null }
export type NOMOrder = { id: string; customer_id?: string | null; bin_id?: string | null; old_bin_id?: string | null; bin_type?: string | null; service_address?: string | null; pickup_address?: string | null; updated_at?: string | null; created_at?: string | null }

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

const ORDER_TYPES = ['DELIVERY', 'EXCHANGE', 'REMOVAL', 'DUMP RETURN', 'MATERIAL DELIVERY'] as const

/** Bulk measures are scooped, so part loads are normal; countable things aren't. */
const BULK_UNITS = ['yard', 'yards', 'yd', 'cubic yard', 'tonne', 'ton', 'load', 'm3', 'hour']
const isBulkUnit = (u: string | null | undefined) => BULK_UNITS.includes((u || '').toLowerCase().trim())

export type NOMPriceItem = {
  id: string
  kind: 'service' | 'product'
  service_type: string | null
  name: string | null
  unit: string | null
  price: number
  track_stock?: boolean
  stock_qty?: number
}

type OrderLine = {
  key: string
  priceItemId: string
  kind: 'product' | 'charge'
  description: string
  unit: string | null
  quantity: number
  rate: number
}
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
  const digits = Math.floor(1000000 + Math.random() * 9000000)
  return `${CLIENT_CONFIG.shortName}-${digits}`
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
  // Data passed from parent — same arrays the parent already loaded
  drivers: NOMDriver[]
  customers: NOMCustomer[]
  bins: NOMBin[]
  dumpSites: NOMDumpSite[]
  jobSites: NOMJobSite[]
  // Past orders for address suggestions + material lookup (parent may not have these)
  // If not provided, modal fetches them itself
  pastOrders?: NOMOrder[]
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function NewOrderModal({
  onClose, onCreated, defaultDate, defaultDriverId,
  drivers, customers, bins, dumpSites, jobSites,
  pastOrders: pastOrdersProp,
}: Props) {
  const supabase = createClient()

  const [pastOrders, setPastOrders] = useState<NOMOrder[]>(pastOrdersProp || [])
  const [form, setForm] = useState<FormState>(emptyForm(defaultDate, defaultDriverId))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Material and charges carried by this order — the bin service itself stays
  // on the order record and is priced at billing time.
  const [priceItems, setPriceItems] = useState<NOMPriceItem[]>([])
  const [lines, setLines] = useState<OrderLine[]>([])
  const [lineSearch, setLineSearch] = useState('')
  const [prepaid, setPrepaid] = useState(false)

  useEffect(() => {
    void supabase
      .from('price_book')
      .select('id,kind,service_type,name,unit,price,track_stock,stock_qty')
      .is('customer_id', null)
      .then(({ data }) => { if (data) setPriceItems(data as NOMPriceItem[]) })
  }, [])

  useEffect(() => {
    if (pastOrdersProp) return // parent provided orders, skip fetch
    void supabase
      .from('order')
      .select('id,customer_id,bin_id,old_bin_id,bin_type,service_address,pickup_address,updated_at,created_at')
      .order('updated_at', { ascending: false })
      .limit(2000)
      .then(({ data }) => { if (data) setPastOrders(data as NOMOrder[]) })
  }, [])

  // ── Derived data ─────────────────────────────────────────────────────────────

  const selectedCustomerJobSites = useMemo(() => {
    if (!form.customer_id) return []
    return jobSites.filter((s) => s.customer_id === form.customer_id)
  }, [jobSites, form.customer_id])

  const dumpSiteKeys = useMemo(() => {
    const set = new Set<string>()
    for (const ds of dumpSites) {
      if (ds.address) set.add(ds.address.trim().toLowerCase())
      if (ds.name) set.add(ds.name.trim().toLowerCase())
    }
    return set
  }, [dumpSites])

  const customerAddressSuggestions = useMemo(() => {
    const seen = new Set<string>()
    const results: string[] = []
    for (const site of selectedCustomerJobSites) {
      const addr = (site.address || '').trim()
      const key = addr.toLowerCase()
      if (addr && !seen.has(key) && !dumpSiteKeys.has(key)) { seen.add(key); results.push(addr) }
    }
    if (form.customer_id) {
      for (const order of pastOrders) {
        if (order.customer_id !== form.customer_id) continue
        for (const addr of [order.service_address, order.pickup_address]) {
          const trimmed = (addr || '').trim()
          const key = trimmed.toLowerCase()
          if (trimmed && !seen.has(key) && !dumpSiteKeys.has(key) && trimmed.includes(' ')) {
            seen.add(key); results.push(trimmed)
          }
        }
      }
    }
    return results
  }, [selectedCustomerJobSites, pastOrders, form.customer_id, dumpSiteKeys])

  const binsAtJobSite = useMemo(() => {
    const addr = normalizeAddress(form.pickup_address)
    if (!addr) return []
    // Primary: bin.location matches address exactly
    const byLocation = bins.filter((b) => normalizeAddress(b.location) === addr && b.status === 'in_use')
    if (byLocation.length > 0) return byLocation
    // Fallback: find bins referenced in past orders at this address that are still in_use
    const binIdsAtAddr = new Set(
      pastOrders
        .filter((o) => normalizeAddress(o.service_address) === addr || normalizeAddress(o.pickup_address) === addr)
        .flatMap((o) => [o.bin_id, o.old_bin_id].filter((id): id is string => Boolean(id)))
    )
    return bins.filter((b) => binIdsAtAddr.has(b.id) && b.status === 'in_use')
  }, [bins, pastOrders, form.pickup_address])

  const isMultiStep = form.order_type === 'EXCHANGE' || form.order_type === 'REMOVAL' || form.order_type === 'DUMP RETURN'
  const isMaterialOrder = form.order_type === 'MATERIAL DELIVERY'
  /** A bin job is already going to that address, so material rides along free. */
  const isBinService = !isMaterialOrder

  const materialItems = useMemo(
    () => priceItems
      .filter(i => i.kind === 'product')
      .sort((a, b) => (a.name || '').localeCompare(b.name || '')),
    [priceItems]
  )

  const deliveryCharge = useMemo(
    () => priceItems.find(i =>
      i.kind === 'service' && !i.service_type && (i.name || '').toLowerCase().includes('delivery')
    ) || null,
    [priceItems]
  )

  const lineMatches = useMemo(() => {
    const q = lineSearch.trim().toLowerCase()
    if (!q) return []
    return materialItems.filter(i => (i.name || '').toLowerCase().includes(q)).slice(0, 6)
  }, [materialItems, lineSearch])

  const linesTotal = useMemo(() => lines.reduce((s, l) => s + l.quantity * l.rate, 0), [lines])
  const hasMaterial = lines.some(l => l.kind === 'product')
  const deliveryOnOrder = lines.some(l => l.kind === 'charge' && l.priceItemId === deliveryCharge?.id)

  function addMaterialLine(item: NOMPriceItem) {
    setError('')
    setLines(cur => {
      const existing = cur.find(l => l.priceItemId === item.id)
      const step = isBulkUnit(item.unit) ? 0.25 : 1
      if (existing) {
        return cur.map(l => l.priceItemId === item.id
          ? { ...l, quantity: Number((l.quantity + step).toFixed(2)) }
          : l)
      }
      return [...cur, {
        key: `${item.id}-${Date.now()}`,
        priceItemId: item.id,
        kind: 'product' as const,
        description: item.name || 'Material',
        unit: item.unit,
        quantity: 1,
        rate: Number(item.price),
      }]
    })
    setLineSearch('')
  }

  function toggleDeliveryCharge() {
    if (!deliveryCharge) return
    setLines(cur => {
      if (cur.some(l => l.priceItemId === deliveryCharge.id)) {
        return cur.filter(l => l.priceItemId !== deliveryCharge.id)
      }
      return [...cur, {
        key: `delivery-${Date.now()}`,
        priceItemId: deliveryCharge.id,
        kind: 'charge' as const,
        description: deliveryCharge.name || 'Delivery',
        unit: null,
        quantity: 1,
        rate: Number(deliveryCharge.price),
      }]
    })
  }

  function updateLineQty(key: string, raw: string) {
    const n = Number(raw)
    setLines(cur => cur.map(l => (l.key === key ? { ...l, quantity: Number.isNaN(n) ? 0 : n } : l)))
  }

  function removeLine(key: string) {
    setLines(cur => cur.filter(l => l.key !== key))
  }

  // A bin job covers its own trip, so drop any delivery charge if the type changes
  useEffect(() => {
    if (isBinService && deliveryOnOrder && deliveryCharge) {
      setLines(cur => cur.filter(l => l.priceItemId !== deliveryCharge.id))
    }
  }, [isBinService, deliveryOnOrder, deliveryCharge])
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
    const { data } = await supabase.from('order').select('status,scheduled_date').eq('driver_id', driverId)
    const todayKey = new Date().toLocaleDateString('en-CA')
    const hasActive = (data || []).some((o: { status?: string | null; scheduled_date?: string | null }) =>
      ['assigned', 'in_progress'].includes(o.status || '') &&
      String(o.scheduled_date || '').slice(0, 10) <= todayKey
    )
    const { data: driverRow } = await supabase.from('drivers').select('status').eq('id', driverId).single()
    const driverStatus = (driverRow as { status?: string | null } | null)?.status
    if (driverStatus === 'offline' || driverStatus === 'heading_back' || driverStatus === 'parked' || driverStatus === 'stopped' || driverStatus === 'emergency') return
    await supabase.from('drivers').update({ status: hasActive ? 'busy' : 'available' }).eq('id', driverId).in('status', ['available', 'busy'])
  }

  async function handleCreate() {
    setError('')
    if (!form.customer_name.trim()) { setError('Customer is required.'); return }
    if (!form.pickup_address.trim()) { setError('Job Site Address is required.'); return }
    if (!form.scheduled_date) { setError('Date is required.'); return }
    if (CLIENT_CONFIG.requireBin && isMultiStep && !form.old_bin_id) { setError(`${form.order_type} requires selecting the bin at this job site.`); return }
    if (isMultiStep && !form.dump_site_id) { setError('Please select a dump site.'); return }
    if (isMaterialOrder && !hasMaterial) { setError('Add the material being delivered.'); return }
    const badQty = lines.find(l => !isBulkUnit(l.unit) && !Number.isInteger(l.quantity))
    if (badQty) { setError(`${badQty.description} is sold by the ${badQty.unit || 'unit'} — use a whole number.`); return }
    if (lines.some(l => l.quantity <= 0)) { setError('Every line needs a quantity greater than zero.'); return }

    setSaving(true)
    try {
      const addr = form.pickup_address.trim()
      const jobSiteId = form.customer_id ? await ensureJobSite(form.customer_id, addr) : null
      const dumpSiteAddress = selectedDumpSite?.address || null
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
        bin_id: isMultiStep ? old_bin_id : null,
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

      const { data: created, error: insertErr } = await supabase
        .from('order')
        .insert({ ...payload, prepaid })
        .select('id,ticket_number')
        .single()
      if (insertErr || !created) throw new Error(insertErr?.message || 'Failed to create order.')

      const orderRow = created as { id: string; ticket_number: string }

      if (lines.length > 0) {
        const { error: linesErr } = await supabase.from('order_items').insert(
          lines.map(l => ({
            order_id: orderRow.id,
            price_book_id: l.priceItemId || null,
            kind: l.kind,
            description: l.description,
            unit: l.unit,
            quantity: l.quantity,
            rate: Number(l.rate.toFixed(2)),
            amount: Number((l.quantity * l.rate).toFixed(2)),
          }))
        )
        if (linesErr) throw new Error(linesErr.message)

        // Material is committed the moment the order is written — it must not be
        // sold twice while the order waits on the board. Cancelling gives it back.
        const { data: { user } } = await supabase.auth.getUser()
        for (const line of lines.filter(l => l.kind === 'product')) {
          const item = priceItems.find(p => p.id === line.priceItemId)
          if (!item?.track_stock) continue
          const { error: rpcErr } = await supabase.rpc('adjust_stock', {
            p_id: line.priceItemId,
            p_delta: -line.quantity,
          })
          if (rpcErr) continue
          await supabase.from('stock_movements').insert([{
            price_book_id: line.priceItemId,
            kind: 'sale',
            quantity: -line.quantity,
            note: `Order ${orderRow.ticket_number}`,
            order_id: orderRow.id,
            created_by: user?.id || null,
          }])
        }
      }

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

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Customer Name</label>
              <input
                value={form.customer_name}
                onChange={(e) => setForm((p) => ({ ...p, customer_name: e.target.value }))}
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-slate-400"
                placeholder="Customer name"
              />
            </div>

            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Job Site Address
                {form.job_site_id && (
                  <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">Saved Site</span>
                )}
              </label>
              <input
                list="nom-address-suggestions"
                value={form.pickup_address}
                onChange={(e) => handleJobSiteAddressInput(e.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-slate-400"
                placeholder={customerAddressSuggestions.length > 0 ? 'Start typing a saved address' : 'Job site address'}
                autoComplete="street-address"
              />
              <datalist id="nom-address-suggestions">
                {customerAddressSuggestions.map((addr) => (
                  <option key={addr} value={addr} />
                ))}
              </datalist>
            </div>

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

                {form.old_bin_id && (
                  <div className="md:col-span-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                    Assigned bin on this order: <span className="font-semibold">{selectedExistingBin?.bin_number || form.old_bin_id.slice(0, 8)}</span>
                  </div>
                )}
              </>
            )}

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

            {/* ── Material and charges on this order ─────────────────────── */}
            <div className="md:col-span-2 rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
              <div className="mb-1 flex items-baseline justify-between gap-3">
                <label className="text-sm font-medium text-slate-700">
                  Material on this order {isMaterialOrder && <span className="text-rose-500">*</span>}
                </label>
                {linesTotal > 0 && (
                  <span className="text-sm font-bold text-slate-900">${linesTotal.toFixed(2)}</span>
                )}
              </div>
              <p className="mb-3 text-xs text-slate-500">
                {isBinService
                  ? 'Material dropped on the same trip as the bin — no delivery charge, we’re already going there.'
                  : 'What the truck is delivering. Stock is held as soon as the order is saved.'}
              </p>

              <input
                value={lineSearch}
                onChange={(e) => setLineSearch(e.target.value)}
                placeholder="Search material to add…"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-slate-400"
              />

              {lineSearch.trim() !== '' && (
                lineMatches.length === 0 ? (
                  <p className="mt-2 text-xs text-slate-500">Nothing matches that.</p>
                ) : (
                  <ul className="mt-2 divide-y divide-slate-100 overflow-hidden rounded-xl bg-white ring-1 ring-slate-200">
                    {lineMatches.map(item => (
                      <li key={item.id}>
                        <button
                          type="button"
                          onClick={() => addMaterialLine(item)}
                          className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm hover:bg-slate-50"
                        >
                          <span className="min-w-0 flex-1 truncate font-semibold text-slate-900">{item.name}</span>
                          <span className="shrink-0 text-slate-600">
                            ${Number(item.price).toFixed(2)}{item.unit ? ` / ${item.unit}` : ''}
                          </span>
                          {item.track_stock && (
                            <span className={`w-12 shrink-0 rounded px-1.5 py-0.5 text-center text-xs font-bold ${
                              Number(item.stock_qty) <= 0 ? 'bg-rose-50 text-rose-600' : 'bg-slate-100 text-slate-700'
                            }`}>
                              {Number(item.stock_qty)}
                            </span>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                )
              )}

              {lines.length > 0 && (
                <ul className="mt-3 space-y-2">
                  {lines.map(l => (
                    <li key={l.key} className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 ring-1 ring-slate-200">
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900">{l.description}</span>
                      <input
                        value={String(l.quantity)}
                        onChange={(e) => updateLineQty(l.key, e.target.value)}
                        inputMode="decimal"
                        className="w-16 rounded-lg border border-slate-200 px-2 py-1 text-center text-sm outline-none focus:border-slate-400"
                      />
                      {l.unit && <span className="text-xs text-slate-400">{l.unit}</span>}
                      <span className="w-20 text-right text-sm font-bold text-slate-900">
                        ${(l.quantity * l.rate).toFixed(2)}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeLine(l.key)}
                        className="rounded px-1.5 text-xs font-bold text-slate-300 hover:text-rose-600"
                      >
                        ✕
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {/* Delivery only applies to a standalone material trip */}
              {isMaterialOrder && hasMaterial && deliveryCharge && (
                <button
                  type="button"
                  onClick={toggleDeliveryCharge}
                  className={`mt-3 w-full rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                    deliveryOnOrder ? 'text-white' : 'text-slate-700 ring-1 ring-slate-300 hover:bg-white'
                  }`}
                  style={deliveryOnOrder ? { background: 'var(--accent)' } : undefined}
                >
                  {deliveryOnOrder
                    ? `✓ Delivery added — $${Number(deliveryCharge.price).toFixed(2)}`
                    : `Add delivery — $${Number(deliveryCharge.price).toFixed(2)}`}
                </button>
              )}

              {isBinService && hasMaterial && (
                <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                  No delivery charge — the bin service covers this trip.
                </p>
              )}

              <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={prepaid}
                  onChange={(e) => setPrepaid(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300"
                />
                Customer paid when placing this order
              </label>
            </div>

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
