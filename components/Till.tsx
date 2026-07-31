'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import AppShell from '@/components/AppShell'
import Icon from '@/components/Icon'
import { CLIENT_CONFIG } from '@/lib/client-config'
import { printInvoiceDocument } from '@/lib/invoice-print'
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
  track_stock?: boolean
  stock_qty?: number
}

type CartLine = {
  key: string
  description: string
  unit: string | null
  quantity: number
  rate: number
  priceItemId?: string
}

type Customer = { id: string; name: string | null }

type CompletedSale = {
  invoice_number: string
  customer: string
  lines: CartLine[]
  subtotal: number
  tax: number
  total: number
  paymentMethod: string
  issuedAt: string
}

const PAYMENT_METHODS = ['Cash', 'Debit', 'Credit Card', 'Cheque', 'E-transfer', 'On Account'] as const

/**
 * Bulk measures are scooped, so part quantities are normal — half a yard of
 * soil. Everything else is countable: you can't sell half a shovel.
 */
const BULK_UNITS = ['yard', 'yards', 'yd', 'cubic yard', 'tonne', 'ton', 'load', 'm3', 'hour']

function isBulkUnit(unit: string | null | undefined) {
  return BULK_UNITS.includes((unit || '').toLowerCase().trim())
}

function stepFor(unit: string | null | undefined) {
  return isBulkUnit(unit) ? 0.25 : 1
}

function fmtMoney(value: number) {
  return `$${Number(value || 0).toFixed(2)}`
}

function fmtQty(n: number) {
  const v = Number(n)
  if (Number.isInteger(v)) return String(v)
  if (v === 0.25) return '¼'
  if (v === 0.5) return '½'
  if (v === 0.75) return '¾'
  if (v === 1.25) return '1¼'
  if (v === 1.5) return '1½'
  if (v === 1.75) return '1¾'
  return String(v)
}

function itemLabel(item: PriceItem) {
  return item.service_type ? `${item.service_type} — ${item.bin_size}Y` : item.name || 'Unnamed item'
}

function printReceipt(sale: CompletedSale) {
  printInvoiceDocument({
    kind: 'Receipt',
    number: sale.invoice_number,
    dateLabel: sale.issuedAt,
    customer: sale.customer,
    status: sale.paymentMethod === 'On Account' ? 'Due' : 'Paid',
    paymentMethod: sale.paymentMethod,
    lines: sale.lines.map(l => ({
      description: l.description,
      unit: l.unit,
      quantity: l.quantity,
      rate: l.rate,
      amount: l.quantity * l.rate,
    })),
    subtotal: sale.subtotal,
    taxAmount: sale.tax,
    total: sale.total,
    footerNote: sale.paymentMethod === 'On Account' ? 'Charged to account' : 'Paid in full',
  })
}

export default function Till({
  mode,
  title,
  subtitle,
  searchPlaceholder,
  emptyPriceBookHint,
  /** Material deliveries are charged; bin services already include the trip. */
  allowDelivery = false,
  notice,
}: {
  mode: 'products' | 'services'
  title: string
  subtitle: string
  searchPlaceholder: string
  emptyPriceBookHint: string
  allowDelivery?: boolean
  notice?: React.ReactNode
}) {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const { role, loading: roleLoading } = useRole()

  const [priceItems, setPriceItems] = useState<PriceItem[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [pageError, setPageError] = useState('')

  const [cart, setCart] = useState<CartLine[]>([])
  const [search, setSearch] = useState('')

  const [customCustomer, setCustomCustomer] = useState('')
  const [customerId, setCustomerId] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<string>('Cash')
  const [saving, setSaving] = useState(false)
  const [completed, setCompleted] = useState<CompletedSale | null>(null)

  useEffect(() => {
    if (!roleLoading && role !== null && !can(role, 'canViewReports')) {
      router.push(role === 'driver' ? '/driver' : '/dispatch')
    }
  }, [roleLoading, role])

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const [priceRes, custRes] = await Promise.all([
        supabase.from('price_book')
          .select('id,kind,service_type,bin_size,name,unit,price,track_stock,stock_qty')
          .is('customer_id', null),
        supabase.from('customers').select('id,name').order('name'),
      ])
      if (priceRes.error) setPageError(priceRes.error.message)
      setPriceItems((priceRes.data as PriceItem[]) || [])
      setCustomers((custRes.data as Customer[]) || [])
      setLoading(false)
    }
    void load()
  }, [])

  /** Named charges are services with no bin type — delivery fee lives here. */
  const deliveryItem = useMemo(
    () => priceItems.find(i =>
      i.kind === 'service' && !i.service_type && (i.name || '').toLowerCase().includes('delivery')
    ) || null,
    [priceItems]
  )

  const sellable = useMemo(() => {
    if (mode === 'products') {
      return priceItems
        .filter(i => i.kind === 'product')
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    }
    return priceItems
      .filter(i => i.kind === 'service' && i.service_type)
      .sort((a, b) =>
        (a.service_type || '').localeCompare(b.service_type || '') ||
        (Number(a.bin_size) || 0) - (Number(b.bin_size) || 0)
      )
  }, [priceItems, mode])

  // Nothing shows until you type — the search box is the way in
  const matches = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return []
    return sellable.filter(i => itemLabel(i).toLowerCase().includes(q)).slice(0, 8)
  }, [sellable, search])

  const subtotal = useMemo(() => cart.reduce((s, l) => s + l.quantity * l.rate, 0), [cart])
  const tax = useMemo(() => subtotal * (CLIENT_CONFIG.taxRate / 100), [subtotal])
  const total = subtotal + tax
  const deliveryInCart = cart.some(l => l.priceItemId && l.priceItemId === deliveryItem?.id)

  function addItem(item: PriceItem) {
    setPageError('')
    setCart(current => {
      const existing = current.find(l => l.priceItemId === item.id)
      if (existing) {
        const step = stepFor(item.unit)
        return current.map(l =>
          l.priceItemId === item.id ? { ...l, quantity: Number((l.quantity + step).toFixed(2)) } : l
        )
      }
      return [...current, {
        key: `${item.id}-${Date.now()}`,
        description: itemLabel(item),
        unit: item.unit,
        quantity: 1,
        rate: Number(item.price),
        priceItemId: item.id,
      }]
    })
    setSearch('')
  }

  function changeQty(key: string, direction: 1 | -1) {
    setCart(current => current.map(l => {
      if (l.key !== key) return l
      const step = stepFor(l.unit)
      return { ...l, quantity: Math.max(step, Number((l.quantity + direction * step).toFixed(2))) }
    }))
  }

  function setQtyDirect(key: string, raw: string) {
    const n = Number(raw)
    setCart(current => current.map(l => (l.key === key ? { ...l, quantity: Number.isNaN(n) ? 0 : n } : l)))
  }

  function toggleDelivery() {
    if (!deliveryItem) return
    setPageError('')
    setCart(current => {
      if (current.some(l => l.priceItemId === deliveryItem.id)) {
        return current.filter(l => l.priceItemId !== deliveryItem.id)
      }
      return [...current, {
        key: `delivery-${Date.now()}`,
        description: deliveryItem.name || 'Delivery',
        unit: null,
        quantity: 1,
        rate: Number(deliveryItem.price),
        priceItemId: deliveryItem.id,
      }]
    })
  }

  function addCustomLine() {
    setCart(current => [...current, {
      key: `custom-${Date.now()}`, description: '', unit: null, quantity: 1, rate: 0,
    }])
  }

  function updateLine(key: string, patch: Partial<CartLine>) {
    setCart(current => current.map(l => (l.key === key ? { ...l, ...patch } : l)))
  }

  function removeLine(key: string) {
    setCart(current => current.filter(l => l.key !== key))
  }

  function resetSale() {
    setCart([]); setCustomerId(''); setCustomCustomer('')
    setPaymentMethod('Cash'); setSearch(''); setCompleted(null); setPageError('')
  }

  async function completeSale() {
    setPageError('')
    if (cart.length === 0) { setPageError('Add at least one item.'); return }
    if (cart.some(l => !l.description.trim())) { setPageError('Every line needs a description.'); return }
    if (cart.some(l => l.quantity <= 0)) { setPageError('Every line needs a quantity greater than zero.'); return }

    const fractional = cart.find(l => !isBulkUnit(l.unit) && !Number.isInteger(l.quantity))
    if (fractional) {
      setPageError(`${fractional.description} is sold by the ${fractional.unit || 'unit'} — use a whole number.`)
      return
    }

    const chosen = customers.find(c => c.id === customerId)
    const customerLabel = chosen?.name || customCustomer.trim() || 'Walk-in customer'

    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()

    const { data: invoice, error: invoiceError } = await supabase
      .from('invoices')
      .insert([{
        kind: 'counter',
        customer_id: customerId || null,
        customer_name: customerLabel,
        subtotal: Number(subtotal.toFixed(2)),
        tax_rate: CLIENT_CONFIG.taxRate,
        tax_amount: Number(tax.toFixed(2)),
        total: Number(total.toFixed(2)),
        status: paymentMethod === 'On Account' ? 'sent' : 'paid',
        payment_method: paymentMethod,
        created_by: user?.id || null,
      }])
      .select('id,invoice_number,issue_date')
      .single()

    if (invoiceError || !invoice) {
      setPageError(invoiceError?.message || 'Could not save the sale.')
      setSaving(false)
      return
    }

    const inv = invoice as { id: string; invoice_number: string; issue_date: string }
    const { error: itemsError } = await supabase.from('invoice_items').insert(
      cart.map(l => ({
        invoice_id: inv.id,
        description: l.description.trim(),
        unit: l.unit,
        quantity: l.quantity,
        rate: Number(l.rate.toFixed(2)),
        amount: Number((l.quantity * l.rate).toFixed(2)),
      }))
    )

    if (itemsError) {
      setPageError(`Sale ${inv.invoice_number} saved, but the line items failed: ${itemsError.message}`)
      setSaving(false)
      return
    }

    // Stock comes off after the invoice is safe — a stock hiccup must never
    // lose the sale, so failures warn rather than roll anything back.
    const stockLines = cart.filter(l => {
      if (!l.priceItemId) return false
      const item = priceItems.find(p => p.id === l.priceItemId)
      return item?.kind === 'product' && item?.track_stock
    })

    if (stockLines.length > 0) {
      const stockErrors: string[] = []
      for (const line of stockLines) {
        const { error: rpcError } = await supabase.rpc('adjust_stock', {
          p_id: line.priceItemId, p_delta: -line.quantity,
        })
        if (rpcError) { stockErrors.push(line.description); continue }
        await supabase.from('stock_movements').insert([{
          price_book_id: line.priceItemId,
          kind: 'sale',
          quantity: -line.quantity,
          note: inv.invoice_number,
          invoice_id: inv.id,
          created_by: user?.id || null,
        }])
      }
      if (stockErrors.length > 0) {
        setPageError(`Sale ${inv.invoice_number} completed, but stock was not updated for: ${stockErrors.join(', ')}. Correct it in Inventory.`)
      }
    }

    setCompleted({
      invoice_number: inv.invoice_number,
      customer: customerLabel,
      lines: cart,
      subtotal, tax, total, paymentMethod,
      issuedAt: new Date(inv.issue_date + 'T12:00:00').toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' }),
    })
    setSaving(false)
  }

  // ── Completed ───────────────────────────────────────────────────────────────
  if (completed) {
    return (
      <AppShell title={title} subtitle={subtitle} maxWidth="max-w-2xl">
        <div className="rounded-xl bg-white p-8 text-center ring-1 ring-slate-200">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
            <Icon name="check" className="h-8 w-8 text-emerald-600" strokeWidth={2.2} />
          </div>
          <h1 className="text-2xl font-semibold text-slate-900">Charge complete</h1>
          <p className="mt-1 text-sm text-slate-500">
            {completed.invoice_number} · {completed.customer} · {completed.paymentMethod}
          </p>

          <div className="mx-auto mt-6 max-w-xs rounded-xl bg-slate-50 p-5 ring-1 ring-slate-200">
            <div className="flex justify-between text-sm text-slate-600">
              <span>Subtotal</span><span className="font-semibold text-slate-900">{fmtMoney(completed.subtotal)}</span>
            </div>
            <div className="mt-1.5 flex justify-between text-sm text-slate-600">
              <span>{CLIENT_CONFIG.taxLabel} ({CLIENT_CONFIG.taxRate}%)</span>
              <span className="font-semibold text-slate-900">{fmtMoney(completed.tax)}</span>
            </div>
            <div className="mt-3 flex justify-between border-t border-slate-300 pt-3 text-base">
              <span className="font-black text-slate-900">TOTAL</span>
              <span className="font-black text-emerald-700">{fmtMoney(completed.total)}</span>
            </div>
          </div>

          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <button
              onClick={() => printReceipt(completed)}
              className="rounded-lg bg-slate-900 px-6 py-3 text-sm font-bold text-white transition hover:opacity-90"
            >
              Print Receipt
            </button>
            <button
              onClick={resetSale}
              className="rounded-lg px-6 py-3 text-sm font-bold text-white transition hover:opacity-90"
              style={{ background: 'var(--accent)' }}
            >
              New Charge
            </button>
            <Link href="/invoices" className="rounded-lg px-6 py-3 text-sm font-bold text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50">
              View Invoices
            </Link>
          </div>
        </div>
      </AppShell>
    )
  }

  // ── Till ────────────────────────────────────────────────────────────────────
  return (
    <AppShell title={title} subtitle={subtitle} maxWidth="max-w-6xl">
      <>
        {pageError ? (
          <div className="mb-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{pageError}</div>
        ) : null}
        {notice}

        <div className="grid gap-6 lg:grid-cols-5">

          {/* Search */}
          <div className="lg:col-span-3">
            <div className="rounded-xl bg-white p-5 ring-1 ring-slate-200">
              {loading ? (
                <p className="py-6 text-center text-sm text-slate-500">Loading price book…</p>
              ) : sellable.length === 0 ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  {emptyPriceBookHint} <Link href="/prices" className="font-bold underline">Price Book →</Link>
                </div>
              ) : (
                <>
                  <div className="relative">
                    <svg
                      className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400"
                      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                    </svg>
                    <input
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      placeholder={searchPlaceholder}
                      autoFocus
                      className="w-full rounded-xl border border-slate-200 bg-white py-4 pl-12 pr-4 text-base text-slate-900 outline-none placeholder:text-slate-400 focus:border-[var(--accent)]"
                    />
                  </div>

                  {search.trim() === '' ? (
                    <p className="py-10 text-center text-sm text-slate-400">
                      Start typing to find what you&apos;re charging for.
                    </p>
                  ) : matches.length === 0 ? (
                    <p className="py-10 text-center text-sm text-slate-500">
                      Nothing matches &ldquo;{search.trim()}&rdquo;.
                    </p>
                  ) : (
                    <ul className="mt-3 divide-y divide-slate-100 overflow-hidden rounded-lg ring-1 ring-slate-200">
                      {matches.map(item => {
                        const tracked = item.kind === 'product' && item.track_stock
                        const stock = Number(item.stock_qty || 0)
                        return (
                          <li key={item.id}>
                            <button
                              onClick={() => addItem(item)}
                              className="flex w-full items-center justify-between gap-4 bg-white px-4 py-3.5 text-left transition hover:bg-[var(--accent-soft)]"
                            >
                              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900">
                                {itemLabel(item)}
                              </span>
                              <span className="shrink-0 text-sm font-semibold text-slate-700">
                                {fmtMoney(item.price)}{item.unit ? ` / ${item.unit}` : ''}
                              </span>
                              {tracked && (
                                <span
                                  className={`w-14 shrink-0 rounded-md px-2 py-1 text-center text-sm font-bold ${
                                    stock <= 0 ? 'bg-rose-50 text-rose-600' : 'bg-slate-100 text-slate-700'
                                  }`}
                                >
                                  {fmtQty(stock)}
                                </span>
                              )}
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </>
              )}

              <button
                onClick={addCustomLine}
                className="mt-4 text-xs font-semibold text-slate-500 underline hover:text-slate-800"
              >
                + Add a custom line (not in the price book)
              </button>
            </div>
          </div>

          {/* Ticket */}
          <div className="space-y-4 lg:col-span-2">
            <div className="overflow-hidden rounded-xl bg-white ring-1 ring-slate-200">
              <div className="border-b border-slate-200 px-5 py-3.5">
                <h2 className="text-base font-semibold text-slate-900">This charge</h2>
              </div>
              {cart.length === 0 ? (
                <p className="px-5 py-10 text-center text-sm text-slate-500">Nothing added yet.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {cart.map(l => {
                    const bulk = isBulkUnit(l.unit)
                    return (
                      <li key={l.key} className="px-5 py-3">
                        <div className="flex items-start justify-between gap-2">
                          {l.priceItemId ? (
                            <span className="min-w-0 flex-1 text-sm font-semibold text-slate-900">{l.description}</span>
                          ) : (
                            <input
                              value={l.description}
                              onChange={e => updateLine(l.key, { description: e.target.value })}
                              placeholder="Description"
                              className="min-w-0 flex-1 rounded border border-slate-200 px-2 py-1 text-sm font-semibold text-slate-900 outline-none placeholder:font-normal placeholder:text-slate-400 focus:border-slate-400"
                            />
                          )}
                          <button
                            onClick={() => removeLine(l.key)}
                            className="shrink-0 rounded px-1.5 text-xs font-bold text-slate-300 hover:text-rose-600"
                          >
                            ✕
                          </button>
                        </div>

                        <div className="mt-2 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => changeQty(l.key, -1)}
                              className="flex h-7 w-7 items-center justify-center rounded-lg text-sm font-bold text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
                            >
                              −
                            </button>
                            <input
                              value={String(l.quantity)}
                              onChange={e => setQtyDirect(l.key, e.target.value)}
                              inputMode="decimal"
                              className="w-14 rounded-lg border border-slate-200 px-1 py-1 text-center text-sm text-slate-900 outline-none focus:border-slate-400"
                            />
                            <button
                              onClick={() => changeQty(l.key, 1)}
                              className="flex h-7 w-7 items-center justify-center rounded-lg text-sm font-bold text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
                            >
                              +
                            </button>
                            {l.unit && <span className="ml-1 text-xs text-slate-400">{l.unit}</span>}
                          </div>

                          <div className="flex items-center gap-2">
                            <input
                              value={String(l.rate)}
                              onChange={e => updateLine(l.key, { rate: Number(e.target.value) || 0 })}
                              inputMode="decimal"
                              className="w-20 rounded-lg border border-slate-200 px-2 py-1 text-right text-sm text-slate-900 outline-none focus:border-slate-400"
                            />
                            <span className="w-20 text-right text-sm font-black text-slate-900">
                              {fmtMoney(l.quantity * l.rate)}
                            </span>
                          </div>
                        </div>

                        {!bulk && !Number.isInteger(l.quantity) && (
                          <p className="mt-1.5 text-xs font-medium text-rose-600">
                            Sold by the {l.unit || 'unit'} — whole numbers only.
                          </p>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>

            {allowDelivery && (
              <div className="rounded-xl bg-white p-5 ring-1 ring-slate-200">
                <h2 className="mb-1 text-base font-semibold text-slate-900">Delivery</h2>
                {deliveryItem ? (
                  <>
                    <p className="mb-3 text-xs text-slate-500">Set in the Price Book under Other Charges.</p>
                    <button
                      onClick={toggleDelivery}
                      className={`w-full rounded-lg px-4 py-3 text-sm font-semibold transition ${
                        deliveryInCart ? 'text-white' : 'text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50'
                      }`}
                      style={deliveryInCart ? { background: 'var(--accent)' } : undefined}
                    >
                      {deliveryInCart
                        ? `✓ Delivery added — ${fmtMoney(deliveryItem.price)}`
                        : `Add delivery — ${fmtMoney(deliveryItem.price)}`}
                    </button>
                  </>
                ) : (
                  <p className="text-xs leading-relaxed text-slate-500">
                    No delivery charge set up. Add one called <strong>Delivery</strong> under{' '}
                    <Link href="/prices" className="font-semibold underline">Other Charges</Link> in the Price Book.
                  </p>
                )}
              </div>
            )}

            <div className="rounded-xl bg-white p-5 ring-1 ring-slate-200">
              <h2 className="mb-3 text-base font-semibold text-slate-900">Customer</h2>
              <select
                value={customerId}
                onChange={(e) => { setCustomerId(e.target.value); if (e.target.value) setCustomCustomer('') }}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-400"
              >
                <option value="">Walk-in (no account)</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              {!customerId && (
                <input
                  value={customCustomer}
                  onChange={(e) => setCustomCustomer(e.target.value)}
                  placeholder="Name on receipt (optional)"
                  className="mt-3 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-slate-400"
                />
              )}
            </div>

            <div className="rounded-xl bg-white p-5 ring-1 ring-slate-200">
              <h2 className="mb-3 text-base font-semibold text-slate-900">Payment</h2>
              <div className="grid grid-cols-2 gap-2">
                {PAYMENT_METHODS.map(m => (
                  <button
                    key={m}
                    onClick={() => setPaymentMethod(m)}
                    className={`rounded-lg px-3 py-2.5 text-xs font-bold transition ${
                      paymentMethod === m ? 'text-white' : 'text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50'
                    }`}
                    style={paymentMethod === m ? { background: 'var(--accent)' } : undefined}
                  >
                    {m}
                  </button>
                ))}
              </div>
              {paymentMethod === 'On Account' && (
                <p className="mt-3 text-xs text-amber-700">Saved as unpaid — shows as outstanding on the account.</p>
              )}
            </div>

            <div className="rounded-xl bg-white p-5 ring-1 ring-slate-200">
              <div className="flex justify-between text-sm text-slate-600">
                <span>Subtotal</span><span className="font-semibold text-slate-900">{fmtMoney(subtotal)}</span>
              </div>
              <div className="mt-2 flex justify-between text-sm text-slate-600">
                <span>{CLIENT_CONFIG.taxLabel} ({CLIENT_CONFIG.taxRate}%)</span>
                <span className="font-semibold text-slate-900">{fmtMoney(tax)}</span>
              </div>
              <div className="mt-4 flex justify-between border-t border-slate-300 pt-4">
                <span className="text-base font-black text-slate-900">TOTAL</span>
                <span className="text-2xl font-black text-emerald-700">{fmtMoney(total)}</span>
              </div>
              <button
                onClick={() => void completeSale()}
                disabled={saving || cart.length === 0}
                className="mt-5 w-full rounded-lg px-6 py-4 text-base font-black text-white transition hover:opacity-90 disabled:opacity-40"
                style={{ background: 'var(--accent)' }}
              >
                {saving ? 'Saving…' : 'Complete'}
              </button>
              {cart.length > 0 && (
                <button
                  onClick={resetSale}
                  className="mt-2 w-full rounded-lg px-6 py-2.5 text-sm font-medium text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        </div>
      </>
    </AppShell>
  )
}
