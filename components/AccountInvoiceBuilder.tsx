'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { CLIENT_CONFIG } from '@/lib/client-config'
import Icon from '@/components/Icon'
import { printInvoiceDocument, type PrintLine } from '@/lib/invoice-print'
import {
  loadAccountBilling,
  buildInvoiceLines,
  computeInvoiceTotals,
  computeGrandTotal,
  fmtBinSize,
  fmtMoney,
  type AccountBilling,
  type ManualLine,
} from '@/lib/billing'

type Customer = { id: string; name: string | null }

const BULK_UNITS = ['yard', 'yards', 'yd', 'cubic yard', 'tonne', 'ton', 'load', 'm3', 'hour']
const isBulkUnit = (u: string | null | undefined) => BULK_UNITS.includes((u || '').toLowerCase().trim())

function fmtDate(d: string) {
  if (!d) return '—'
  return new Date(d + 'T12:00:00').toLocaleDateString('en-CA', {
    year: 'numeric', month: 'short', day: 'numeric',
  })
}

/**
 * Builds one account invoice for one customer over one period.
 *
 * The flow is deliberately draft-first: generate the priced preview, let the
 * customer see exactly what they owe, then issue it. Nothing counts as revenue
 * or tax until it leaves draft.
 */
export default function AccountInvoiceBuilder({ customers }: { customers: Customer[] }) {
  const supabase = createClient()

  const [customerId, setCustomerId] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const [loading, setLoading] = useState(false)
  const [hasRun, setHasRun] = useState(false)
  const [billing, setBilling] = useState<AccountBilling | null>(null)
  const [manualLines, setManualLines] = useState<ManualLine[]>([])
  const [showEvidence, setShowEvidence] = useState(false)

  const [saving, setSaving] = useState(false)
  const [pageError, setPageError] = useState('')
  const [created, setCreated] = useState<{ number: string; status: string } | null>(null)

  const customerName = customers.find(c => c.id === customerId)?.name || ''

  const invoiceLines = useMemo(
    () => (billing ? buildInvoiceLines(billing.cycles, billing.prices) : []),
    [billing]
  )
  const serviceTotals = useMemo(() => computeInvoiceTotals(invoiceLines), [invoiceLines])

  const materialLines = billing?.materialLines ?? []
  const materialSubtotal = useMemo(
    () => materialLines.reduce((s, l) => s + (l.amount ?? 0), 0),
    [materialLines]
  )
  const manualSubtotal = useMemo(
    () => manualLines.reduce((s, l) => s + l.quantity * l.rate, 0),
    [manualLines]
  )

  const grand = useMemo(
    () => computeGrandTotal({
      serviceSubtotal: serviceTotals.subtotal,
      materialSubtotal,
      manualSubtotal,
    }),
    [serviceTotals.subtotal, materialSubtotal, manualSubtotal]
  )

  const missingCount =
    serviceTotals.missingCount + materialLines.filter(l => l.rate == null).length

  const hasAnything = invoiceLines.length > 0 || materialLines.length > 0 || manualLines.length > 0
  const hasBillable = grand.subtotal > 0

  /** Everything that will actually be written, in document order. */
  const printLines: PrintLine[] = useMemo(() => [
    ...invoiceLines
      .filter(l => l.rate != null && l.amount != null)
      .map(l => ({
        description: `${l.order_type} — ${fmtBinSize(l.bin_size)}`,
        unit: null,
        quantity: l.count,
        rate: l.rate as number,
        amount: l.amount as number,
      })),
    ...materialLines
      .filter(m => m.rate != null && m.amount != null)
      .map(m => ({
        description: m.description,
        unit: m.unit,
        quantity: m.quantity,
        rate: m.rate as number,
        amount: m.amount as number,
      })),
    ...manualLines.map(l => ({
      description: l.description,
      unit: l.unit,
      quantity: l.quantity,
      rate: l.rate,
      amount: l.quantity * l.rate,
    })),
  ], [invoiceLines, materialLines, manualLines])

  async function runPreview() {
    if (!customerId || !dateFrom || !dateTo) return
    setLoading(true)
    setPageError('')
    setCreated(null)
    try {
      const result = await loadAccountBilling(supabase, customerId, dateFrom, dateTo)
      setBilling(result)
      setHasRun(true)
    } catch (error: unknown) {
      setPageError(error instanceof Error ? error.message : 'Could not load this customer’s unbilled work.')
    } finally {
      setLoading(false)
    }
  }

  function clearAll() {
    setBilling(null)
    setManualLines([])
    setHasRun(false)
    setCreated(null)
    setPageError('')
    setShowEvidence(false)
  }

  function addManualLine() {
    setManualLines(cur => [...cur, {
      key: `m-${cur.length}-${cur.reduce((s, l) => s + l.description.length, 0)}`,
      description: '',
      unit: null,
      quantity: 1,
      rate: 0,
    }])
  }

  function patchManualLine(key: string, patch: Partial<ManualLine>) {
    setManualLines(cur => cur.map(l => (l.key === key ? { ...l, ...patch } : l)))
  }

  /** Prints what the customer owes before anything is committed. */
  function printPreview() {
    printInvoiceDocument({
      kind: 'Invoice',
      number: 'PREVIEW',
      dateLabel: `${fmtDate(dateFrom)} – ${fmtDate(dateTo)}`,
      customer: customerName || 'Customer',
      status: 'Preview',
      notes: `Preview of unbilled work — not yet invoiced.`,
      lines: printLines,
      subtotal: grand.subtotal,
      taxAmount: grand.tax,
      total: grand.total,
      footerNote: 'This is a preview, not an invoice. No payment is due yet.',
    })
  }

  /**
   * Writes the invoice and marks every order it settles. `draft` leaves it out
   * of the tax return and the QuickBooks export until it is issued.
   */
  async function saveInvoice(status: 'draft' | 'sent') {
    setPageError('')

    const manualInvalid = manualLines.find(l => !l.description.trim())
    if (manualInvalid) {
      setPageError('Every added line needs a description.')
      return
    }
    const fractional = manualLines.find(l => !isBulkUnit(l.unit) && !Number.isInteger(l.quantity))
    if (fractional) {
      setPageError(`${fractional.description} is sold by the ${fractional.unit || 'unit'} — use a whole number.`)
      return
    }
    if (printLines.length === 0) {
      setPageError('Nothing priced to invoice — set the missing rates first, or add a line by hand.')
      return
    }

    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()

    const { data: invoice, error } = await supabase
      .from('invoices')
      .insert([{
        kind: 'account',
        customer_id: customerId || null,
        customer_name: customerName,
        subtotal: Number(grand.subtotal.toFixed(2)),
        tax_rate: CLIENT_CONFIG.taxRate,
        tax_amount: Number(grand.tax.toFixed(2)),
        total: Number(grand.total.toFixed(2)),
        status,
        notes: `Billing period ${dateFrom} to ${dateTo}`,
        created_by: user?.id || null,
      }])
      .select('id,invoice_number')
      .single()

    if (error || !invoice) {
      setPageError(error?.message || 'Could not create the invoice.')
      setSaving(false)
      return
    }

    const inv = invoice as { id: string; invoice_number: string }

    const { error: itemsError } = await supabase.from('invoice_items').insert(
      printLines.map(l => ({
        invoice_id: inv.id,
        description: l.description,
        unit: l.unit ?? null,
        quantity: l.quantity,
        rate: Number(l.rate.toFixed(2)),
        amount: Number(l.amount.toFixed(2)),
      }))
    )

    if (itemsError) {
      setPageError(
        `Invoice ${inv.invoice_number} was created but its lines failed to save (${itemsError.message}). ` +
        `Void it in the register before trying again.`
      )
      setSaving(false)
      return
    }

    // Mark the orders as billed. Without this the next run bills them again.
    const ids = billing?.billedOrderIds ?? []
    if (ids.length > 0) {
      const { error: stampError } = await supabase
        .from('order')
        .update({ invoice_id: inv.id })
        .in('id', ids)

      if (stampError) {
        setPageError(
          `Invoice ${inv.invoice_number} was created, but the orders it covers could not be marked as billed ` +
          `(${stampError.message}). Re-running this period would bill them twice — void ${inv.invoice_number} and retry.`
        )
        setSaving(false)
        return
      }
    }

    setCreated({ number: inv.invoice_number, status })
    setSaving(false)
  }

  const canRun = Boolean(customerId && dateFrom && dateTo)

  return (
    <div className="space-y-6">
      {/* ── Period picker ──────────────────────────────────────────── */}
      <div className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
        <div className="grid gap-3 md:grid-cols-4">
          <div className="md:col-span-2">
            <label className="mb-1.5 block text-xs font-semibold text-slate-600">Customer</label>
            <select
              value={customerId}
              onChange={e => { setCustomerId(e.target.value); clearAll() }}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400"
            >
              <option value="">Select a customer</option>
              {customers.map(c => (
                <option key={c.id} value={c.id}>{c.name || 'Unnamed'}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-600">From</label>
            <input
              type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-600">To</label>
            <input
              type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400"
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            onClick={() => void runPreview()}
            disabled={!canRun || loading}
            className="rounded-lg px-3 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40"
            style={{ background: 'var(--accent)' }}
          >
            {loading ? 'Loading…' : 'Show unbilled work'}
          </button>
          {hasRun && (
            <button
              onClick={clearAll}
              className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
            >
              Clear
            </button>
          )}
        </div>

        <p className="mt-3 text-xs text-slate-500">
          Only work that has never been invoiced appears here — prepaid orders and anything already
          on an invoice are left out.
        </p>
      </div>

      {pageError && (
        <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-rose-200">
          {pageError}
        </div>
      )}

      {created && (
        <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800 ring-1 ring-emerald-200">
          Invoice <strong>{created.number}</strong> saved as{' '}
          <strong>{created.status === 'draft' ? 'a draft' : 'issued'}</strong> for {customerName} —{' '}
          {fmtMoney(grand.total)} including {CLIENT_CONFIG.taxLabel}.
          {created.status === 'draft' && ' It is not counted as revenue or tax until you issue it.'}{' '}
          <Link href="/invoices?tab=register" className="font-bold underline">Open the register →</Link>
        </div>
      )}

      {hasRun && !loading && !hasAnything && (
        <div className="rounded-2xl bg-white p-10 text-center ring-1 ring-slate-200">
          <p className="text-sm font-semibold text-slate-900">Nothing left to bill for this period.</p>
          <p className="mt-1 text-sm text-slate-500">
            Every order in this range is either prepaid or already on an invoice.
          </p>
        </div>
      )}

      {hasRun && !loading && hasAnything && (
        <>
          {billing?.historyTruncated && (
            <div className="rounded-xl bg-amber-50 px-4 py-3 text-xs text-amber-800 ring-1 ring-amber-200">
              This customer has more history than the report reads in one pass — the
              &ldquo;days on site&rdquo; figures below may be understated. The billed amounts are unaffected.
            </div>
          )}

          {missingCount > 0 && (
            <div className="rounded-xl bg-rose-50 px-4 py-3 text-xs text-rose-700 ring-1 ring-rose-200">
              <strong>{missingCount} line{missingCount === 1 ? '' : 's'} have no price set</strong> and are
              excluded from the total.{' '}
              <Link href="/prices" className="font-bold underline">Add the missing rates →</Link>
            </div>
          )}

          {/* ── The bill ─────────────────────────────────────────────── */}
          <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200">
            <div className="border-b border-slate-200 px-5 py-4">
              <h3 className="text-sm font-bold text-slate-900">
                {customerName} · {fmtDate(dateFrom)} – {fmtDate(dateTo)}
              </h3>
              <p className="mt-0.5 text-xs text-slate-500">Rates come from the Price Book</p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px]">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-5 py-2.5 text-left text-xs font-bold uppercase tracking-wide text-slate-500">Description</th>
                    <th className="px-5 py-2.5 text-right text-xs font-bold uppercase tracking-wide text-slate-500">Qty</th>
                    <th className="px-5 py-2.5 text-right text-xs font-bold uppercase tracking-wide text-slate-500">Rate</th>
                    <th className="px-5 py-2.5 text-right text-xs font-bold uppercase tracking-wide text-slate-500">Amount</th>
                    <th className="w-10" />
                  </tr>
                </thead>

                {invoiceLines.length > 0 && (
                  <tbody className="divide-y divide-slate-100">
                    <tr className="bg-slate-50/60">
                      <td colSpan={5} className="px-5 py-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                        Bin service
                      </td>
                    </tr>
                    {invoiceLines.map(l => (
                      <tr key={`${l.order_type}|${l.bin_size}`}>
                        <td className="px-5 py-3 text-sm font-medium text-slate-800">
                          {l.order_type} — {fmtBinSize(l.bin_size)}
                        </td>
                        <td className="px-5 py-3 text-right text-sm text-slate-700">{l.count}</td>
                        <td className="px-5 py-3 text-right text-sm">
                          {l.rate != null
                            ? <span className="text-slate-700">{fmtMoney(l.rate)}</span>
                            : <span className="text-xs font-bold text-rose-600">no price</span>}
                        </td>
                        <td className="px-5 py-3 text-right text-sm font-bold text-slate-900">{fmtMoney(l.amount)}</td>
                        <td />
                      </tr>
                    ))}
                  </tbody>
                )}

                {materialLines.length > 0 && (
                  <tbody className="divide-y divide-slate-100 border-t border-slate-200">
                    <tr className="bg-slate-50/60">
                      <td colSpan={5} className="px-5 py-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                        Material &amp; charges delivered
                      </td>
                    </tr>
                    {materialLines.map((m, i) => (
                      <tr key={`mat-${i}`}>
                        <td className="px-5 py-3 text-sm font-medium text-slate-800">{m.description}</td>
                        <td className="px-5 py-3 text-right text-sm text-slate-700">
                          {m.quantity}{m.unit ? ` ${m.unit}` : ''}
                        </td>
                        <td className="px-5 py-3 text-right text-sm">
                          {m.rate != null
                            ? <span className="text-slate-700">{fmtMoney(m.rate)}</span>
                            : <span className="text-xs font-bold text-rose-600">no price</span>}
                        </td>
                        <td className="px-5 py-3 text-right text-sm font-bold text-slate-900">{fmtMoney(m.amount)}</td>
                        <td />
                      </tr>
                    ))}
                  </tbody>
                )}

                <tbody className="divide-y divide-slate-100 border-t border-slate-200">
                  <tr className="bg-slate-50/60">
                    <td colSpan={5} className="px-5 py-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                      Added by hand
                    </td>
                  </tr>
                  {manualLines.map(l => (
                    <tr key={l.key}>
                      <td className="px-5 py-2">
                        <input
                          value={l.description}
                          onChange={e => patchManualLine(l.key, { description: e.target.value })}
                          placeholder="What are you charging for?"
                          className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-slate-400"
                        />
                      </td>
                      <td className="px-5 py-2">
                        <input
                          value={String(l.quantity)}
                          inputMode="decimal"
                          onChange={e => {
                            const n = Number(e.target.value)
                            patchManualLine(l.key, { quantity: Number.isNaN(n) ? 0 : n })
                          }}
                          className="w-16 rounded-lg border border-slate-200 px-2 py-1.5 text-right text-sm outline-none focus:border-slate-400"
                        />
                      </td>
                      <td className="px-5 py-2">
                        <input
                          value={String(l.rate)}
                          inputMode="decimal"
                          onChange={e => {
                            const n = Number(e.target.value)
                            patchManualLine(l.key, { rate: Number.isNaN(n) ? 0 : n })
                          }}
                          className="w-20 rounded-lg border border-slate-200 px-2 py-1.5 text-right text-sm outline-none focus:border-slate-400"
                        />
                      </td>
                      <td className="px-5 py-2 text-right text-sm font-bold text-slate-900">
                        {fmtMoney(l.quantity * l.rate)}
                      </td>
                      <td className="pr-3 text-right">
                        <button
                          onClick={() => setManualLines(cur => cur.filter(x => x.key !== l.key))}
                          className="rounded px-1.5 text-xs font-bold text-slate-300 hover:text-rose-600"
                          aria-label="Remove line"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                  <tr>
                    <td colSpan={5} className="px-5 py-2.5">
                      <button
                        onClick={addManualLine}
                        className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-semibold text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
                      >
                        <Icon name="plus" className="h-4 w-4" />
                        Add a line
                      </button>
                    </td>
                  </tr>
                </tbody>

                <tfoot className="border-t-2 border-slate-200 bg-slate-50">
                  <tr>
                    <td colSpan={3} className="px-5 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Subtotal</td>
                    <td className="px-5 py-2.5 text-right text-sm font-bold text-slate-900">{fmtMoney(grand.subtotal)}</td>
                    <td />
                  </tr>
                  <tr>
                    <td colSpan={3} className="px-5 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                      {CLIENT_CONFIG.taxLabel} ({CLIENT_CONFIG.taxRate}%)
                    </td>
                    <td className="px-5 py-2.5 text-right text-sm font-bold text-slate-900">{fmtMoney(grand.tax)}</td>
                    <td />
                  </tr>
                  <tr className="border-t border-slate-300">
                    <td colSpan={3} className="px-5 py-3.5 text-right text-sm font-black uppercase tracking-wide text-slate-900">Total due</td>
                    <td className="px-5 py-3.5 text-right text-lg font-black text-emerald-700">{fmtMoney(grand.total)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* ── Actions ──────────────────────────────────────────────── */}
          {!created && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={printPreview}
                disabled={printLines.length === 0}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50 disabled:opacity-40"
              >
                <Icon name="invoice" className="h-4 w-4" />
                Print preview for the customer
              </button>

              <div className="ml-auto flex flex-wrap gap-2">
                <button
                  onClick={() => void saveInvoice('draft')}
                  disabled={saving || !hasBillable}
                  className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50 disabled:opacity-40"
                >
                  {saving ? 'Saving…' : 'Save as draft'}
                </button>
                <button
                  onClick={() => void saveInvoice('sent')}
                  disabled={saving || !hasBillable}
                  className="rounded-lg px-3 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40"
                  style={{ background: 'var(--accent)' }}
                >
                  {saving ? 'Saving…' : 'Issue invoice'}
                </button>
              </div>
            </div>
          )}

          {/* ── The evidence behind the bin lines ────────────────────── */}
          {billing && billing.cycles.length > 0 && (
            <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200">
              <button
                onClick={() => setShowEvidence(v => !v)}
                className="flex w-full items-center justify-between px-5 py-3.5 text-left hover:bg-slate-50"
              >
                <span className="text-sm font-bold text-slate-900">
                  What these {billing.cycles.length} bin charge{billing.cycles.length === 1 ? '' : 's'} came from
                </span>
                <Icon
                  name={showEvidence ? 'arrowLeft' : 'arrowRight'}
                  className="h-4 w-4 text-slate-400"
                />
              </button>

              {showEvidence && (
                <div className="overflow-x-auto border-t border-slate-200">
                  <table className="w-full min-w-[720px]">
                    <thead className="bg-slate-50">
                      <tr>
                        {['Ticket', 'Service', 'Bin', 'Address', 'On site', 'Days', 'Completed'].map(h => (
                          <th key={h} className="px-4 py-2.5 text-left text-xs font-bold uppercase tracking-wide text-slate-500">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {billing.cycles.map(c => (
                        <tr key={c.id}>
                          <td className="px-4 py-2.5 text-sm font-semibold text-slate-900">
                            {c.ticket_number || '—'}
                            {c.parent_ticket && (
                              <div className="text-xs font-normal text-slate-400">↳ {c.parent_ticket}</div>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-sm text-slate-700">{c.order_type}</td>
                          <td className="px-4 py-2.5 text-sm text-slate-700">
                            {c.bin_number || '—'}{c.bin_size ? ` · ${c.bin_size}Y` : ''}
                          </td>
                          <td className="max-w-[220px] truncate px-4 py-2.5 text-sm text-slate-600">{c.address || '—'}</td>
                          <td className="px-4 py-2.5 text-sm text-slate-600">
                            {c.cycle_start_date
                              ? fmtDate(c.cycle_start_date)
                              : <em className="text-slate-400">not found</em>}
                          </td>
                          <td className="px-4 py-2.5 text-sm text-slate-700">
                            {c.days_on_site != null ? `${c.days_on_site}d` : '—'}
                          </td>
                          <td className="px-4 py-2.5 text-sm text-slate-600">{fmtDate(c.cycle_end_date || '')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
