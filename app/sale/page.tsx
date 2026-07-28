'use client'

export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import AppShell from '@/components/AppShell'
import { CLIENT_CONFIG } from '@/lib/client-config'
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
}

type CartLine = {
  key: string
  description: string
  unit: string | null
  quantity: number
  rate: number
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

function fmtMoney(value: number) {
  return `$${value.toFixed(2)}`
}

function priceItemLabel(item: PriceItem) {
  return item.kind === 'service'
    ? `${item.service_type} — ${item.bin_size}Y`
    : item.name || 'Unnamed item'
}

function printReceipt(sale: CompletedSale) {
  const win = window.open('', '_blank')
  if (!win) return
  const rows = sale.lines.map(l => `<tr>
    <td>${l.description}${l.unit ? ` <span style="color:#94a3b8">(per ${l.unit})</span>` : ''}</td>
    <td style="text-align:right">${l.quantity}</td>
    <td style="text-align:right">${fmtMoney(l.rate)}</td>
    <td style="text-align:right"><strong>${fmtMoney(l.quantity * l.rate)}</strong></td>
  </tr>`).join('')

  win.document.write(`<html><head><title>${sale.invoice_number}</title>
  <style>
    body{font-family:Arial,sans-serif;font-size:12px;padding:24px;color:#1e293b;max-width:520px}
    h1{font-size:18px;margin:0 0 2px}
    .meta{font-size:12px;color:#475569;margin:14px 0 18px;padding:10px 14px;background:#f8fafc;border-radius:6px}
    table{width:100%;border-collapse:collapse;margin-bottom:8px}
    th{background:#f1f5f9;text-align:left;padding:6px 10px;font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:#64748b}
    td{padding:6px 10px;border-bottom:1px solid #f1f5f9;font-size:11px}
    .totals td{border:none;padding:4px 10px}
    .grand td{border-top:2px solid #e2e8f0;font-size:14px;padding-top:8px}
    .footer{margin-top:24px;padding-top:10px;border-top:1px solid #e2e8f0;color:#94a3b8;font-size:10px;text-align:center}
    @media print{body{padding:0}}
  </style></head><body>
  <h1>${CLIENT_CONFIG.name}</h1>
  <div style="font-size:16px;font-weight:bold;margin-top:6px">${sale.invoice_number}</div>
  <div class="meta">
    Customer: <strong>${sale.customer}</strong><br/>
    Date: ${sale.issuedAt}<br/>
    Payment: <strong>${sale.paymentMethod}</strong>
  </div>
  <table>
    <thead><tr><th>Item</th><th style="text-align:right">Qty</th><th style="text-align:right">Rate</th><th style="text-align:right">Amount</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <table class="totals">
    <tr><td style="text-align:right">Subtotal</td><td style="text-align:right;width:110px"><strong>${fmtMoney(sale.subtotal)}</strong></td></tr>
    <tr><td style="text-align:right">${CLIENT_CONFIG.taxLabel} (${CLIENT_CONFIG.taxRate}%)</td><td style="text-align:right"><strong>${fmtMoney(sale.tax)}</strong></td></tr>
    <tr class="grand"><td style="text-align:right"><strong>TOTAL</strong></td><td style="text-align:right"><strong>${fmtMoney(sale.total)}</strong></td></tr>
  </table>
  <div class="footer">Thank you — ${CLIENT_CONFIG.name}</div>
  </body></html>`)
  win.document.close()
  win.print()
}

export default function QuickSalePage() {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const { role, loading: roleLoading } = useRole()

  const [priceItems, setPriceItems] = useState<PriceItem[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [pageError, setPageError] = useState('')

  const [cart, setCart] = useState<CartLine[]>([])
  const [selectedItemId, setSelectedItemId] = useState('')
  const [qty, setQty] = useState('1')

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
          .select('id,kind,service_type,bin_size,name,unit,price')
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

  const products = useMemo(
    () => priceItems.filter(i => i.kind === 'product').sort((a, b) => (a.name || '').localeCompare(b.name || '')),
    [priceItems]
  )
  const services = useMemo(
    () => priceItems.filter(i => i.kind === 'service').sort((a, b) =>
      (a.service_type || '').localeCompare(b.service_type || '') || (Number(a.bin_size) || 0) - (Number(b.bin_size) || 0)
    ),
    [priceItems]
  )

  const subtotal = useMemo(() => cart.reduce((s, l) => s + l.quantity * l.rate, 0), [cart])
  const tax = useMemo(() => subtotal * (CLIENT_CONFIG.taxRate / 100), [subtotal])
  const total = subtotal + tax

  function addSelectedItem() {
    setPageError('')
    const item = priceItems.find(i => i.id === selectedItemId)
    if (!item) { setPageError('Pick an item to add.'); return }
    const quantity = Number(qty)
    if (!qty.trim() || Number.isNaN(quantity) || quantity <= 0) {
      setPageError('Enter a quantity greater than zero.')
      return
    }
    setCart(current => [...current, {
      key: `${item.id}-${Date.now()}`,
      description: priceItemLabel(item),
      unit: item.unit,
      quantity,
      rate: Number(item.price),
    }])
    setQty('1')
    setSelectedItemId('')
  }

  function addCustomLine() {
    setCart(current => [...current, {
      key: `custom-${Date.now()}`,
      description: '',
      unit: null,
      quantity: 1,
      rate: 0,
    }])
  }

  function updateLine(key: string, patch: Partial<CartLine>) {
    setCart(current => current.map(l => (l.key === key ? { ...l, ...patch } : l)))
  }

  function removeLine(key: string) {
    setCart(current => current.filter(l => l.key !== key))
  }

  function resetSale() {
    setCart([])
    setCustomerId('')
    setCustomCustomer('')
    setPaymentMethod('Cash')
    setCompleted(null)
    setPageError('')
  }

  async function completeSale() {
    setPageError('')
    if (cart.length === 0) { setPageError('Add at least one item to the sale.'); return }
    if (cart.some(l => !l.description.trim())) { setPageError('Every line needs a description.'); return }
    if (cart.some(l => l.quantity <= 0)) { setPageError('Every line needs a quantity greater than zero.'); return }

    const chosenCustomer = customers.find(c => c.id === customerId)
    const customerLabel = chosenCustomer?.name || customCustomer.trim() || 'Walk-in customer'

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

    setCompleted({
      invoice_number: inv.invoice_number,
      customer: customerLabel,
      lines: cart,
      subtotal,
      tax,
      total,
      paymentMethod,
      issuedAt: new Date(inv.issue_date + 'T12:00:00').toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' }),
    })
    setSaving(false)
  }

  // ── Completed view ──────────────────────────────────────────────────────────
  if (completed) {
    return (
      <AppShell title="Quick Sale" subtitle="Counter sales — materials, products, and services" maxWidth="max-w-2xl">
        <div className="rounded-xl bg-white p-8 text-center ring-1 ring-slate-200">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
              <svg className="h-8 w-8 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-slate-900">Sale complete</h1>
            <p className="mt-1 text-sm text-slate-500">
              {completed.invoice_number} · {completed.customer} · {completed.paymentMethod}
            </p>
            <div className="mx-auto mt-6 max-w-xs rounded-2xl bg-slate-50 p-5 ring-1 ring-slate-200">
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
                className="rounded-2xl bg-slate-900 px-6 py-3 text-sm font-bold text-white transition hover:opacity-90"
              >
                Print Receipt
              </button>
              <button
                onClick={resetSale}
                className="rounded-2xl bg-emerald-600 px-6 py-3 text-sm font-bold text-white transition hover:bg-emerald-500"
              >
                New Sale
              </button>
              <Link
                href="/invoices"
                className="rounded-2xl border border-slate-300 bg-white px-6 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50"
              >
                View Invoices
              </Link>
            </div>
        </div>
      </AppShell>
    )
  }

  // ── Sale entry ──────────────────────────────────────────────────────────────
  return (
    <AppShell
      title="Quick Sale"
      subtitle="Counter sales — materials, products, and services"
      maxWidth="max-w-6xl"
    >
      <>
        {pageError ? (
          <div className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {pageError}
          </div>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-3">

          {/* ── Left: item entry + cart ─────────────────────────────────── */}
          <div className="space-y-6 lg:col-span-2">

            <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
              <h2 className="mb-4 text-base font-bold text-slate-900">Add Items</h2>
              {loading ? (
                <p className="text-sm text-slate-500">Loading price book…</p>
              ) : priceItems.length === 0 ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  No prices yet. <Link href="/prices" className="font-bold underline">Set up the Price Book →</Link>
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-[1fr_120px_auto]">
                  <select
                    value={selectedItemId}
                    onChange={(e) => setSelectedItemId(e.target.value)}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-400"
                  >
                    <option value="">Select an item…</option>
                    {products.length > 0 && (
                      <optgroup label="Products & Materials">
                        {products.map(p => (
                          <option key={p.id} value={p.id}>{priceItemLabel(p)} — {fmtMoney(p.price)}/{p.unit}</option>
                        ))}
                      </optgroup>
                    )}
                    {services.length > 0 && (
                      <optgroup label="Bin Services">
                        {services.map(s => (
                          <option key={s.id} value={s.id}>{priceItemLabel(s)} — {fmtMoney(s.price)}</option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                  <input
                    value={qty}
                    onChange={(e) => setQty(e.target.value)}
                    inputMode="decimal"
                    placeholder="Qty"
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-slate-400"
                  />
                  <button
                    onClick={addSelectedItem}
                    className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-bold text-white transition hover:opacity-90"
                  >
                    Add
                  </button>
                </div>
              )}
              <button
                onClick={addCustomLine}
                className="mt-3 text-xs font-semibold text-slate-500 underline hover:text-slate-800"
              >
                + Add a custom line (not in the price book)
              </button>
            </div>

            <div className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-slate-200">
              <div className="border-b border-slate-200 px-6 py-4">
                <h2 className="text-base font-bold text-slate-900">Sale Items</h2>
                <p className="mt-0.5 text-xs text-slate-500">Quantity and rate stay editable — adjust for discounts before completing</p>
              </div>
              {cart.length === 0 ? (
                <div className="p-10 text-center text-sm text-slate-500">No items yet — add the first one above.</div>
              ) : (
                <table className="w-full divide-y divide-slate-200">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">Description</th>
                      <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wide text-slate-500">Qty</th>
                      <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wide text-slate-500">Rate</th>
                      <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wide text-slate-500">Amount</th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {cart.map(line => (
                      <tr key={line.key}>
                        <td className="px-4 py-2.5">
                          <input
                            value={line.description}
                            onChange={(e) => updateLine(line.key, { description: e.target.value })}
                            placeholder="Item description"
                            className="w-full rounded-lg border border-transparent bg-transparent px-2 py-1.5 text-sm font-semibold text-slate-900 outline-none placeholder:font-normal placeholder:text-slate-400 hover:border-slate-200 focus:border-slate-400 focus:bg-white"
                          />
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <input
                            value={String(line.quantity)}
                            onChange={(e) => updateLine(line.key, { quantity: Number(e.target.value) || 0 })}
                            inputMode="decimal"
                            className="w-20 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-right text-sm text-slate-900 outline-none focus:border-slate-400"
                          />
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <input
                            value={String(line.rate)}
                            onChange={(e) => updateLine(line.key, { rate: Number(e.target.value) || 0 })}
                            inputMode="decimal"
                            className="w-24 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-right text-sm text-slate-900 outline-none focus:border-slate-400"
                          />
                        </td>
                        <td className="px-4 py-2.5 text-right text-sm font-black text-slate-900 whitespace-nowrap">
                          {fmtMoney(line.quantity * line.rate)}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <button
                            onClick={() => removeLine(line.key)}
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

          {/* ── Right: customer, payment, totals ────────────────────────── */}
          <div className="space-y-6">

            <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
              <h2 className="mb-4 text-base font-bold text-slate-900">Customer</h2>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Existing customer</label>
              <select
                value={customerId}
                onChange={(e) => { setCustomerId(e.target.value); if (e.target.value) setCustomCustomer('') }}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-400"
              >
                <option value="">Walk-in (no account)</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              {!customerId && (
                <>
                  <label className="mb-1.5 mt-4 block text-xs font-semibold uppercase tracking-wide text-slate-500">Name on receipt (optional)</label>
                  <input
                    value={customCustomer}
                    onChange={(e) => setCustomCustomer(e.target.value)}
                    placeholder="Walk-in customer"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-slate-400"
                  />
                </>
              )}
            </div>

            <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
              <h2 className="mb-4 text-base font-bold text-slate-900">Payment</h2>
              <div className="grid grid-cols-2 gap-2">
                {PAYMENT_METHODS.map(m => (
                  <button
                    key={m}
                    onClick={() => setPaymentMethod(m)}
                    className={`rounded-xl px-3 py-2.5 text-xs font-bold transition ${
                      paymentMethod === m
                        ? 'bg-slate-900 text-white'
                        : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
              {paymentMethod === 'On Account' && (
                <p className="mt-3 text-xs text-amber-700">Saved as unpaid — it will show as outstanding on the customer's account.</p>
              )}
            </div>

            <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
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
                className="mt-5 w-full rounded-2xl bg-emerald-600 px-6 py-4 text-base font-black text-white transition hover:bg-emerald-500 disabled:opacity-40"
              >
                {saving ? 'Saving…' : 'Complete Sale'}
              </button>
              {cart.length > 0 && (
                <button
                  onClick={resetSale}
                  className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-6 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Clear Sale
                </button>
              )}
            </div>
          </div>
        </div>
      </>
    </AppShell>
  )
}
