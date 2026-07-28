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

type InvoiceRow = { issue_date: string; subtotal: number; tax_amount: number; total: number; status: string }
type ExpenseRow = { expense_date: string; category: string | null; subtotal: number; tax_amount: number; total: number }

function fmtMoney(value: number) {
  return `$${Number(value || 0).toFixed(2)}`
}

function quarterRange(year: number, q: number) {
  const startMonth = (q - 1) * 3
  const from = new Date(year, startMonth, 1)
  const to = new Date(year, startMonth + 3, 0)
  const iso = (d: Date) => d.toLocaleDateString('en-CA')
  return { from: iso(from), to: iso(to) }
}

export default function TaxReportPage() {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const { role, loading: roleLoading } = useRole()

  const now = new Date()
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [invoices, setInvoices] = useState<InvoiceRow[]>([])
  const [expenses, setExpenses] = useState<ExpenseRow[]>([])
  const [loading, setLoading] = useState(false)
  const [hasRun, setHasRun] = useState(false)
  const [pageError, setPageError] = useState('')

  useEffect(() => {
    if (!roleLoading && role !== null && !can(role, 'canViewReports')) {
      router.push(role === 'driver' ? '/driver' : '/dispatch')
    }
  }, [roleLoading, role])

  async function runReport() {
    if (!dateFrom || !dateTo) return
    setLoading(true)
    setPageError('')

    // Void invoices never count toward tax collected
    const [invRes, expRes] = await Promise.all([
      supabase.from('invoices')
        .select('issue_date,subtotal,tax_amount,total,status')
        .neq('status', 'void')
        .gte('issue_date', dateFrom)
        .lte('issue_date', dateTo),
      supabase.from('expenses')
        .select('expense_date,category,subtotal,tax_amount,total')
        .gte('expense_date', dateFrom)
        .lte('expense_date', dateTo),
    ])

    if (invRes.error) { setPageError(invRes.error.message); setLoading(false); return }
    if (expRes.error) { setPageError(expRes.error.message); setLoading(false); return }

    setInvoices((invRes.data as InvoiceRow[]) || [])
    setExpenses((expRes.data as ExpenseRow[]) || [])
    setHasRun(true)
    setLoading(false)
  }

  const totals = useMemo(() => {
    const sales = invoices.reduce((s, i) => s + Number(i.subtotal || 0), 0)
    const taxCollected = invoices.reduce((s, i) => s + Number(i.tax_amount || 0), 0)
    const expenseBeforeTax = expenses.reduce((s, e) => s + Number(e.subtotal || 0), 0)
    const taxPaid = expenses.reduce((s, e) => s + Number(e.tax_amount || 0), 0)
    return {
      sales,
      taxCollected,
      expenseBeforeTax,
      taxPaid,
      netTax: taxCollected - taxPaid,
      netProfit: sales - expenseBeforeTax,
    }
  }, [invoices, expenses])

  const byCategory = useMemo(() => {
    const map = new Map<string, number>()
    expenses.forEach(e => {
      const k = e.category || 'Other'
      map.set(k, (map.get(k) || 0) + Number(e.subtotal || 0))
    })
    return [...map.entries()]
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount)
  }, [expenses])

  function applyQuarter(q: number, year: number) {
    const r = quarterRange(year, q)
    setDateFrom(r.from)
    setDateTo(r.to)
  }

  function applyYear(year: number) {
    setDateFrom(`${year}-01-01`)
    setDateTo(`${year}-12-31`)
  }

  function printReturn() {
    const win = window.open('', '_blank')
    if (!win) return
    const catRows = byCategory
      .map(c => `<tr><td>${c.category}</td><td style="text-align:right">${fmtMoney(c.amount)}</td></tr>`)
      .join('')

    win.document.write(`<html><head><title>${CLIENT_CONFIG.taxLabel} Return — ${dateFrom} to ${dateTo}</title>
    <style>
      body{font-family:Arial,sans-serif;font-size:12px;padding:28px;color:#1e293b;max-width:680px}
      h1{font-size:19px;margin:0 0 2px}
      h2{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#64748b;margin:22px 0 8px;border-bottom:1px solid #e2e8f0;padding-bottom:4px}
      .meta{font-size:12px;color:#475569;margin:14px 0 4px;padding:10px 14px;background:#f8fafc;border-radius:6px}
      table{width:100%;border-collapse:collapse;margin-bottom:10px}
      td{padding:7px 10px;border-bottom:1px solid #f1f5f9;font-size:12px}
      .line td{font-weight:normal}
      .line .lbl{color:#475569}
      .code{display:inline-block;min-width:44px;font-family:monospace;color:#94a3b8;font-size:11px}
      .grand td{border-top:2px solid #cbd5e1;font-size:14px;font-weight:bold;padding-top:10px}
      .footer{margin-top:26px;padding-top:10px;border-top:1px solid #e2e8f0;color:#94a3b8;font-size:10px}
      @media print{body{padding:0}}
    </style></head><body>
    <h1>${CLIENT_CONFIG.name}</h1>
    <div style="font-size:15px;font-weight:bold;margin-top:6px">${CLIENT_CONFIG.taxLabel} Return Summary</div>
    <div class="meta">Reporting period: <strong>${dateFrom}</strong> to <strong>${dateTo}</strong></div>

    <h2>Amounts for your ${CLIENT_CONFIG.taxLabel} return</h2>
    <table>
      <tr class="line"><td class="lbl"><span class="code">101</span> Sales and other revenue (before tax)</td>
          <td style="text-align:right"><strong>${fmtMoney(totals.sales)}</strong></td></tr>
      <tr class="line"><td class="lbl"><span class="code">105</span> ${CLIENT_CONFIG.taxLabel} collected on sales</td>
          <td style="text-align:right"><strong>${fmtMoney(totals.taxCollected)}</strong></td></tr>
      <tr class="line"><td class="lbl"><span class="code">108</span> Input tax credits (${CLIENT_CONFIG.taxLabel} paid on purchases)</td>
          <td style="text-align:right"><strong>${fmtMoney(totals.taxPaid)}</strong></td></tr>
      <tr class="grand"><td>${totals.netTax >= 0 ? 'Net tax owing to CRA' : 'Refund expected from CRA'} <span class="code">109</span></td>
          <td style="text-align:right">${fmtMoney(Math.abs(totals.netTax))}</td></tr>
    </table>

    <h2>Profit summary</h2>
    <table>
      <tr class="line"><td class="lbl">Revenue (before tax)</td><td style="text-align:right">${fmtMoney(totals.sales)}</td></tr>
      <tr class="line"><td class="lbl">Expenses (before tax)</td><td style="text-align:right">${fmtMoney(totals.expenseBeforeTax)}</td></tr>
      <tr class="grand"><td>Net profit</td><td style="text-align:right">${fmtMoney(totals.netProfit)}</td></tr>
    </table>

    <h2>Expenses by category</h2>
    <table>${catRows || '<tr><td colspan="2" style="color:#94a3b8">No expenses recorded</td></tr>'}</table>

    <div class="footer">
      Generated by ${CLIENT_CONFIG.name} on ${new Date().toISOString().slice(0, 10)}.
      Figures come from invoices and recorded expenses in the period. Confirm with your accountant before filing.
    </div>
    </body></html>`)
    win.document.close()
    win.print()
  }

  const year = now.getFullYear()

  return (
    <AppShell
      title={`${CLIENT_CONFIG.taxLabel} Return`}
      subtitle="The figures CRA asks for, straight from your invoices and expenses"
      maxWidth="max-w-5xl"
      actions={
        <Link
          href="/reports"
          className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 ring-1 ring-slate-200 transition hover:bg-slate-50 hover:text-slate-900"
        >
          <Icon name="arrowLeft" className="h-4 w-4" />
          <span className="hidden sm:inline">Reports</span>
        </Link>
      }
    >
      <>
        {pageError ? (
          <div className="mb-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{pageError}</div>
        ) : null}

        {/* Period picker */}
        <div className="mb-6 rounded-xl bg-white p-6 ring-1 ring-slate-200">
          <h2 className="mb-4 text-base font-semibold text-slate-900">Reporting period</h2>

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
              onClick={() => applyYear(year)}
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-600 ring-1 ring-slate-200 transition hover:bg-slate-50 hover:text-slate-900"
            >
              All {year}
            </button>
            <button
              onClick={() => applyYear(year - 1)}
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-600 ring-1 ring-slate-200 transition hover:bg-slate-50 hover:text-slate-900"
            >
              All {year - 1}
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500">From</label>
              <input
                type="date"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-400"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500">To</label>
              <input
                type="date"
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-400"
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={() => void runReport()}
                disabled={!dateFrom || !dateTo || loading}
                className="w-full rounded-lg px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-40"
                style={{ background: 'var(--accent)' }}
              >
                {loading ? 'Calculating…' : 'Calculate'}
              </button>
            </div>
          </div>
        </div>

        {hasRun && !loading && (
          <>
            {/* The return itself */}
            <div className="mb-6 overflow-hidden rounded-xl bg-white ring-1 ring-slate-200">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-6 py-4">
                <div>
                  <h2 className="text-base font-semibold text-slate-900">
                    Amounts for your {CLIENT_CONFIG.taxLabel} return
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Copy these into CRA My Business Account — line numbers match the form
                  </p>
                </div>
                <button
                  onClick={printReturn}
                  className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 ring-1 ring-slate-200 transition hover:bg-slate-50 hover:text-slate-900"
                >
                  Print / PDF
                </button>
              </div>

              <table className="w-full divide-y divide-slate-100">
                <tbody className="divide-y divide-slate-100">
                  {[
                    { code: '101', label: 'Sales and other revenue (before tax)', value: totals.sales },
                    { code: '105', label: `${CLIENT_CONFIG.taxLabel} collected on sales`, value: totals.taxCollected },
                    { code: '108', label: `Input tax credits — ${CLIENT_CONFIG.taxLabel} paid on purchases`, value: totals.taxPaid },
                  ].map(row => (
                    <tr key={row.code}>
                      <td className="px-6 py-3.5">
                        <span className="mr-3 font-mono text-xs text-slate-400">{row.code}</span>
                        <span className="text-sm text-slate-700">{row.label}</span>
                      </td>
                      <td className="px-6 py-3.5 text-right text-sm font-semibold text-slate-900 whitespace-nowrap">
                        {fmtMoney(row.value)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t-2 border-slate-200 bg-slate-50">
                  <tr>
                    <td className="px-6 py-4">
                      <span className="mr-3 font-mono text-xs text-slate-400">109</span>
                      <span className="text-sm font-bold text-slate-900">
                        {totals.netTax >= 0 ? 'Net tax owing to CRA' : 'Refund expected from CRA'}
                      </span>
                    </td>
                    <td
                      className={`px-6 py-4 text-right text-xl font-black whitespace-nowrap ${
                        totals.netTax >= 0 ? 'text-rose-600' : 'text-emerald-600'
                      }`}
                    >
                      {fmtMoney(Math.abs(totals.netTax))}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Profit summary */}
            <div className="mb-6 grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-slate-200 ring-1 ring-slate-200 dark:bg-slate-700 lg:grid-cols-3">
              {[
                { label: 'Revenue (before tax)', value: fmtMoney(totals.sales), tone: 'text-slate-900' },
                { label: 'Expenses (before tax)', value: fmtMoney(totals.expenseBeforeTax), tone: 'text-slate-900' },
                {
                  label: 'Net profit',
                  value: fmtMoney(totals.netProfit),
                  tone: totals.netProfit >= 0 ? 'text-emerald-600' : 'text-rose-600',
                },
              ].map(k => (
                <div key={k.label} className="bg-white px-5 py-4">
                  <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{k.label}</div>
                  <div className={`mt-2 text-xl font-semibold tracking-tight ${k.tone}`}>{k.value}</div>
                </div>
              ))}
            </div>

            {/* Expenses by category */}
            <div className="overflow-hidden rounded-xl bg-white ring-1 ring-slate-200">
              <div className="border-b border-slate-200 px-6 py-4">
                <h2 className="text-base font-semibold text-slate-900">Expenses by category</h2>
                <p className="mt-0.5 text-xs text-slate-500">Before tax — what your accountant needs at year end</p>
              </div>
              {byCategory.length === 0 ? (
                <div className="p-10 text-center text-sm text-slate-500">
                  No expenses recorded in this period.{' '}
                  <Link href="/expenses" className="font-semibold underline">Add expenses →</Link>
                </div>
              ) : (
                <table className="w-full divide-y divide-slate-100">
                  <tbody className="divide-y divide-slate-100">
                    {byCategory.map(c => (
                      <tr key={c.category}>
                        <td className="px-6 py-3 text-sm text-slate-700">{c.category}</td>
                        <td className="px-6 py-3 text-right text-sm font-semibold text-slate-900 whitespace-nowrap">
                          {fmtMoney(c.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t-2 border-slate-200 bg-slate-50">
                    <tr>
                      <td className="px-6 py-3.5 text-sm font-bold text-slate-900">Total</td>
                      <td className="px-6 py-3.5 text-right text-sm font-black text-slate-900 whitespace-nowrap">
                        {fmtMoney(totals.expenseBeforeTax)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>

            <p className="mt-6 text-xs leading-relaxed text-slate-500">
              Figures come from invoices (excluding voided ones) and recorded expenses in the selected period.
              Review with your accountant before filing — this summary is a preparation aid, not a filed return.
            </p>
          </>
        )}
      </>
    </AppShell>
  )
}
