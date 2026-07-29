'use client'

export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import AppShell from '@/components/AppShell'
import Icon from '@/components/Icon'
import { CLIENT_CONFIG } from '@/lib/client-config'
import { useRole } from '@/hooks/useRole'
import { can } from '@/lib/roles'

type Product = {
  id: string
  name: string | null
  unit: string | null
  price: number
  track_stock: boolean
  stock_qty: number
}

type ReceiveLine = {
  key: string
  productId: string
  description: string
  unit: string | null
  quantity: number
  unitCost: number
  /** Free-text lines (delivery charge, fuel surcharge) cost money but add no stock. */
  stockable: boolean
}

type Completed = {
  reference: string
  supplier: string
  lines: ReceiveLine[]
  subtotal: number
  tax: number
  total: number
  stockUpdated: number
  /** Products that came in, so the sale price can be set straight after. */
  received: { id: string; name: string; unit: string | null; cost: number; price: number }[]
}

const NEW_PRODUCT_UNITS = ['yard', 'each', 'bag', 'load', 'tonne', 'hour'] as const

const PAYMENT_METHODS = ['On Account', 'Credit Card', 'Debit', 'Cheque', 'Cash', 'E-transfer'] as const

function fmtMoney(v: number) {
  return `$${Number(v || 0).toFixed(2)}`
}

function todayKey() {
  return new Date().toLocaleDateString('en-CA')
}

export default function ReceivingPage() {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const { role, loading: roleLoading } = useRole()

  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [pageError, setPageError] = useState('')
  const [saving, setSaving] = useState(false)
  const [completed, setCompleted] = useState<Completed | null>(null)

  // Bill header
  const [supplier, setSupplier] = useState('')
  const [reference, setReference] = useState('')
  const [date, setDate] = useState(todayKey())
  const [paymentMethod, setPaymentMethod] = useState<string>('On Account')
  const [taxOverride, setTaxOverride] = useState('')

  // Lines
  const [lines, setLines] = useState<ReceiveLine[]>([])
  const [selectedProductId, setSelectedProductId] = useState('')
  const [qty, setQty] = useState('1')
  const [cost, setCost] = useState('')

  // Creating a product that isn't in the price book yet
  const [showNewProduct, setShowNewProduct] = useState(false)
  const [newName, setNewName] = useState('')
  const [newUnit, setNewUnit] = useState<string>('yard')
  const [creatingProduct, setCreatingProduct] = useState(false)

  // Sale prices set on the confirmation screen
  const [priceEdits, setPriceEdits] = useState<Record<string, string>>({})
  const [savingPrices, setSavingPrices] = useState(false)
  const [pricesSaved, setPricesSaved] = useState(false)

  useEffect(() => {
    if (!roleLoading && role !== null && !can(role, 'canViewReports')) {
      router.push(role === 'driver' ? '/driver' : '/dispatch')
    }
  }, [roleLoading, role])

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data, error } = await supabase
        .from('price_book')
        .select('id,name,unit,price,track_stock,stock_qty')
        .eq('kind', 'product')
        .is('customer_id', null)
        .order('name')
      if (error) setPageError(error.message)
      setProducts((data as Product[]) || [])
      setLoading(false)
    }
    void load()
  }, [])

  const subtotal = useMemo(() => lines.reduce((s, l) => s + l.quantity * l.unitCost, 0), [lines])
  const tax = useMemo(() => {
    if (taxOverride.trim() !== '') {
      const n = Number(taxOverride)
      return Number.isNaN(n) ? 0 : n
    }
    return subtotal * (CLIENT_CONFIG.taxRate / 100)
  }, [subtotal, taxOverride])
  const total = subtotal + tax

  function addProductLine() {
    setPageError('')
    const product = products.find(p => p.id === selectedProductId)
    if (!product) { setPageError('Pick a product to add.'); return }
    const quantity = Number(qty)
    const unitCost = Number(cost)
    if (!qty.trim() || Number.isNaN(quantity) || quantity <= 0) {
      setPageError('Enter how many arrived.')
      return
    }
    if (!cost.trim() || Number.isNaN(unitCost) || unitCost < 0) {
      setPageError('Enter what you paid per unit.')
      return
    }
    setLines(cur => [...cur, {
      key: `${product.id}-${Date.now()}`,
      productId: product.id,
      description: product.name || 'Product',
      unit: product.unit,
      quantity,
      unitCost,
      stockable: true,
    }])
    setSelectedProductId('')
    setQty('1')
    setCost('')
  }

  // Stock In is the entrance for new materials too — create it here, price it later
  async function createProduct() {
    setPageError('')
    const name = newName.trim()
    if (!name) { setPageError('Give the new material a name.'); return }
    if (products.some(p => (p.name || '').toLowerCase() === name.toLowerCase())) {
      setPageError(`"${name}" is already in the price book.`)
      return
    }
    setCreatingProduct(true)
    const { data, error } = await supabase
      .from('price_book')
      .insert([{ kind: 'product', name, unit: newUnit, price: 0, track_stock: true }])
      .select('id,name,unit,price,track_stock,stock_qty')
      .single()
    setCreatingProduct(false)
    if (error || !data) { setPageError(error?.message || 'Could not add the material.'); return }

    const created = data as Product
    setProducts(cur => [...cur, created].sort((a, b) => (a.name || '').localeCompare(b.name || '')))
    setSelectedProductId(created.id)
    setNewName('')
    setShowNewProduct(false)
  }

  function addChargeLine() {
    setLines(cur => [...cur, {
      key: `charge-${Date.now()}`,
      productId: '',
      description: '',
      unit: null,
      quantity: 1,
      unitCost: 0,
      stockable: false,
    }])
  }

  function updateLine(key: string, patch: Partial<ReceiveLine>) {
    setLines(cur => cur.map(l => (l.key === key ? { ...l, ...patch } : l)))
  }

  function removeLine(key: string) {
    setLines(cur => cur.filter(l => l.key !== key))
  }

  function resetAll() {
    setLines([])
    setSupplier('')
    setReference('')
    setDate(todayKey())
    setPaymentMethod('On Account')
    setTaxOverride('')
    setCompleted(null)
    setPageError('')
  }

  async function saveDelivery() {
    setPageError('')
    if (!supplier.trim()) { setPageError('Enter the supplier name.'); return }
    if (lines.length === 0) { setPageError('Add at least one line from the delivery.'); return }
    if (lines.some(l => !l.description.trim())) { setPageError('Every line needs a description.'); return }
    if (lines.some(l => l.quantity <= 0)) { setPageError('Every line needs a quantity greater than zero.'); return }

    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()

    const itemSummary = lines
      .map(l => `${l.description} ×${l.quantity}`)
      .join(', ')
      .slice(0, 300)

    // 1. The supplier bill — this is what the HST return and P&L read
    const { data: expense, error: expenseError } = await supabase
      .from('expenses')
      .insert([{
        expense_date: date,
        supplier: supplier.trim(),
        reference: reference.trim() || null,
        category: 'Inventory / Purchases',
        description: itemSummary,
        subtotal: Number(subtotal.toFixed(2)),
        tax_amount: Number(tax.toFixed(2)),
        total: Number(total.toFixed(2)),
        payment_method: paymentMethod,
        created_by: user?.id || null,
      }])
      .select('id')
      .single()

    if (expenseError || !expense) {
      setPageError(expenseError?.message || 'Could not save the supplier bill.')
      setSaving(false)
      return
    }

    const expenseId = (expense as { id: string }).id

    // 2. Stock in, linked back to that bill
    const stockLines = lines.filter(l => l.stockable && l.productId)
    const failed: string[] = []
    for (const line of stockLines) {
      const product = products.find(p => p.id === line.productId)
      // Receiving into an untracked product implies they want it tracked
      if (product && !product.track_stock) {
        await supabase.from('price_book').update({ track_stock: true }).eq('id', line.productId)
      }
      const { error: rpcError } = await supabase.rpc('adjust_stock', {
        p_id: line.productId,
        p_delta: line.quantity,
      })
      if (rpcError) { failed.push(line.description); continue }
      await supabase.from('stock_movements').insert([{
        price_book_id: line.productId,
        movement_date: date,
        kind: 'receive',
        quantity: line.quantity,
        note: reference.trim() ? `${supplier.trim()} — ${reference.trim()}` : supplier.trim(),
        expense_id: expenseId,
        created_by: user?.id || null,
      }])
    }

    setSaving(false)
    if (failed.length > 0) {
      setPageError(`Bill saved, but stock did not update for: ${failed.join(', ')}. Correct it in Inventory.`)
      return
    }

    // Hand the received products to the confirmation screen so their selling
    // price can be set right away — that's the waterfall from cost to price.
    const received = stockLines.map(line => {
      const product = products.find(p => p.id === line.productId)
      return {
        id: line.productId,
        name: line.description,
        unit: line.unit,
        cost: line.unitCost,
        price: Number(product?.price || 0),
      }
    })
    setPriceEdits(Object.fromEntries(received.map(r => [r.id, r.price > 0 ? String(r.price) : ''])))
    setPricesSaved(false)

    setCompleted({
      reference: reference.trim() || '(no bill number)',
      supplier: supplier.trim(),
      lines,
      subtotal,
      tax,
      total,
      stockUpdated: stockLines.length,
      received,
    })
  }

  async function saveSalePrices() {
    setPageError('')
    if (!completed) return
    const updates = completed.received
      .map(r => ({ id: r.id, price: Number(priceEdits[r.id]) }))
      .filter(u => priceEdits[u.id]?.trim() !== '' && !Number.isNaN(u.price) && u.price >= 0)

    if (updates.length === 0) { setPageError('Enter at least one selling price.'); return }

    setSavingPrices(true)
    for (const u of updates) {
      const { error } = await supabase
        .from('price_book')
        .update({ price: u.price, updated_at: new Date().toISOString() })
        .eq('id', u.id)
      if (error) { setPageError(error.message); setSavingPrices(false); return }
    }
    setSavingPrices(false)
    setPricesSaved(true)
    setProducts(cur => cur.map(p => {
      const u = updates.find(x => x.id === p.id)
      return u ? { ...p, price: u.price } : p
    }))
  }

  // ── Confirmation ────────────────────────────────────────────────────────────
  if (completed) {
    return (
      <AppShell title="Stock In" subtitle="Supplier bill and stock, recorded together" maxWidth="max-w-3xl">
        <>
          <div className="rounded-xl bg-white p-8 text-center ring-1 ring-slate-200">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
              <Icon name="check" className="h-8 w-8 text-emerald-600" strokeWidth={2.2} />
            </div>
            <h1 className="text-2xl font-semibold text-slate-900">Stock received</h1>
            <p className="mt-1 text-sm text-slate-500">
              {completed.supplier} · {completed.reference}
            </p>

            <div className="mx-auto mt-6 max-w-sm space-y-2 rounded-xl bg-slate-50 p-5 text-left ring-1 ring-slate-200">
              <div className="flex justify-between text-sm text-slate-600">
                <span>Bill total</span>
                <span className="font-semibold text-slate-900">{fmtMoney(completed.total)}</span>
              </div>
              <div className="flex justify-between text-sm text-slate-600">
                <span>{CLIENT_CONFIG.taxLabel} recoverable</span>
                <span className="font-semibold text-blue-600">{fmtMoney(completed.tax)}</span>
              </div>
              <div className="flex justify-between border-t border-slate-200 pt-2 text-sm text-slate-600">
                <span>Materials stocked</span>
                <span className="font-semibold text-emerald-700">{completed.stockUpdated}</span>
              </div>
            </div>
          </div>

          {/* Step 2 of the waterfall: cost is known, now set what you sell it for */}
          {completed.received.length > 0 && (
            <div className="mt-6 overflow-hidden rounded-xl bg-white ring-1 ring-slate-200">
              <div className="border-b border-slate-200 px-6 py-4">
                <h2 className="text-base font-semibold text-slate-900">Set your selling prices</h2>
                <p className="mt-0.5 text-sm text-slate-500">
                  You know what it cost — set what you charge. This is what the counter and invoices will use.
                </p>
              </div>

              {pricesSaved && (
                <div className="border-b border-emerald-200 bg-emerald-50 px-6 py-3 text-sm text-emerald-800">
                  ✓ Selling prices updated.
                </div>
              )}

              <table className="w-full divide-y divide-slate-100">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">Material</th>
                    <th className="px-6 py-3 text-right text-xs font-bold uppercase tracking-wide text-slate-500">You paid</th>
                    <th className="px-6 py-3 text-right text-xs font-bold uppercase tracking-wide text-slate-500">You charge</th>
                    <th className="px-6 py-3 text-right text-xs font-bold uppercase tracking-wide text-slate-500">Margin</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {completed.received.map(r => {
                    const entered = Number(priceEdits[r.id])
                    const hasPrice = priceEdits[r.id]?.trim() !== '' && !Number.isNaN(entered)
                    const margin = hasPrice && r.cost > 0 ? ((entered - r.cost) / r.cost) * 100 : null
                    return (
                      <tr key={r.id}>
                        <td className="px-6 py-3">
                          <div className="text-sm font-semibold text-slate-900">{r.name}</div>
                          <div className="text-xs text-slate-500">per {r.unit || 'each'}</div>
                        </td>
                        <td className="px-6 py-3 text-right text-sm text-slate-600 whitespace-nowrap">
                          {fmtMoney(r.cost)}
                        </td>
                        <td className="px-6 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <span className="text-slate-400">$</span>
                            <input
                              value={priceEdits[r.id] ?? ''}
                              onChange={e => { setPriceEdits(p => ({ ...p, [r.id]: e.target.value })); setPricesSaved(false) }}
                              inputMode="decimal"
                              placeholder="0.00"
                              className="w-24 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-right text-sm text-slate-900 outline-none placeholder:text-slate-300 focus:border-slate-400"
                            />
                          </div>
                        </td>
                        <td className="px-6 py-3 text-right text-sm whitespace-nowrap">
                          {margin === null ? (
                            <span className="text-slate-300">—</span>
                          ) : (
                            <span className={margin >= 0 ? 'font-semibold text-emerald-600' : 'font-semibold text-rose-600'}>
                              {margin >= 0 ? '+' : ''}{margin.toFixed(0)}%
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>

              <div className="border-t border-slate-200 px-6 py-4">
                <button
                  onClick={() => void saveSalePrices()}
                  disabled={savingPrices}
                  className="rounded-lg px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
                  style={{ background: 'var(--accent)' }}
                >
                  {savingPrices ? 'Saving…' : 'Save selling prices'}
                </button>
                <p className="mt-2 text-xs text-slate-500">
                  Leave a price blank to keep what&apos;s already in the price book.
                </p>
              </div>
            </div>
          )}

          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <button
              onClick={resetAll}
              className="rounded-lg px-6 py-3 text-sm font-semibold text-white transition hover:opacity-90"
              style={{ background: 'var(--accent)' }}
            >
              Receive another
            </button>
            <Link href="/inventory" className="rounded-lg px-6 py-3 text-sm font-semibold text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50">
              View Inventory
            </Link>
            <Link href="/expenses" className="rounded-lg px-6 py-3 text-sm font-semibold text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50">
              View Expenses
            </Link>
          </div>
        </>
      </AppShell>
    )
  }

  // ── Entry ───────────────────────────────────────────────────────────────────
  return (
    <AppShell
      title="Stock In"
      subtitle="Materials arriving from a supplier — enter the bill once and it stocks, expenses, and claims the tax"
      maxWidth="max-w-6xl"
    >
      <>
        {pageError ? (
          <div className="mb-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{pageError}</div>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">

            {/* Bill header */}
            <div className="rounded-xl bg-white p-6 ring-1 ring-slate-200">
              <h2 className="mb-4 text-base font-semibold text-slate-900">Supplier bill</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500">Supplier *</label>
                  <input
                    value={supplier}
                    onChange={e => setSupplier(e.target.value)}
                    placeholder="e.g. Ontario Soil Supply"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-slate-400"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500">Bill / invoice number</label>
                  <input
                    value={reference}
                    onChange={e => setReference(e.target.value)}
                    placeholder="From the supplier's paperwork"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-slate-400"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500">Date</label>
                  <input
                    type="date"
                    value={date}
                    onChange={e => setDate(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-400"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500">Paid by</label>
                  <select
                    value={paymentMethod}
                    onChange={e => setPaymentMethod(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-400"
                  >
                    {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* Add lines */}
            <div className="rounded-xl bg-white p-6 ring-1 ring-slate-200">
              <h2 className="mb-4 text-base font-semibold text-slate-900">What arrived</h2>
              {loading ? (
                <p className="text-sm text-slate-500">Loading products…</p>
              ) : products.length === 0 ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  No products yet. <Link href="/prices" className="font-bold underline">Add them to the Price Book →</Link>
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-[1fr_100px_120px_auto]">
                  <select
                    value={selectedProductId}
                    onChange={e => setSelectedProductId(e.target.value)}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-400"
                  >
                    <option value="">Select a product…</option>
                    {products.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name}{p.track_stock ? ` — ${p.stock_qty} on hand` : ''}
                      </option>
                    ))}
                  </select>
                  <input
                    value={qty}
                    onChange={e => setQty(e.target.value)}
                    inputMode="decimal"
                    placeholder="Qty"
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-slate-400"
                  />
                  <input
                    value={cost}
                    onChange={e => setCost(e.target.value)}
                    inputMode="decimal"
                    placeholder="Cost each"
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-slate-400"
                  />
                  <button
                    onClick={addProductLine}
                    className="rounded-lg px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
                    style={{ background: 'var(--accent)' }}
                  >
                    Add
                  </button>
                </div>
              )}
              {/* New material — Stock In is where materials first enter the system */}
              {showNewProduct ? (
                <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">New material</p>
                  <div className="grid gap-3 sm:grid-cols-[1fr_140px_auto_auto]">
                    <input
                      value={newName}
                      onChange={e => setNewName(e.target.value)}
                      placeholder="e.g. Screened Topsoil"
                      className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-slate-400"
                    />
                    <select
                      value={newUnit}
                      onChange={e => setNewUnit(e.target.value)}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-400"
                    >
                      {NEW_PRODUCT_UNITS.map(u => <option key={u} value={u}>per {u}</option>)}
                    </select>
                    <button
                      onClick={() => void createProduct()}
                      disabled={creatingProduct}
                      className="rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
                      style={{ background: 'var(--accent)' }}
                    >
                      {creatingProduct ? 'Adding…' : 'Add material'}
                    </button>
                    <button
                      onClick={() => { setShowNewProduct(false); setNewName('') }}
                      className="rounded-lg px-3 py-2.5 text-sm font-medium text-slate-600 ring-1 ring-slate-200 hover:bg-white"
                    >
                      Cancel
                    </button>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    Selling price gets set after the delivery is recorded.
                  </p>
                </div>
              ) : (
                <button
                  onClick={() => setShowNewProduct(true)}
                  className="mt-3 mr-4 text-xs font-semibold text-[var(--accent)] underline"
                >
                  + New material (not in the price book yet)
                </button>
              )}

              <button
                onClick={addChargeLine}
                className="mt-3 text-xs font-semibold text-slate-500 underline hover:text-slate-800"
              >
                + Add a charge that isn&apos;t stock (freight, fuel surcharge)
              </button>
              <p className="mt-2 text-xs text-slate-400">
                Cost each is what <em>you</em> paid, not your selling price. Fractions are fine — enter 0.5 for half a yard.
              </p>
            </div>

            {/* Lines */}
            <div className="overflow-hidden rounded-xl bg-white ring-1 ring-slate-200">
              <div className="border-b border-slate-200 px-6 py-4">
                <h2 className="text-base font-semibold text-slate-900">Delivery lines</h2>
                <p className="mt-0.5 text-xs text-slate-500">Stock lines add to inventory; charges only affect the bill</p>
              </div>
              {lines.length === 0 ? (
                <div className="p-10 text-center text-sm text-slate-500">Nothing added yet.</div>
              ) : (
                <table className="w-full divide-y divide-slate-200">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">Item</th>
                      <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wide text-slate-500">Qty</th>
                      <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wide text-slate-500">Cost each</th>
                      <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wide text-slate-500">Total</th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {lines.map(l => (
                      <tr key={l.key}>
                        <td className="px-4 py-2.5">
                          {l.stockable ? (
                            <div>
                              <div className="text-sm font-semibold text-slate-900">{l.description}</div>
                              <div className="text-xs text-emerald-600">adds to stock</div>
                            </div>
                          ) : (
                            <input
                              value={l.description}
                              onChange={e => updateLine(l.key, { description: e.target.value })}
                              placeholder="Delivery fee, surcharge…"
                              className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-slate-400"
                            />
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <input
                            value={String(l.quantity)}
                            onChange={e => updateLine(l.key, { quantity: Number(e.target.value) || 0 })}
                            inputMode="decimal"
                            className="w-20 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-right text-sm text-slate-900 outline-none focus:border-slate-400"
                          />
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <input
                            value={String(l.unitCost)}
                            onChange={e => updateLine(l.key, { unitCost: Number(e.target.value) || 0 })}
                            inputMode="decimal"
                            className="w-24 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-right text-sm text-slate-900 outline-none focus:border-slate-400"
                          />
                        </td>
                        <td className="px-4 py-2.5 text-right text-sm font-bold text-slate-900 whitespace-nowrap">
                          {fmtMoney(l.quantity * l.unitCost)}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <button
                            onClick={() => removeLine(l.key)}
                            className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-700 hover:bg-rose-100"
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Totals */}
          <div className="space-y-6">
            <div className="rounded-xl bg-white p-6 ring-1 ring-slate-200">
              <div className="flex justify-between text-sm text-slate-600">
                <span>Subtotal</span>
                <span className="font-semibold text-slate-900">{fmtMoney(subtotal)}</span>
              </div>

              <div className="mt-4">
                <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500">
                  {CLIENT_CONFIG.taxLabel} on the bill
                </label>
                <input
                  value={taxOverride}
                  onChange={e => setTaxOverride(e.target.value)}
                  inputMode="decimal"
                  placeholder={(subtotal * (CLIENT_CONFIG.taxRate / 100)).toFixed(2)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-right text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-slate-400"
                />
                <p className="mt-1 text-[11px] text-slate-400">
                  Calculated at {CLIENT_CONFIG.taxRate}% — type the exact figure from the bill if it differs
                </p>
              </div>

              <div className="mt-4 flex justify-between border-t border-slate-300 pt-4">
                <span className="text-base font-bold text-slate-900">TOTAL</span>
                <span className="text-2xl font-black text-slate-900">{fmtMoney(total)}</span>
              </div>

              <button
                onClick={() => void saveDelivery()}
                disabled={saving || lines.length === 0}
                className="mt-5 w-full rounded-lg px-6 py-4 text-base font-bold text-white transition hover:opacity-90 disabled:opacity-40"
                style={{ background: 'var(--accent)' }}
              >
                {saving ? 'Saving…' : 'Record Delivery'}
              </button>
              {lines.length > 0 && (
                <button
                  onClick={resetAll}
                  className="mt-2 w-full rounded-lg px-6 py-2.5 text-sm font-medium text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
                >
                  Clear
                </button>
              )}
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">What this does</p>
              <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-slate-600">
                <li>• Records the bill as an expense under <strong>Inventory / Purchases</strong></li>
                <li>• Claims the {CLIENT_CONFIG.taxLabel} as an input tax credit on your return</li>
                <li>• Adds the quantities to stock, logged against this bill</li>
              </ul>
            </div>
          </div>
        </div>
      </>
    </AppShell>
  )
}
