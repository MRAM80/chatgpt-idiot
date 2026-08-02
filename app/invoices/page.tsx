'use client'

export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Fragment, Suspense, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import AppShell from '@/components/AppShell'
import Icon from '@/components/Icon'
import AccountInvoiceBuilder from '@/components/AccountInvoiceBuilder'
import { CLIENT_CONFIG } from '@/lib/client-config'
import { printInvoiceDocument } from '@/lib/invoice-print'
import { useRole } from '@/hooks/useRole'
import { can } from '@/lib/roles'

type Invoice = {
  id: string
  invoice_number: string
  kind: 'counter' | 'account'
  customer_id: string | null
  customer_name: string | null
  issue_date: string
  subtotal: number
  tax_rate: number
  tax_amount: number
  total: number
  status: 'draft' | 'sent' | 'paid' | 'void'
  payment_method: string | null
  paid_at: string | null
  notes: string | null
}

type InvoiceItem = {
  id: string
  invoice_id: string
  description: string
  unit: string | null
  quantity: number
  rate: number
  amount: number
}

const STATUS_STYLES: Record<string, string> = {
  paid: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  sent: 'border-amber-200 bg-amber-50 text-amber-700',
  draft: 'border-slate-200 bg-slate-100 text-slate-600',
  void: 'border-slate-200 bg-slate-100 text-slate-400 line-through',
}

// An unpaid invoice older than this many days counts as overdue
const OVERDUE_DAYS = 30

function fmtMoney(value: number) {
  return `$${Number(value || 0).toFixed(2)}`
}

function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Date(d + 'T12:00:00').toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })
}

function daysSince(d: string | null) {
  if (!d) return 0
  const then = new Date(d + 'T12:00:00').getTime()
  return Math.floor((Date.now() - then) / (1000 * 60 * 60 * 24))
}

function isOutstanding(inv: Invoice) {
  return inv.status === 'sent' || inv.status === 'draft'
}

function isOverdue(inv: Invoice) {
  return inv.status === 'sent' && daysSince(inv.issue_date) > OVERDUE_DAYS
}

function printInvoiceDoc(inv: Invoice, items: InvoiceItem[]) {
  printInvoiceDocument({
    kind: inv.kind === 'counter' ? 'Receipt' : 'Invoice',
    number: inv.invoice_number,
    dateLabel: fmtDate(inv.issue_date),
    customer: inv.customer_name || '—',
    status: inv.status === 'paid' ? 'Paid' : inv.status === 'void' ? 'Void' : 'Due',
    paymentMethod: inv.payment_method,
    notes: inv.notes,
    lines: items.map(i => ({
      description: i.description,
      unit: i.unit,
      quantity: Number(i.quantity),
      rate: Number(i.rate),
      amount: Number(i.amount),
    })),
    subtotal: Number(inv.subtotal),
    taxAmount: Number(inv.tax_amount),
    total: Number(inv.total),
    footerNote: inv.status === 'paid' ? 'Paid in full' : null,
  })
}

type Tab = 'register' | 'new'

function InvoicesPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = useMemo(() => createClient(), [])
  const { role, loading: roleLoading } = useRole()

  const [tab, setTab] = useState<Tab>(searchParams.get('tab') === 'new' ? 'new' : 'register')
  const [customers, setCustomers] = useState<{ id: string; name: string | null }[]>([])

  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [itemsByInvoice, setItemsByInvoice] = useState<Record<string, InvoiceItem[]>>({})
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [pageError, setPageError] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)

  const [statusFilter, setStatusFilter] = useState('all')
  const [kindFilter, setKindFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  useEffect(() => {
    if (!roleLoading && role !== null && !can(role, 'canViewReports')) {
      router.push(role === 'driver' ? '/driver' : '/dispatch')
    }
  }, [roleLoading, role])

  const BASE_COLUMNS =
    'id,invoice_number,kind,customer_id,customer_name,issue_date,subtotal,tax_rate,tax_amount,total,status,payment_method,notes'

  async function loadInvoices() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    function query(columns: string) {
      return supabase
        .from('invoices')
        .select(columns)
        .order('issue_date', { ascending: false })
        .order('invoice_number', { ascending: false })
        .limit(500)
    }

    let { data, error } = await query(`${BASE_COLUMNS},paid_at`)

    // Survive running ahead of the paid_at migration — without this the whole
    // register goes blank on a project where the column isn't there yet.
    if (error && /paid_at/i.test(error.message)) {
      ;({ data, error } = await query(BASE_COLUMNS))
    }

    if (error) { setPageError(error.message); setLoading(false); return }
    setInvoices((data as unknown as Invoice[]) || [])
    setLoading(false)
  }

  useEffect(() => { void loadInvoices() }, [])

  // Customers for the New Invoice tab — active accounts only
  useEffect(() => {
    async function loadCustomers() {
      const { data } = await supabase
        .from('customers')
        .select('id,name')
        .eq('status', 'active')
        .order('name')
      setCustomers((data as { id: string; name: string | null }[]) || [])
    }
    void loadCustomers()
  }, [supabase])

  function switchTab(next: Tab) {
    setTab(next)
    router.replace(next === 'register' ? '/invoices' : `/invoices?tab=${next}`)
  }

  async function toggleExpand(inv: Invoice) {
    if (expandedId === inv.id) { setExpandedId(null); return }
    setExpandedId(inv.id)
    if (itemsByInvoice[inv.id]) return
    const { data } = await supabase
      .from('invoice_items')
      .select('id,invoice_id,description,unit,quantity,rate,amount')
      .eq('invoice_id', inv.id)
      .order('created_at', { ascending: true })
    setItemsByInvoice(current => ({ ...current, [inv.id]: (data as InvoiceItem[]) || [] }))
  }

  async function fetchItems(invoiceId: string): Promise<InvoiceItem[]> {
    if (itemsByInvoice[invoiceId]) return itemsByInvoice[invoiceId]
    const { data } = await supabase
      .from('invoice_items')
      .select('id,invoice_id,description,unit,quantity,rate,amount')
      .eq('invoice_id', invoiceId)
      .order('created_at', { ascending: true })
    const items = (data as InvoiceItem[]) || []
    setItemsByInvoice(current => ({ ...current, [invoiceId]: items }))
    return items
  }

  /**
   * `paid_at` records when the money actually arrived — the invoice date is
   * when it was billed, which is rarely the same day. Marking anything other
   * than paid clears it, so an un-done payment doesn't leave a stale date.
   */
  async function setStatus(inv: Invoice, status: Invoice['status']) {
    setPageError('')
    setBusyId(inv.id)
    const paidAt = status === 'paid' ? new Date().toISOString().slice(0, 10) : null
    const stamped = new Date().toISOString()

    let { error } = await supabase
      .from('invoices')
      .update({ status, paid_at: paidAt, updated_at: stamped })
      .eq('id', inv.id)

    // `paid_at` ships ahead of its migration. Until that SQL is run the column
    // isn't there, and marking an invoice paid must not fail because of it —
    // the status change is the part that matters.
    const columnMissing = error && /paid_at/i.test(error.message)
    if (columnMissing) {
      ;({ error } = await supabase
        .from('invoices')
        .update({ status, updated_at: stamped })
        .eq('id', inv.id))
    }

    setBusyId(null)
    if (error) { setPageError(error.message); return }
    setInvoices(current => current.map(i => (
      i.id === inv.id ? { ...i, status, paid_at: columnMissing ? i.paid_at : paidAt } : i
    )))
  }

  async function voidInvoice(inv: Invoice) {
    if (!window.confirm(`Void invoice ${inv.invoice_number}? It stays on record but is excluded from totals.`)) return
    await setStatus(inv, 'void')
  }

  /**
   * Restores a voided invoice. It comes back as a draft rather than to its old
   * status — nothing records what that was, and guessing "paid" would invent a
   * payment. Re-mark it from there.
   */
  async function unvoidInvoice(inv: Invoice) {
    if (!window.confirm(`Restore invoice ${inv.invoice_number}? It comes back as a draft and counts toward totals again once issued.`)) return
    await setStatus(inv, 'draft')
  }

  async function printOne(inv: Invoice) {
    const items = await fetchItems(inv.id)
    printInvoiceDoc(inv, items)
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return invoices.filter(inv => {
      if (statusFilter === 'outstanding' ? !isOutstanding(inv) : statusFilter !== 'all' && inv.status !== statusFilter) return false
      if (kindFilter !== 'all' && inv.kind !== kindFilter) return false
      if (dateFrom && inv.issue_date < dateFrom) return false
      if (dateTo && inv.issue_date > dateTo) return false
      if (q) {
        const hay = `${inv.invoice_number} ${inv.customer_name || ''} ${inv.payment_method || ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [invoices, statusFilter, kindFilter, search, dateFrom, dateTo])

  const stats = useMemo(() => {
    const live = filtered.filter(i => i.status !== 'void')
    return {
      invoiced: live.reduce((s, i) => s + Number(i.total || 0), 0),
      paid: live.filter(i => i.status === 'paid').reduce((s, i) => s + Number(i.total || 0), 0),
      outstanding: live.filter(isOutstanding).reduce((s, i) => s + Number(i.total || 0), 0),
      overdueCount: live.filter(isOverdue).length,
      taxCollected: live.reduce((s, i) => s + Number(i.tax_amount || 0), 0),
    }
  }, [filtered])

  // Who owes what — outstanding grouped by customer
  const balances = useMemo(() => {
    const map = new Map<string, number>()
    filtered.filter(i => i.status !== 'void').filter(isOutstanding).forEach(i => {
      const name = i.customer_name || 'Walk-in customer'
      map.set(name, (map.get(name) || 0) + Number(i.total || 0))
    })
    return [...map.entries()].map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount)
  }, [filtered])

  return (
    <AppShell
      title="Invoices"
      subtitle="Every counter sale and account invoice — who paid, who owes"
      actions={
        <Link
          href="/sale"
          className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-white transition hover:opacity-90"
          style={{ background: 'var(--accent)' }}
        >
          <Icon name="plus" className="h-4 w-4" />
          <span className="hidden sm:inline">Quick Sale</span>
        </Link>
      }
    >
      <>
        {/* Tabs — everything about an invoice lives on this one page */}
        <div className="mb-6 flex gap-1 border-b border-slate-200">
          {([
            { id: 'register' as const, label: 'Register', icon: 'invoice' as const },
            { id: 'new' as const, label: 'New Invoice', icon: 'plus' as const },
          ]).map(t => (
            <button
              key={t.id}
              onClick={() => switchTab(t.id)}
              className={`-mb-px inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm transition ${
                tab === t.id
                  ? 'font-semibold text-slate-900'
                  : 'border-transparent font-medium text-slate-500 hover:text-slate-800'
              }`}
              style={tab === t.id ? { borderColor: 'var(--accent)' } : undefined}
            >
              <Icon name={t.icon} className="h-4 w-4" />
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'new' && <AccountInvoiceBuilder customers={customers} />}

        {tab === 'register' && <>
        {/* KPI strip */}
        <div className="mb-6 grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-slate-200 ring-1 ring-slate-200 lg:grid-cols-5">
          {[
            { label: 'Invoiced', value: fmtMoney(stats.invoiced), tone: 'text-slate-900' },
            { label: 'Paid', value: fmtMoney(stats.paid), tone: 'text-emerald-600' },
            { label: 'Outstanding', value: fmtMoney(stats.outstanding), tone: 'text-amber-600' },
            { label: `Overdue (${OVERDUE_DAYS}d+)`, value: String(stats.overdueCount), tone: 'text-rose-600' },
            { label: `${CLIENT_CONFIG.taxLabel} Collected`, value: fmtMoney(stats.taxCollected), tone: 'text-slate-900' },
          ].map(k => (
            <div key={k.label} className="bg-white px-5 py-4">
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{k.label}</div>
              <div className={`mt-2 text-xl font-semibold tracking-tight ${k.tone}`}>{k.value}</div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="mb-6 grid gap-3 md:grid-cols-5">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search invoice # or customer"
            className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-slate-400"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-400"
          >
            <option value="all">All Statuses</option>
            <option value="outstanding">Outstanding (unpaid)</option>
            <option value="paid">Paid</option>
            <option value="sent">Sent</option>
            <option value="draft">Draft</option>
            <option value="void">Void</option>
          </select>
          <select
            value={kindFilter}
            onChange={(e) => setKindFilter(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-400"
          >
            <option value="all">Counter & Account</option>
            <option value="counter">Counter sales</option>
            <option value="account">Account invoices</option>
          </select>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-400"
          />
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-400"
          />
        </div>

        {pageError ? (
          <div className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{pageError}</div>
        ) : null}

        {/* Outstanding balances by customer */}
        {balances.length > 0 && (
          <div className="mb-6 overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-slate-200">
            <div className="border-b border-slate-200 px-6 py-4">
              <h2 className="text-base font-bold text-slate-900">Who Owes What</h2>
              <p className="mt-0.5 text-xs text-slate-500">Unpaid invoices grouped by customer</p>
            </div>
            <div className="flex flex-wrap gap-3 p-5">
              {balances.map(b => (
                <div key={b.name} className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
                  <div className="text-sm font-bold text-amber-900">{fmtMoney(b.amount)}</div>
                  <div className="mt-0.5 text-xs font-medium text-amber-700">{b.name}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Invoice table */}
        <div className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-slate-200">
          {loading ? (
            <div className="p-10 text-center text-sm text-slate-500">Loading invoices…</div>
          ) : filtered.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">
              {invoices.length === 0
                ? <>No invoices yet — ring one up in <Link href="/sale" className="font-bold underline">Quick Sale</Link>.</>
                : 'No invoices match the selected filters.'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">Invoice</th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">Customer</th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">Type</th>
                    <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wide text-slate-500">{CLIENT_CONFIG.taxLabel}</th>
                    <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wide text-slate-500">Total</th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">Status</th>
                    <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wide text-slate-500">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map(inv => (
                    <Fragment key={inv.id}>
                      <tr
                        onClick={() => void toggleExpand(inv)}
                        className="cursor-pointer hover:bg-slate-50/80"
                      >
                        <td className="px-4 py-3 text-sm font-bold text-slate-900 whitespace-nowrap">
                          <span className="mr-1.5 text-slate-400">{expandedId === inv.id ? '▾' : '▸'}</span>
                          {inv.invoice_number}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-700 whitespace-nowrap">{fmtDate(inv.issue_date)}</td>
                        <td className="px-4 py-3 text-sm text-slate-700">{inv.customer_name || '—'}</td>
                        <td className="px-4 py-3 text-xs whitespace-nowrap">
                          <span className={`rounded-full border px-2.5 py-0.5 font-semibold ${
                            inv.kind === 'counter'
                              ? 'border-teal-200 bg-teal-50 text-teal-700'
                              : 'border-blue-200 bg-blue-50 text-blue-700'
                          }`}>
                            {inv.kind === 'counter' ? 'Counter' : 'Account'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-sm text-slate-600 whitespace-nowrap">{fmtMoney(inv.tax_amount)}</td>
                        <td className="px-4 py-3 text-right text-sm font-black text-slate-900 whitespace-nowrap">{fmtMoney(inv.total)}</td>
                        <td className="px-4 py-3 text-xs whitespace-nowrap">
                          <span className={`rounded-full border px-2.5 py-0.5 font-bold uppercase ${STATUS_STYLES[inv.status] || STATUS_STYLES.draft}`}>
                            {inv.status}
                          </span>
                          {isOverdue(inv) && (
                            <span className="ml-1.5 rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-700">
                              {daysSince(inv.issue_date)}d
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          {isOutstanding(inv) && (
                            <button
                              onClick={() => void setStatus(inv, 'paid')}
                              disabled={busyId === inv.id}
                              className="mr-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                            >
                              Mark Paid
                            </button>
                          )}
                          <button
                            onClick={() => void printOne(inv)}
                            className="mr-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            Print
                          </button>
                          {inv.status === 'void' ? (
                            <button
                              onClick={() => void unvoidInvoice(inv)}
                              disabled={busyId === inv.id}
                              className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                            >
                              Restore
                            </button>
                          ) : (
                            <button
                              onClick={() => void voidInvoice(inv)}
                              disabled={busyId === inv.id}
                              className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                            >
                              Void
                            </button>
                          )}
                        </td>
                      </tr>
                      {expandedId === inv.id && (
                        <tr className="bg-slate-50/60">
                          <td colSpan={8} className="px-6 py-4">
                            {!itemsByInvoice[inv.id] ? (
                              <p className="text-xs text-slate-500">Loading line items…</p>
                            ) : itemsByInvoice[inv.id].length === 0 ? (
                              <p className="text-xs text-slate-500">No line items recorded on this invoice.</p>
                            ) : (
                              <table className="w-full max-w-2xl">
                                <thead>
                                  <tr>
                                    <th className="pb-2 text-left text-[10px] font-bold uppercase tracking-wide text-slate-400">Item</th>
                                    <th className="pb-2 text-right text-[10px] font-bold uppercase tracking-wide text-slate-400">Qty</th>
                                    <th className="pb-2 text-right text-[10px] font-bold uppercase tracking-wide text-slate-400">Rate</th>
                                    <th className="pb-2 text-right text-[10px] font-bold uppercase tracking-wide text-slate-400">Amount</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {itemsByInvoice[inv.id].map(item => (
                                    <tr key={item.id}>
                                      <td className="py-1 text-xs font-medium text-slate-800">
                                        {item.description}
                                        {item.unit ? <span className="text-slate-400"> (per {item.unit})</span> : null}
                                      </td>
                                      <td className="py-1 text-right text-xs text-slate-600">{item.quantity}</td>
                                      <td className="py-1 text-right text-xs text-slate-600">{fmtMoney(item.rate)}</td>
                                      <td className="py-1 text-right text-xs font-bold text-slate-900">{fmtMoney(item.amount)}</td>
                                    </tr>
                                  ))}
                                  <tr>
                                    <td colSpan={3} className="pt-2 text-right text-xs text-slate-500">Subtotal</td>
                                    <td className="pt-2 text-right text-xs font-bold text-slate-900">{fmtMoney(inv.subtotal)}</td>
                                  </tr>
                                  <tr>
                                    <td colSpan={3} className="text-right text-xs text-slate-500">{CLIENT_CONFIG.taxLabel} ({inv.tax_rate}%)</td>
                                    <td className="text-right text-xs font-bold text-slate-900">{fmtMoney(inv.tax_amount)}</td>
                                  </tr>
                                  <tr>
                                    <td colSpan={3} className="pt-1 text-right text-xs font-semibold text-slate-700">Total</td>
                                    <td className="pt-1 text-right text-xs font-bold text-slate-900">{fmtMoney(inv.total)}</td>
                                  </tr>
                                  {inv.paid_at && (
                                    <tr>
                                      <td colSpan={4} className="pt-2 text-right text-xs text-emerald-700">
                                        Paid {fmtDate(inv.paid_at)}
                                      </td>
                                    </tr>
                                  )}
                                </tbody>
                              </table>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        </>}
      </>
    </AppShell>
  )
}

export default function InvoicesPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-slate-500">Loading…</div>}>
      <InvoicesPageContent />
    </Suspense>
  )
}
