'use client'

export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Fragment, useEffect, useMemo, useState } from 'react'
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
  low_stock_at: number | null
}

type Movement = {
  id: string
  price_book_id: string
  movement_date: string
  kind: 'receive' | 'sale' | 'adjust' | 'return'
  quantity: number
  note: string | null
  created_at: string
}

const KIND_LABEL: Record<Movement['kind'], string> = {
  receive: 'Received',
  sale: 'Sold',
  adjust: 'Adjusted',
  return: 'Returned',
}

const KIND_STYLE: Record<Movement['kind'], string> = {
  receive: 'bg-emerald-50 text-emerald-700',
  sale: 'bg-blue-50 text-blue-700',
  adjust: 'bg-amber-50 text-amber-700',
  return: 'bg-slate-100 text-slate-600',
}

function fmtQty(n: number) {
  return Number.isInteger(Number(n)) ? String(Number(n)) : Number(n).toFixed(2)
}

function fmtDate(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function InventoryPage() {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const { role, loading: roleLoading } = useRole()

  const [products, setProducts] = useState<Product[]>([])
  const [movements, setMovements] = useState<Record<string, Movement[]>>({})
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [pageError, setPageError] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [onlyTracked, setOnlyTracked] = useState(true)

  // Receive / adjust form state, keyed to whichever product is open
  const [qtyInput, setQtyInput] = useState('')
  const [noteInput, setNoteInput] = useState('')

  useEffect(() => {
    if (!roleLoading && role !== null && !can(role, 'canViewReports')) {
      router.push(role === 'driver' ? '/driver' : '/dispatch')
    }
  }, [roleLoading, role])

  async function loadProducts() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    const { data, error } = await supabase
      .from('price_book')
      .select('id,name,unit,price,track_stock,stock_qty,low_stock_at')
      .eq('kind', 'product')
      .is('customer_id', null)
      .order('name')
    if (error) { setPageError(error.message); setLoading(false); return }
    setProducts((data as Product[]) || [])
    setLoading(false)
  }

  useEffect(() => { void loadProducts() }, [])

  async function toggleExpand(p: Product) {
    if (expandedId === p.id) { setExpandedId(null); return }
    setExpandedId(p.id)
    setQtyInput('')
    setNoteInput('')
    if (movements[p.id]) return
    const { data } = await supabase
      .from('stock_movements')
      .select('id,price_book_id,movement_date,kind,quantity,note,created_at')
      .eq('price_book_id', p.id)
      .order('created_at', { ascending: false })
      .limit(50)
    setMovements(m => ({ ...m, [p.id]: (data as Movement[]) || [] }))
  }

  async function refreshMovements(productId: string) {
    const { data } = await supabase
      .from('stock_movements')
      .select('id,price_book_id,movement_date,kind,quantity,note,created_at')
      .eq('price_book_id', productId)
      .order('created_at', { ascending: false })
      .limit(50)
    setMovements(m => ({ ...m, [productId]: (data as Movement[]) || [] }))
  }

  async function setTracking(p: Product, track: boolean) {
    setPageError('')
    setBusyId(p.id)
    const { error } = await supabase
      .from('price_book')
      .update({ track_stock: track, updated_at: new Date().toISOString() })
      .eq('id', p.id)
    setBusyId(null)
    if (error) { setPageError(error.message); return }
    setProducts(cur => cur.map(x => (x.id === p.id ? { ...x, track_stock: track } : x)))
  }

  async function setLowStockAt(p: Product, value: string) {
    const n = value.trim() === '' ? null : Number(value)
    if (n !== null && (Number.isNaN(n) || n < 0)) return
    const { error } = await supabase
      .from('price_book')
      .update({ low_stock_at: n, updated_at: new Date().toISOString() })
      .eq('id', p.id)
    if (error) { setPageError(error.message); return }
    setProducts(cur => cur.map(x => (x.id === p.id ? { ...x, low_stock_at: n } : x)))
  }

  // Stock changes go through the DB function so concurrent tills can't
  // clobber each other's read-modify-write.
  async function applyMovement(p: Product, kind: Movement['kind'], delta: number, note: string) {
    setPageError('')
    setBusyId(p.id)

    const { data: newQty, error } = await supabase.rpc('adjust_stock', {
      p_id: p.id,
      p_delta: delta,
    })
    if (error) { setPageError(error.message); setBusyId(null); return }

    const { data: { user } } = await supabase.auth.getUser()
    const { error: mvError } = await supabase.from('stock_movements').insert([{
      price_book_id: p.id,
      kind,
      quantity: delta,
      note: note.trim() || null,
      created_by: user?.id || null,
    }])
    setBusyId(null)
    if (mvError) { setPageError(mvError.message); return }

    setProducts(cur => cur.map(x => (x.id === p.id ? { ...x, stock_qty: Number(newQty) } : x)))
    await refreshMovements(p.id)
    setQtyInput('')
    setNoteInput('')
  }

  async function correctStock(p: Product) {
    const target = Number(qtyInput)
    if (!qtyInput.trim() || Number.isNaN(target) || target < 0) { setPageError('Enter the counted quantity.'); return }
    const delta = target - Number(p.stock_qty)
    if (delta === 0) { setPageError('That already matches the recorded count.'); return }
    await applyMovement(p, 'adjust', delta, noteInput || 'Stock count correction')
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return products.filter(p => {
      if (onlyTracked && !p.track_stock) return false
      if (q && !(p.name || '').toLowerCase().includes(q)) return false
      return true
    })
  }, [products, search, onlyTracked])

  const lowStock = useMemo(
    () => products.filter(p => p.track_stock && p.low_stock_at != null && Number(p.stock_qty) <= Number(p.low_stock_at)),
    [products]
  )

  const stats = useMemo(() => {
    const tracked = products.filter(p => p.track_stock)
    return {
      tracked: tracked.length,
      units: tracked.reduce((s, p) => s + Number(p.stock_qty || 0), 0),
      value: tracked.reduce((s, p) => s + Number(p.stock_qty || 0) * Number(p.price || 0), 0),
      low: lowStock.length,
    }
  }, [products, lowStock])

  return (
    <AppShell
      title="Inventory"
      subtitle="Stock counts for products sold at the counter"
      actions={
        <>
          <Link
            href="/prices"
            className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 ring-1 ring-slate-200 transition hover:bg-slate-50 hover:text-slate-900"
          >
            <Icon name="price" className="h-4 w-4" />
            <span className="hidden sm:inline">Price Book</span>
          </Link>
          <Link
            href="/receiving"
            className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-white transition hover:opacity-90"
            style={{ background: 'var(--accent)' }}
          >
            <Icon name="truck" className="h-4 w-4" />
            <span className="hidden sm:inline">Stock In</span>
          </Link>
        </>
      }
    >
      <>
        {pageError ? (
          <div className="mb-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{pageError}</div>
        ) : null}

        {/* KPIs */}
        <div className="mb-6 grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-slate-200 ring-1 ring-slate-200 dark:bg-slate-700 lg:grid-cols-4">
          {[
            { label: 'Tracked Products', value: String(stats.tracked), tone: 'text-slate-900' },
            { label: 'Units on Hand', value: fmtQty(stats.units), tone: 'text-slate-900' },
            { label: 'Stock Value', value: `$${stats.value.toFixed(2)}`, tone: 'text-emerald-600' },
            { label: 'Low Stock', value: String(stats.low), tone: stats.low > 0 ? 'text-rose-600' : 'text-slate-900' },
          ].map(k => (
            <div key={k.label} className="bg-white px-5 py-4">
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{k.label}</div>
              <div className={`mt-2 text-xl font-semibold tracking-tight ${k.tone}`}>{k.value}</div>
            </div>
          ))}
        </div>

        {/* Low stock alert */}
        {lowStock.length > 0 && (
          <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
            <p className="text-sm font-semibold text-amber-900">Running low — time to reorder</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {lowStock.map(p => (
                <span key={p.id} className="rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-amber-900 ring-1 ring-amber-200">
                  {p.name} — <strong>{fmtQty(p.stock_qty)}</strong> {p.unit || 'left'}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search products"
            className="w-full max-w-xs rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-slate-400"
          />
          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={onlyTracked}
              onChange={e => setOnlyTracked(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300"
            />
            Only products with stock tracking on
          </label>
        </div>

        {/* Products */}
        <div className="overflow-hidden rounded-xl bg-white ring-1 ring-slate-200">
          {loading ? (
            <div className="p-10 text-center text-sm text-slate-500">Loading inventory…</div>
          ) : filtered.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">
              {products.length === 0 ? (
                <>No products yet — add them in the <Link href="/prices" className="font-semibold underline">Price Book</Link>.</>
              ) : onlyTracked ? (
                <>No products are tracked yet. Untick the filter above and switch tracking on for the ones you stock.</>
              ) : (
                'No products match that search.'
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">Product</th>
                    <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wide text-slate-500">On Hand</th>
                    <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wide text-slate-500">Alert At</th>
                    <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wide text-slate-500">Value</th>
                    <th className="px-4 py-3 text-center text-xs font-bold uppercase tracking-wide text-slate-500">Track</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map(p => {
                    const isLow = p.track_stock && p.low_stock_at != null && Number(p.stock_qty) <= Number(p.low_stock_at)
                    return (
                      <Fragment key={p.id}>
                        <tr
                          onClick={() => void toggleExpand(p)}
                          className="cursor-pointer hover:bg-slate-50/80"
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <span className="text-slate-400">{expandedId === p.id ? '▾' : '▸'}</span>
                              <div>
                                <div className="text-sm font-semibold text-slate-900">{p.name}</div>
                                <div className="text-xs text-slate-500">${Number(p.price).toFixed(2)} per {p.unit || 'each'}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            {p.track_stock ? (
                              <span className={`text-base font-bold ${isLow ? 'text-rose-600' : 'text-slate-900'}`}>
                                {fmtQty(p.stock_qty)}
                              </span>
                            ) : (
                              <span className="text-xs text-slate-400">not tracked</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right whitespace-nowrap" onClick={e => e.stopPropagation()}>
                            {p.track_stock ? (
                              <input
                                defaultValue={p.low_stock_at ?? ''}
                                onBlur={e => void setLowStockAt(p, e.target.value)}
                                inputMode="decimal"
                                placeholder="—"
                                className="w-20 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-right text-sm text-slate-900 outline-none focus:border-slate-400"
                              />
                            ) : (
                              <span className="text-xs text-slate-300">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right text-sm text-slate-700 whitespace-nowrap">
                            {p.track_stock ? `$${(Number(p.stock_qty) * Number(p.price)).toFixed(2)}` : '—'}
                          </td>
                          <td className="px-4 py-3 text-center" onClick={e => e.stopPropagation()}>
                            <button
                              onClick={() => void setTracking(p, !p.track_stock)}
                              disabled={busyId === p.id}
                              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50 ${
                                p.track_stock
                                  ? 'text-white'
                                  : 'text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'
                              }`}
                              style={p.track_stock ? { background: 'var(--accent)' } : undefined}
                            >
                              {p.track_stock ? 'On' : 'Off'}
                            </button>
                          </td>
                        </tr>

                        {expandedId === p.id && (
                          <tr className="bg-slate-50/60">
                            <td colSpan={5} className="px-6 py-5">
                              {!p.track_stock ? (
                                <p className="text-sm text-slate-500">
                                  Switch tracking on to record stock for this product.
                                </p>
                              ) : (
                                <>
                                  <div className="mb-5 flex flex-wrap items-end gap-3">
                                    <div>
                                      <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500">
                                        Counted quantity
                                      </label>
                                      <input
                                        value={qtyInput}
                                        onChange={e => setQtyInput(e.target.value)}
                                        inputMode="decimal"
                                        placeholder="0"
                                        className="w-28 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400"
                                      />
                                    </div>
                                    <div className="min-w-[12rem] flex-1">
                                      <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500">
                                        Note (optional)
                                      </label>
                                      <input
                                        value={noteInput}
                                        onChange={e => setNoteInput(e.target.value)}
                                        placeholder="Reason for the correction…"
                                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-slate-400"
                                      />
                                    </div>
                                    <button
                                      onClick={() => void correctStock(p)}
                                      disabled={busyId === p.id}
                                      className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 ring-1 ring-slate-200 transition hover:bg-white disabled:opacity-50"
                                    >
                                      Set counted total
                                    </button>
                                  </div>

                                  {/* Stock only enters through Stock In, so every unit on hand
                                      traces back to a supplier bill. This panel is for counts. */}
                                  <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                                    <p className="text-xs leading-relaxed text-amber-900">
                                      This corrects the count after a physical stocktake — it does <strong>not</strong> create
                                      a bill or claim {CLIENT_CONFIG.taxLabel}.
                                      <br />
                                      Material arriving from a supplier?{' '}
                                      <Link href="/receiving" className="font-bold underline">
                                        Use Stock In
                                      </Link>{' '}
                                      — it records the expense, the tax, and the stock together.
                                    </p>
                                  </div>

                                  <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                                    Recent movements
                                  </h4>
                                  {!movements[p.id] ? (
                                    <p className="text-xs text-slate-500">Loading…</p>
                                  ) : movements[p.id].length === 0 ? (
                                    <p className="text-xs text-slate-500">Nothing recorded yet.</p>
                                  ) : (
                                    <div className="max-w-2xl divide-y divide-slate-200 rounded-lg bg-white ring-1 ring-slate-200">
                                      {movements[p.id].map(m => (
                                        <div key={m.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                                          <div className="flex items-center gap-3">
                                            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${KIND_STYLE[m.kind]}`}>
                                              {KIND_LABEL[m.kind]}
                                            </span>
                                            <span className="text-xs text-slate-500">{fmtDate(m.movement_date)}</span>
                                            {m.note && <span className="text-xs text-slate-400">{m.note}</span>}
                                          </div>
                                          <span
                                            className={`text-sm font-bold ${
                                              Number(m.quantity) >= 0 ? 'text-emerald-600' : 'text-rose-600'
                                            }`}
                                          >
                                            {Number(m.quantity) >= 0 ? '+' : ''}{fmtQty(m.quantity)}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <p className="mt-6 text-xs leading-relaxed text-slate-500">
          Counter sales reduce stock automatically for tracked products. Everything is logged, so you can always
          see why a number changed.
        </p>
      </>
    </AppShell>
  )
}
