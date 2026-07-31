'use client'

export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import AppShell from '@/components/AppShell'
import { useRole } from '@/hooks/useRole'
import { can } from '@/lib/roles'

type PriceItem = {
  id: string
  kind: 'service' | 'product'
  service_type: string | null
  bin_size: string | null
  name: string | null
  unit: string | null
  price: number
  customer_id: string | null
  created_at: string | null
}

const ORDER_TYPES = ['DELIVERY', 'EXCHANGE', 'REMOVAL', 'DUMP RETURN'] as const
const BIN_SIZES = ['6', '8', '10', '12', '14', '15', '20', '30', '40'] as const
/**
 * Units decide whether part quantities are allowed at the till: bulk measures
 * are scooped so half a yard is normal, countable things are whole only.
 */
const COUNTABLE_UNITS = ['each', 'bag', 'box', 'pallet'] as const
const BULK_UNITS = ['yard', 'tonne', 'load', 'hour'] as const
const UNITS = [...COUNTABLE_UNITS, ...BULK_UNITS] as const

function fmtPrice(value: number) {
  return `$${Number(value).toFixed(2)}`
}

export default function PricesPage() {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const { role, loading: roleLoading } = useRole()

  const [items, setItems] = useState<PriceItem[]>([])
  const [loading, setLoading] = useState(true)
  const [pageError, setPageError] = useState('')

  // Service form
  const [svcType, setSvcType] = useState<string>('DELIVERY')
  const [svcSize, setSvcSize] = useState<string>('20')
  const [svcPrice, setSvcPrice] = useState('')
  const [editingServiceId, setEditingServiceId] = useState<string | null>(null)
  const [savingService, setSavingService] = useState(false)

  // Product form
  const [prodName, setProdName] = useState('')
  const [prodUnit, setProdUnit] = useState<string>('each')
  const [prodPrice, setProdPrice] = useState('')
  const [editingProductId, setEditingProductId] = useState<string | null>(null)
  const [savingProduct, setSavingProduct] = useState(false)

  // Named charges — delivery fee and the like. Services, but not bin services.
  const [chargeName, setChargeName] = useState('')
  const [chargePrice, setChargePrice] = useState('')
  const [editingChargeId, setEditingChargeId] = useState<string | null>(null)
  const [savingCharge, setSavingCharge] = useState(false)

  useEffect(() => {
    if (!roleLoading && role !== null && !can(role, 'canViewReports')) {
      router.push(role === 'driver' ? '/driver' : '/dispatch')
    }
  }, [roleLoading, role])

  async function loadItems() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    const { data, error } = await supabase
      .from('price_book')
      .select('id,kind,service_type,bin_size,name,unit,price,customer_id,created_at')
      .is('customer_id', null)
    if (error) { setPageError(error.message); setLoading(false); return }
    setItems((data as PriceItem[]) || [])
    setLoading(false)
  }

  useEffect(() => { void loadItems() }, [])

  // Bin services are keyed by type + size; named services (delivery fee,
  // environmental fee) are charges that aren't tied to a bin.
  const services = useMemo(
    () => items
      .filter((i) => i.kind === 'service' && i.service_type)
      .sort((a, b) =>
        (a.service_type || '').localeCompare(b.service_type || '') ||
        (Number(a.bin_size) || 0) - (Number(b.bin_size) || 0)
      ),
    [items]
  )

  const charges = useMemo(
    () => items
      .filter((i) => i.kind === 'service' && !i.service_type && i.name)
      .sort((a, b) => (a.name || '').localeCompare(b.name || '')),
    [items]
  )

  const products = useMemo(
    () => items
      .filter((i) => i.kind === 'product')
      .sort((a, b) => (a.name || '').localeCompare(b.name || '')),
    [items]
  )

  // ── Services ────────────────────────────────────────────────────────────────
  function startEditService(item: PriceItem) {
    setEditingServiceId(item.id)
    setSvcType(item.service_type || 'DELIVERY')
    setSvcSize(item.bin_size || '20')
    setSvcPrice(String(item.price))
  }

  function resetServiceForm() {
    setEditingServiceId(null)
    setSvcPrice('')
  }

  async function saveService() {
    setPageError('')
    const price = Number(svcPrice)
    if (!svcPrice.trim() || Number.isNaN(price) || price < 0) {
      setPageError('Enter a valid price for the service.')
      return
    }

    const duplicate = services.find(
      (s) => s.service_type === svcType && s.bin_size === svcSize && s.id !== editingServiceId
    )
    if (duplicate) {
      setPageError(`${svcType} ${svcSize}Y already has a price (${fmtPrice(duplicate.price)}) — edit that line instead.`)
      return
    }

    setSavingService(true)
    if (editingServiceId) {
      const { error } = await supabase
        .from('price_book')
        .update({ service_type: svcType, bin_size: svcSize, price, updated_at: new Date().toISOString() })
        .eq('id', editingServiceId)
      if (error) { setPageError(error.message); setSavingService(false); return }
    } else {
      const { error } = await supabase
        .from('price_book')
        .insert([{ kind: 'service', service_type: svcType, bin_size: svcSize, price }])
      if (error) { setPageError(error.message); setSavingService(false); return }
    }
    setSavingService(false)
    resetServiceForm()
    await loadItems()
  }

  // ── Products ────────────────────────────────────────────────────────────────
  function startEditProduct(item: PriceItem) {
    setEditingProductId(item.id)
    setProdName(item.name || '')
    setProdUnit(item.unit || 'each')
    setProdPrice(String(item.price))
  }

  function resetProductForm() {
    setEditingProductId(null)
    setProdName('')
    setProdPrice('')
  }

  async function saveProduct() {
    setPageError('')
    const price = Number(prodPrice)
    if (!prodName.trim()) { setPageError('Enter a product name.'); return }
    if (!prodPrice.trim() || Number.isNaN(price) || price < 0) {
      setPageError('Enter a valid price for the product.')
      return
    }

    const duplicate = products.find(
      (p) => (p.name || '').toLowerCase() === prodName.trim().toLowerCase() && p.id !== editingProductId
    )
    if (duplicate) {
      setPageError(`"${prodName.trim()}" already exists (${fmtPrice(duplicate.price)}/${duplicate.unit}) — edit that line instead.`)
      return
    }

    setSavingProduct(true)
    if (editingProductId) {
      const { error } = await supabase
        .from('price_book')
        .update({ name: prodName.trim(), unit: prodUnit, price, updated_at: new Date().toISOString() })
        .eq('id', editingProductId)
      if (error) { setPageError(error.message); setSavingProduct(false); return }
    } else {
      const { error } = await supabase
        .from('price_book')
        .insert([{ kind: 'product', name: prodName.trim(), unit: prodUnit, price }])
      if (error) { setPageError(error.message); setSavingProduct(false); return }
    }
    setSavingProduct(false)
    resetProductForm()
    await loadItems()
  }

  // ── Named charges ───────────────────────────────────────────────────────────
  function startEditCharge(item: PriceItem) {
    setEditingChargeId(item.id)
    setChargeName(item.name || '')
    setChargePrice(String(item.price))
  }

  function resetChargeForm() {
    setEditingChargeId(null)
    setChargeName('')
    setChargePrice('')
  }

  async function saveCharge() {
    setPageError('')
    const price = Number(chargePrice)
    if (!chargeName.trim()) { setPageError('Enter a name for the charge.'); return }
    if (!chargePrice.trim() || Number.isNaN(price) || price < 0) {
      setPageError('Enter a valid amount for the charge.')
      return
    }

    const duplicate = charges.find(
      (c) => (c.name || '').toLowerCase() === chargeName.trim().toLowerCase() && c.id !== editingChargeId
    )
    if (duplicate) {
      setPageError(`"${chargeName.trim()}" already exists (${fmtPrice(duplicate.price)}) — edit that line instead.`)
      return
    }

    setSavingCharge(true)
    if (editingChargeId) {
      const { error } = await supabase
        .from('price_book')
        .update({ name: chargeName.trim(), price, updated_at: new Date().toISOString() })
        .eq('id', editingChargeId)
      if (error) { setPageError(error.message); setSavingCharge(false); return }
    } else {
      const { error } = await supabase
        .from('price_book')
        .insert([{ kind: 'service', name: chargeName.trim(), price }])
      if (error) { setPageError(error.message); setSavingCharge(false); return }
    }
    setSavingCharge(false)
    resetChargeForm()
    await loadItems()
  }

  async function deleteItem(item: PriceItem) {
    const label = item.kind === 'service' && item.service_type
      ? `${item.service_type} ${item.bin_size}Y`
      : item.name || 'this item'
    if (!window.confirm(`Delete the price for ${label}?`)) return
    setPageError('')
    const { error } = await supabase.from('price_book').delete().eq('id', item.id)
    if (error) { setPageError(error.message); return }
    if (editingServiceId === item.id) resetServiceForm()
    if (editingProductId === item.id) resetProductForm()
    if (editingChargeId === item.id) resetChargeForm()
    await loadItems()
  }

  return (
    <AppShell
      title="Price Book"
      subtitle="Rates for services and products — the base for every invoice"
      maxWidth="max-w-5xl"
    >
      <>
        {pageError ? (
          <div className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {pageError}
          </div>
        ) : null}

        {/* ── Bin Services ─────────────────────────────────────────────────── */}
        <div className="mb-6 overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-slate-200">
          <div className="border-b border-slate-200 px-6 py-4">
            <h2 className="text-lg font-bold text-slate-900">Bin Services</h2>
            <p className="mt-0.5 text-sm text-slate-500">One price per service type and bin size</p>
          </div>

          <div className="border-b border-slate-100 bg-slate-50/60 px-6 py-4">
            <div className="grid gap-3 sm:grid-cols-4">
              <select
                value={svcType}
                onChange={(e) => setSvcType(e.target.value)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-400"
              >
                {ORDER_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <select
                value={svcSize}
                onChange={(e) => setSvcSize(e.target.value)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-400"
              >
                {BIN_SIZES.map((s) => <option key={s} value={s}>{s} Yard</option>)}
              </select>
              <input
                value={svcPrice}
                onChange={(e) => setSvcPrice(e.target.value)}
                placeholder="Price (e.g. 350.00)"
                inputMode="decimal"
                className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-slate-400"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => void saveService()}
                  disabled={savingService}
                  className="flex-1 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
                >
                  {savingService ? 'Saving…' : editingServiceId ? 'Save Changes' : 'Add Price'}
                </button>
                {editingServiceId && (
                  <button
                    onClick={resetServiceForm}
                    className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
          </div>

          {loading ? (
            <div className="p-10 text-center text-sm text-slate-500">Loading prices…</div>
          ) : services.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">
              No service prices yet — add the first one above.
            </div>
          ) : (
            <table className="w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">Service</th>
                  <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">Bin Size</th>
                  <th className="px-6 py-3 text-right text-xs font-bold uppercase tracking-wide text-slate-500">Price</th>
                  <th className="px-6 py-3 text-right text-xs font-bold uppercase tracking-wide text-slate-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {services.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/80">
                    <td className="px-6 py-3 text-sm font-semibold text-slate-900">{item.service_type}</td>
                    <td className="px-6 py-3 text-sm text-slate-700">{item.bin_size}Y</td>
                    <td className="px-6 py-3 text-right text-sm font-bold text-slate-900">{fmtPrice(item.price)}</td>
                    <td className="px-6 py-3 text-right whitespace-nowrap">
                      <button
                        onClick={() => startEditService(item)}
                        className="mr-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => void deleteItem(item)}
                        className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* ── Products & Materials ─────────────────────────────────────────── */}
        <div className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-slate-200">
          <div className="border-b border-slate-200 px-6 py-4">
            <h2 className="text-lg font-bold text-slate-900">Products & Materials</h2>
            <p className="mt-0.5 text-sm text-slate-500">Soil, mulch, tools — anything sold by unit</p>
          </div>

          <div className="border-b border-slate-100 bg-slate-50/60 px-6 py-4">
            <div className="grid gap-3 sm:grid-cols-4">
              <input
                value={prodName}
                onChange={(e) => setProdName(e.target.value)}
                placeholder="Product name (e.g. Triple Mix Soil)"
                className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-slate-400"
              />
              <select
                value={prodUnit}
                onChange={(e) => setProdUnit(e.target.value)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-400"
              >
                <optgroup label="Counted whole (each, bag…)">
                  {COUNTABLE_UNITS.map((u) => <option key={u} value={u}>per {u}</option>)}
                </optgroup>
                <optgroup label="Bulk — part quantities allowed">
                  {BULK_UNITS.map((u) => <option key={u} value={u}>per {u}</option>)}
                </optgroup>
              </select>
              <input
                value={prodPrice}
                onChange={(e) => setProdPrice(e.target.value)}
                placeholder="Price (e.g. 45.00)"
                inputMode="decimal"
                className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-slate-400"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => void saveProduct()}
                  disabled={savingProduct}
                  className="flex-1 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
                >
                  {savingProduct ? 'Saving…' : editingProductId ? 'Save Changes' : 'Add Product'}
                </button>
                {editingProductId && (
                  <button
                    onClick={resetProductForm}
                    className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
          </div>

          {loading ? (
            <div className="p-10 text-center text-sm text-slate-500">Loading products…</div>
          ) : products.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">
              No products yet — add soil, mulch, tools, or anything else sold by unit.
            </div>
          ) : (
            <table className="w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">Product</th>
                  <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">Unit</th>
                  <th className="px-6 py-3 text-right text-xs font-bold uppercase tracking-wide text-slate-500">Price</th>
                  <th className="px-6 py-3 text-right text-xs font-bold uppercase tracking-wide text-slate-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {products.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/80">
                    <td className="px-6 py-3 text-sm font-semibold text-slate-900">{item.name}</td>
                    <td className="px-6 py-3 text-sm text-slate-700">per {item.unit}</td>
                    <td className="px-6 py-3 text-right text-sm font-bold text-slate-900">{fmtPrice(item.price)}</td>
                    <td className="px-6 py-3 text-right whitespace-nowrap">
                      <button
                        onClick={() => startEditProduct(item)}
                        className="mr-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => void deleteItem(item)}
                        className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* ── Other Charges ────────────────────────────────────────────────── */}
        <div className="mt-6 overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-slate-200">
          <div className="border-b border-slate-200 px-6 py-4">
            <h2 className="text-lg font-bold text-slate-900">Other Charges</h2>
            <p className="mt-0.5 text-sm text-slate-500">
              Named services that aren&apos;t tied to a bin — a delivery fee for material, an
              environmental fee. Add one called <strong>Delivery</strong> and it becomes a one-tap
              button on Quick Sale.
            </p>
          </div>

          <div className="border-b border-slate-100 bg-slate-50/60 px-6 py-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <input
                value={chargeName}
                onChange={(e) => setChargeName(e.target.value)}
                placeholder="Charge name (e.g. Delivery)"
                className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-slate-400"
              />
              <input
                value={chargePrice}
                onChange={(e) => setChargePrice(e.target.value)}
                placeholder="Amount (e.g. 85.00)"
                inputMode="decimal"
                className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-slate-400"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => void saveCharge()}
                  disabled={savingCharge}
                  className="flex-1 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
                >
                  {savingCharge ? 'Saving…' : editingChargeId ? 'Save Changes' : 'Add Charge'}
                </button>
                {editingChargeId && (
                  <button
                    onClick={resetChargeForm}
                    className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
          </div>

          {loading ? (
            <div className="p-10 text-center text-sm text-slate-500">Loading charges…</div>
          ) : charges.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">
              No other charges yet — add a <strong>Delivery</strong> charge to enable it at the till.
            </div>
          ) : (
            <table className="w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">Charge</th>
                  <th className="px-6 py-3 text-right text-xs font-bold uppercase tracking-wide text-slate-500">Amount</th>
                  <th className="px-6 py-3 text-right text-xs font-bold uppercase tracking-wide text-slate-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {charges.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/80">
                    <td className="px-6 py-3 text-sm font-semibold text-slate-900">{item.name}</td>
                    <td className="px-6 py-3 text-right text-sm font-bold text-slate-900">{fmtPrice(item.price)}</td>
                    <td className="px-6 py-3 text-right whitespace-nowrap">
                      <button
                        onClick={() => startEditCharge(item)}
                        className="mr-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => void deleteItem(item)}
                        className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </>
    </AppShell>
  )
}
