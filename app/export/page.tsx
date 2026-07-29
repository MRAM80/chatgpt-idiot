'use client'

export const dynamic = 'force-dynamic'

import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import AppShell from '@/components/AppShell'
import Icon from '@/components/Icon'
import { CLIENT_CONFIG } from '@/lib/client-config'
import { useRole } from '@/hooks/useRole'
import { can } from '@/lib/roles'

type Invoice = {
  id: string
  invoice_number: string
  customer_name: string | null
  issue_date: string
  subtotal: number
  tax_amount: number
  total: number
  status: string
  notes: string | null
}

type InvoiceItem = {
  invoice_id: string
  description: string
  quantity: number
  rate: number
  amount: number
}

type Expense = {
  id: string
  expense_date: string
  supplier: string | null
  category: string | null
  description: string | null
  subtotal: number
  tax_amount: number
  total: number
  payment_method: string | null
}

type Accounts = {
  receivable: string
  income: string
  taxPayable: string
  bank: string
}

const DEFAULT_ACCOUNTS: Accounts = {
  receivable: 'Accounts Receivable',
  income: 'Sales',
  taxPayable: 'GST/HST Payable',
  bank: 'Chequing',
}

const ACCOUNTS_STORAGE_KEY = `${CLIENT_CONFIG.shortName.toLowerCase()}-qb-accounts`

function fmtMoney(v: number) {
  return `$${Number(v || 0).toFixed(2)}`
}

/** QuickBooks expects MM/DD/YYYY regardless of locale. */
function iifDate(iso: string) {
  const [y, m, d] = iso.split('-')
  return `${m}/${d}/${y}`
}

/** IIF is tab-delimited; tabs and newlines inside a value would break the row. */
function iifSafe(value: string | null | undefined) {
  return (value || '').replace(/[\t\r\n]/g, ' ').trim()
}

function download(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function csvEscape(v: string | number) {
  return `"${String(v).replace(/"/g, '""')}"`
}

export default function ExportPage() {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const { role, loading: roleLoading } = useRole()

  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [includeInvoices, setIncludeInvoices] = useState(true)
  const [includeExpenses, setIncludeExpenses] = useState(true)
  const [accounts, setAccounts] = useState<Accounts>(DEFAULT_ACCOUNTS)

  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [items, setItems] = useState<InvoiceItem[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading] = useState(false)
  const [hasRun, setHasRun] = useState(false)
  const [pageError, setPageError] = useState('')

  useEffect(() => {
    if (!roleLoading && role !== null && !can(role, 'canViewReports')) {
      router.push(role === 'driver' ? '/driver' : '/dispatch')
    }
  }, [roleLoading, role])

  // Account names are per-install and rarely change — remember them locally
  useEffect(() => {
    try {
      const saved = localStorage.getItem(ACCOUNTS_STORAGE_KEY)
      if (saved) setAccounts({ ...DEFAULT_ACCOUNTS, ...JSON.parse(saved) })
    } catch { /* ignore malformed storage */ }
  }, [])

  function updateAccount(key: keyof Accounts, value: string) {
    const next = { ...accounts, [key]: value }
    setAccounts(next)
    try { localStorage.setItem(ACCOUNTS_STORAGE_KEY, JSON.stringify(next)) } catch { /* non-fatal */ }
  }

  function applyQuarter(q: number, year: number) {
    const startMonth = (q - 1) * 3
    const iso = (d: Date) => d.toLocaleDateString('en-CA')
    setDateFrom(iso(new Date(year, startMonth, 1)))
    setDateTo(iso(new Date(year, startMonth + 3, 0)))
  }

  async function loadData() {
    if (!dateFrom || !dateTo) return
    setLoading(true)
    setPageError('')

    const invPromise = includeInvoices
      ? supabase.from('invoices')
          .select('id,invoice_number,customer_name,issue_date,subtotal,tax_amount,total,status,notes')
          .neq('status', 'void')
          .gte('issue_date', dateFrom)
          .lte('issue_date', dateTo)
          .order('issue_date')
      : Promise.resolve({ data: [], error: null })

    const expPromise = includeExpenses
      ? supabase.from('expenses')
          .select('id,expense_date,supplier,category,description,subtotal,tax_amount,total,payment_method')
          .gte('expense_date', dateFrom)
          .lte('expense_date', dateTo)
          .order('expense_date')
      : Promise.resolve({ data: [], error: null })

    const [invRes, expRes] = await Promise.all([invPromise, expPromise])
    if (invRes.error) { setPageError(invRes.error.message); setLoading(false); return }
    if (expRes.error) { setPageError(expRes.error.message); setLoading(false); return }

    const invList = (invRes.data as Invoice[]) || []
    setInvoices(invList)
    setExpenses((expRes.data as Expense[]) || [])

    if (invList.length > 0) {
      const { data: itemData, error: itemErr } = await supabase
        .from('invoice_items')
        .select('invoice_id,description,quantity,rate,amount')
        .in('invoice_id', invList.map(i => i.id))
      if (itemErr) { setPageError(itemErr.message); setLoading(false); return }
      setItems((itemData as InvoiceItem[]) || [])
    } else {
      setItems([])
    }

    setHasRun(true)
    setLoading(false)
  }

  const totals = useMemo(() => ({
    invoiceCount: invoices.length,
    invoiceTotal: invoices.reduce((s, i) => s + Number(i.total || 0), 0),
    expenseCount: expenses.length,
    expenseTotal: expenses.reduce((s, e) => s + Number(e.total || 0), 0),
  }), [invoices, expenses])

  /**
   * IIF for QuickBooks Desktop. Each transaction is TRNS + its SPL lines +
   * ENDTRNS, and every block must net to zero or QuickBooks rejects it.
   */
  function buildIIF() {
    const lines: string[] = []
    lines.push(['!TRNS', 'TRNSTYPE', 'DATE', 'ACCNT', 'NAME', 'AMOUNT', 'DOCNUM', 'MEMO'].join('\t'))
    lines.push(['!SPL', 'TRNSTYPE', 'DATE', 'ACCNT', 'NAME', 'AMOUNT', 'MEMO', 'QNTY', 'PRICE'].join('\t'))
    lines.push('!ENDTRNS')

    if (includeInvoices) {
      for (const inv of invoices) {
        const name = iifSafe(inv.customer_name) || 'Walk-in customer'
        const date = iifDate(inv.issue_date)
        // Debit AR for the full amount owed
        lines.push([
          'TRNS', 'INVOICE', date, iifSafe(accounts.receivable), name,
          Number(inv.total).toFixed(2), iifSafe(inv.invoice_number), iifSafe(inv.notes),
        ].join('\t'))

        // Credit income per line item; fall back to one lump line if none exist
        const invItems = items.filter(i => i.invoice_id === inv.id)
        if (invItems.length > 0) {
          for (const it of invItems) {
            lines.push([
              'SPL', 'INVOICE', date, iifSafe(accounts.income), name,
              (-Number(it.amount)).toFixed(2), iifSafe(it.description),
              String(it.quantity), Number(it.rate).toFixed(2),
            ].join('\t'))
          }
        } else {
          lines.push([
            'SPL', 'INVOICE', date, iifSafe(accounts.income), name,
            (-Number(inv.subtotal)).toFixed(2), 'Sale', '', '',
          ].join('\t'))
        }

        // Credit tax payable
        if (Number(inv.tax_amount) !== 0) {
          lines.push([
            'SPL', 'INVOICE', date, iifSafe(accounts.taxPayable), name,
            (-Number(inv.tax_amount)).toFixed(2), CLIENT_CONFIG.taxLabel, '', '',
          ].join('\t'))
        }
        lines.push('ENDTRNS')
      }
    }

    if (includeExpenses) {
      for (const exp of expenses) {
        const name = iifSafe(exp.supplier) || 'Supplier'
        const date = iifDate(exp.expense_date)
        const memo = iifSafe(exp.description)
        // Money leaving the bank account
        lines.push([
          'TRNS', 'CHECK', date, iifSafe(accounts.bank), name,
          (-Number(exp.total)).toFixed(2), '', memo,
        ].join('\t'))
        // Debit the expense category
        lines.push([
          'SPL', 'CHECK', date, iifSafe(exp.category) || 'Uncategorized Expense', name,
          Number(exp.subtotal).toFixed(2), memo, '', '',
        ].join('\t'))
        // Debit tax paid (the input tax credit)
        if (Number(exp.tax_amount) !== 0) {
          lines.push([
            'SPL', 'CHECK', date, iifSafe(accounts.taxPayable), name,
            Number(exp.tax_amount).toFixed(2), `${CLIENT_CONFIG.taxLabel} paid`, '', '',
          ].join('\t'))
        }
        lines.push('ENDTRNS')
      }
    }

    return lines.join('\r\n') + '\r\n'
  }

  function buildCSV() {
    const rows: string[] = []
    if (includeInvoices) {
      rows.push('INVOICES')
      rows.push(['Invoice', 'Date', 'Customer', 'Subtotal', CLIENT_CONFIG.taxLabel, 'Total', 'Status'].map(csvEscape).join(','))
      for (const i of invoices) {
        rows.push([
          i.invoice_number, i.issue_date, i.customer_name || '',
          Number(i.subtotal).toFixed(2), Number(i.tax_amount).toFixed(2), Number(i.total).toFixed(2), i.status,
        ].map(csvEscape).join(','))
      }
      rows.push([
        '', '', 'TOTAL',
        invoices.reduce((s, i) => s + Number(i.subtotal || 0), 0).toFixed(2),
        invoices.reduce((s, i) => s + Number(i.tax_amount || 0), 0).toFixed(2),
        totals.invoiceTotal.toFixed(2), '',
      ].map(csvEscape).join(','))
      rows.push('')
    }

    if (includeExpenses) {
      rows.push('EXPENSES')
      rows.push(['Date', 'Supplier', 'Category', 'Description', 'Before Tax', `${CLIENT_CONFIG.taxLabel} Paid`, 'Total', 'Paid By'].map(csvEscape).join(','))
      for (const e of expenses) {
        rows.push([
          e.expense_date, e.supplier || '', e.category || '', e.description || '',
          Number(e.subtotal).toFixed(2), Number(e.tax_amount).toFixed(2), Number(e.total).toFixed(2), e.payment_method || '',
        ].map(csvEscape).join(','))
      }
      rows.push([
        '', '', '', 'TOTAL',
        expenses.reduce((s, e) => s + Number(e.subtotal || 0), 0).toFixed(2),
        expenses.reduce((s, e) => s + Number(e.tax_amount || 0), 0).toFixed(2),
        totals.expenseTotal.toFixed(2), '',
      ].map(csvEscape).join(','))
    }

    return rows.join('\n')
  }

  function downloadIIF() {
    download(`quickbooks-${dateFrom}-to-${dateTo}.iif`, buildIIF(), 'text/plain;charset=utf-8')
  }

  function downloadCSV() {
    download(`accountant-${dateFrom}-to-${dateTo}.csv`, buildCSV(), 'text/csv;charset=utf-8')
  }

  const year = new Date().getFullYear()
  const nothingSelected = !includeInvoices && !includeExpenses
  const nothingFound = hasRun && totals.invoiceCount === 0 && totals.expenseCount === 0

  return (
    <AppShell
      title="Export to QuickBooks"
      subtitle="Hand your accountant a clean file — invoices, expenses, and tax, ready to import"
      maxWidth="max-w-5xl"
    >
      <>
        {pageError ? (
          <div className="mb-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{pageError}</div>
        ) : null}

        {/* Period + scope */}
        <div className="mb-6 rounded-xl bg-white p-6 ring-1 ring-slate-200">
          <h2 className="mb-4 text-base font-semibold text-slate-900">What to export</h2>

          <div className="mb-4 flex flex-wrap gap-2">
            {[1, 2, 3, 4].map(q => (
              <button
                key={q}
                onClick={() => applyQuarter(q, year)}
                className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-600 ring-1 ring-slate-200 transition hover:bg-slate-50 hover:text-slate-900"
              >
                Q{q} {year}
              </button>
            ))}
            <button
              onClick={() => { setDateFrom(`${year}-01-01`); setDateTo(`${year}-12-31`) }}
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-600 ring-1 ring-slate-200 transition hover:bg-slate-50 hover:text-slate-900"
            >
              All {year}
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500">From</label>
              <input
                type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-400"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500">To</label>
              <input
                type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-400"
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={() => void loadData()}
                disabled={!dateFrom || !dateTo || loading || nothingSelected}
                className="w-full rounded-lg px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-40"
                style={{ background: 'var(--accent)' }}
              >
                {loading ? 'Loading…' : 'Prepare Export'}
              </button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-5">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox" checked={includeInvoices}
                onChange={e => { setIncludeInvoices(e.target.checked); setHasRun(false) }}
                className="h-4 w-4 rounded border-slate-300"
              />
              Invoices &amp; counter sales
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox" checked={includeExpenses}
                onChange={e => { setIncludeExpenses(e.target.checked); setHasRun(false) }}
                className="h-4 w-4 rounded border-slate-300"
              />
              Expenses
            </label>
          </div>
        </div>

        {hasRun && !loading && (
          <>
            {/* Summary */}
            <div className="mb-6 grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-slate-200 ring-1 ring-slate-200 dark:bg-slate-700 lg:grid-cols-4">
              {[
                { label: 'Invoices', value: String(totals.invoiceCount), tone: 'text-slate-900' },
                { label: 'Invoiced', value: fmtMoney(totals.invoiceTotal), tone: 'text-emerald-600' },
                { label: 'Expenses', value: String(totals.expenseCount), tone: 'text-slate-900' },
                { label: 'Spent', value: fmtMoney(totals.expenseTotal), tone: 'text-rose-600' },
              ].map(k => (
                <div key={k.label} className="bg-white px-5 py-4">
                  <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{k.label}</div>
                  <div className={`mt-2 text-xl font-semibold tracking-tight ${k.tone}`}>{k.value}</div>
                </div>
              ))}
            </div>

            {nothingFound ? (
              <div className="rounded-xl bg-white p-10 text-center text-sm text-slate-500 ring-1 ring-slate-200">
                Nothing recorded in that period — pick a different range.
              </div>
            ) : (
              <div className="grid gap-4 lg:grid-cols-2">
                {/* CSV — the safe one */}
                <div className="rounded-xl bg-white p-6 ring-1 ring-slate-200">
                  <div className="mb-3 flex items-center gap-3">
                    <span
                      className="flex h-10 w-10 items-center justify-center rounded-lg text-[var(--accent)]"
                      style={{ background: 'var(--accent-soft)' }}
                    >
                      <Icon name="reports" className="h-5 w-5" />
                    </span>
                    <div>
                      <h3 className="text-base font-semibold text-slate-900">Spreadsheet (CSV)</h3>
                      <p className="text-xs text-slate-500">For your accountant</p>
                    </div>
                  </div>
                  <p className="mb-4 text-sm leading-relaxed text-slate-600">
                    Every invoice and expense with tax broken out, opens in Excel or Google Sheets.
                    Nothing to configure and nothing can go wrong — this is the one to send at year end.
                  </p>
                  <button
                    onClick={downloadCSV}
                    className="w-full rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
                    style={{ background: 'var(--accent)' }}
                  >
                    Download CSV
                  </button>
                </div>

                {/* IIF — the direct one */}
                <div className="rounded-xl bg-white p-6 ring-1 ring-slate-200">
                  <div className="mb-3 flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                      <Icon name="invoice" className="h-5 w-5" />
                    </span>
                    <div>
                      <h3 className="text-base font-semibold text-slate-900">QuickBooks file (.IIF)</h3>
                      <p className="text-xs text-slate-500">Imports straight into QuickBooks Desktop</p>
                    </div>
                  </div>
                  <p className="mb-3 text-sm leading-relaxed text-slate-600">
                    In QuickBooks: <strong>File → Utilities → Import → IIF Files</strong>, then pick the
                    downloaded file. Works with QuickBooks Desktop 2019.
                  </p>
                  <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-800">
                    <strong>Back up your company file first</strong> (File → Back Up Company), and try one
                    month before doing a full year. Importing adds transactions — don&apos;t import a period
                    you&apos;ve already entered by hand.
                  </div>
                  <button
                    onClick={downloadIIF}
                    className="w-full rounded-lg px-4 py-2.5 text-sm font-semibold text-slate-700 ring-1 ring-slate-300 transition hover:bg-slate-50"
                  >
                    Download .IIF
                  </button>
                </div>
              </div>
            )}

            {/* Account mapping */}
            {!nothingFound && (
              <div className="mt-6 rounded-xl bg-white p-6 ring-1 ring-slate-200">
                <h3 className="text-base font-semibold text-slate-900">QuickBooks account names</h3>
                <p className="mb-4 mt-0.5 text-sm text-slate-500">
                  Only used by the .IIF file. These must match the account names in your QuickBooks chart of
                  accounts exactly, or the import will be rejected. Saved on this computer.
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {([
                    { key: 'receivable' as const, label: 'Accounts receivable', hint: 'Where invoices are owed' },
                    { key: 'income' as const, label: 'Income / sales account', hint: 'Where revenue lands' },
                    { key: 'taxPayable' as const, label: `${CLIENT_CONFIG.taxLabel} payable`, hint: 'Tax collected and paid' },
                    { key: 'bank' as const, label: 'Bank account', hint: 'What expenses are paid from' },
                  ]).map(f => (
                    <div key={f.key}>
                      <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500">
                        {f.label}
                      </label>
                      <input
                        value={accounts[f.key]}
                        onChange={e => updateAccount(f.key, e.target.value)}
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-400"
                      />
                      <p className="mt-1 text-[11px] text-slate-400">{f.hint}</p>
                    </div>
                  ))}
                </div>
                <p className="mt-4 text-xs text-slate-500">
                  Expense categories are sent as account names too — make sure categories like &ldquo;Fuel&rdquo;
                  and &ldquo;Disposal Fees&rdquo; exist in QuickBooks, or add them there first.
                </p>
              </div>
            )}
          </>
        )}
      </>
    </AppShell>
  )
}
