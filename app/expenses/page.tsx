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
  notes: string | null
}

// Categories double as the expense breakdown on the tax + P&L reports
export const EXPENSE_CATEGORIES = [
  'Fuel',
  'Vehicle Maintenance',
  'Disposal Fees',
  'Inventory / Purchases',
  'Equipment',
  'Insurance',
  'Rent',
  'Utilities',
  'Office & Admin',
  'Subcontractors',
  'Other',
] as const

const PAYMENT_METHODS = ['Cash', 'Debit', 'Credit Card', 'Cheque', 'E-transfer', 'On Account'] as const

function fmtMoney(value: number) {
  return `$${Number(value || 0).toFixed(2)}`
}

function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Date(d + 'T12:00:00').toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })
}

function todayKey() {
  return new Date().toLocaleDateString('en-CA')
}

export default function ExpensesPage() {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const { role, loading: roleLoading } = useRole()

  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)
  const [pageError, setPageError] = useState('')
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  // Form
  const [date, setDate] = useState(todayKey())
  const [supplier, setSupplier] = useState('')
  const [category, setCategory] = useState<string>('Fuel')
  const [description, setDescription] = useState('')
  const [subtotalInput, setSubtotalInput] = useState('')
  const [taxInput, setTaxInput] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<string>('Credit Card')

  // Filters
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  useEffect(() => {
    if (!roleLoading && role !== null && !can(role, 'canViewReports')) {
      router.push(role === 'driver' ? '/driver' : '/dispatch')
    }
  }, [roleLoading, role])

  async function loadExpenses() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    const { data, error } = await supabase
      .from('expenses')
      .select('id,expense_date,supplier,category,description,subtotal,tax_amount,total,payment_method,notes')
      .order('expense_date', { ascending: false })
      .limit(500)
    if (error) { setPageError(error.message); setLoading(false); return }
    setExpenses((data as Expense[]) || [])
    setLoading(false)
  }

  useEffect(() => { void loadExpenses() }, [])

  // Typing a subtotal pre-fills the tax at the tenant rate — override if the
  // receipt says otherwise (some suppliers are exempt or partially taxed).
  function onSubtotalChange(value: string) {
    setSubtotalInput(value)
    const n = Number(value)
    if (!Number.isNaN(n) && value.trim()) {
      setTaxInput((n * (CLIENT_CONFIG.taxRate / 100)).toFixed(2))
    }
  }

  function resetForm() {
    setEditingId(null)
    setDate(todayKey())
    setSupplier('')
    setCategory('Fuel')
    setDescription('')
    setSubtotalInput('')
    setTaxInput('')
    setPaymentMethod('Credit Card')
  }

  function startEdit(e: Expense) {
    setEditingId(e.id)
    setDate(e.expense_date)
    setSupplier(e.supplier || '')
    setCategory(e.category || 'Other')
    setDescription(e.description || '')
    setSubtotalInput(String(e.subtotal))
    setTaxInput(String(e.tax_amount))
    setPaymentMethod(e.payment_method || 'Credit Card')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function saveExpense() {
    setPageError('')
    const subtotal = Number(subtotalInput)
    const tax = Number(taxInput || '0')
    if (!date) { setPageError('Pick the expense date.'); return }
    if (!subtotalInput.trim() || Number.isNaN(subtotal) || subtotal < 0) {
      setPageError('Enter a valid amount before tax.')
      return
    }
    if (Number.isNaN(tax) || tax < 0) { setPageError(`Enter a valid ${CLIENT_CONFIG.taxLabel} amount.`); return }

    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    const payload = {
      expense_date: date,
      supplier: supplier.trim() || null,
      category,
      description: description.trim() || null,
      subtotal: Number(subtotal.toFixed(2)),
      tax_amount: Number(tax.toFixed(2)),
      total: Number((subtotal + tax).toFixed(2)),
      payment_method: paymentMethod,
    }

    const { error } = editingId
      ? await supabase.from('expenses').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', editingId)
      : await supabase.from('expenses').insert([{ ...payload, created_by: user?.id || null }])

    setSaving(false)
    if (error) { setPageError(error.message); return }
    resetForm()
    await loadExpenses()
  }

  async function deleteExpense(e: Expense) {
    if (!window.confirm(`Delete the ${fmtMoney(e.total)} expense from ${e.supplier || 'this supplier'}?`)) return
    const { error } = await supabase.from('expenses').delete().eq('id', e.id)
    if (error) { setPageError(error.message); return }
    if (editingId === e.id) resetForm()
    await loadExpenses()
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return expenses.filter(e => {
      if (categoryFilter !== 'all' && e.category !== categoryFilter) return false
      if (dateFrom && e.expense_date < dateFrom) return false
      if (dateTo && e.expense_date > dateTo) return false
      if (q) {
        const hay = `${e.supplier || ''} ${e.description || ''} ${e.category || ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [expenses, search, categoryFilter, dateFrom, dateTo])

  const stats = useMemo(() => ({
    total: filtered.reduce((s, e) => s + Number(e.total || 0), 0),
    beforeTax: filtered.reduce((s, e) => s + Number(e.subtotal || 0), 0),
    tax: filtered.reduce((s, e) => s + Number(e.tax_amount || 0), 0),
    count: filtered.length,
  }), [filtered])

  return (
    <AppShell
      title="Expenses"
      subtitle={`Supplier bills and receipts — the ${CLIENT_CONFIG.taxLabel} you pay becomes an input tax credit`}
    >
      <>
        {pageError ? (
          <div className="mb-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{pageError}</div>
        ) : null}

        {/* KPIs */}
        <div className="mb-6 grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-slate-200 ring-1 ring-slate-200 dark:bg-slate-700 lg:grid-cols-4">
          {[
            { label: 'Expenses', value: String(stats.count), tone: 'text-slate-900' },
            { label: 'Before Tax', value: fmtMoney(stats.beforeTax), tone: 'text-slate-900' },
            { label: `${CLIENT_CONFIG.taxLabel} Paid`, value: fmtMoney(stats.tax), tone: 'text-blue-600' },
            { label: 'Total Spent', value: fmtMoney(stats.total), tone: 'text-rose-600' },
          ].map(k => (
            <div key={k.label} className="bg-white px-5 py-4">
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{k.label}</div>
              <div className={`mt-2 text-xl font-semibold tracking-tight ${k.tone}`}>{k.value}</div>
            </div>
          ))}
        </div>

        {/* Add / edit */}
        <div className="mb-6 rounded-xl bg-white p-6 ring-1 ring-slate-200">
          <h2 className="mb-4 text-base font-semibold text-slate-900">
            {editingId ? 'Edit Expense' : 'Record an Expense'}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500">Supplier</label>
              <input
                value={supplier}
                onChange={e => setSupplier(e.target.value)}
                placeholder="e.g. Petro-Canada"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-slate-400"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500">Category</label>
              <select
                value={category}
                onChange={e => setCategory(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-400"
              >
                {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500">Amount before tax</label>
              <input
                value={subtotalInput}
                onChange={e => onSubtotalChange(e.target.value)}
                inputMode="decimal"
                placeholder="0.00"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-slate-400"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500">
                {CLIENT_CONFIG.taxLabel} paid
              </label>
              <input
                value={taxInput}
                onChange={e => setTaxInput(e.target.value)}
                inputMode="decimal"
                placeholder="0.00"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-slate-400"
              />
              <p className="mt-1 text-[11px] text-slate-400">
                Auto-filled at {CLIENT_CONFIG.taxRate}% — edit to match the receipt
              </p>
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
            <div className="sm:col-span-2 lg:col-span-3">
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500">Description</label>
              <input
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="What was purchased"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-slate-400"
              />
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              onClick={() => void saveExpense()}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
              style={{ background: 'var(--accent)' }}
            >
              <Icon name="plus" className="h-4 w-4" />
              {saving ? 'Saving…' : editingId ? 'Save Changes' : 'Add Expense'}
            </button>
            {editingId && (
              <button
                onClick={resetForm}
                className="rounded-lg px-4 py-2.5 text-sm font-medium text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
              >
                Cancel
              </button>
            )}
            {subtotalInput && (
              <span className="text-sm text-slate-500">
                Total with tax:{' '}
                <span className="font-semibold text-slate-900">
                  {fmtMoney(Number(subtotalInput || 0) + Number(taxInput || 0))}
                </span>
              </span>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="mb-6 grid gap-3 md:grid-cols-4">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search supplier or description"
            className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-slate-400"
          />
          <select
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-400"
          >
            <option value="all">All Categories</option>
            {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <input
            type="date"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-400"
          />
          <input
            type="date"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-400"
          />
        </div>

        {/* Table */}
        <div className="overflow-hidden rounded-xl bg-white ring-1 ring-slate-200">
          {loading ? (
            <div className="p-10 text-center text-sm text-slate-500">Loading expenses…</div>
          ) : filtered.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">
              {expenses.length === 0 ? 'No expenses recorded yet — add the first one above.' : 'No expenses match the filters.'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">Supplier</th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">Category</th>
                    <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wide text-slate-500">Before Tax</th>
                    <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wide text-slate-500">{CLIENT_CONFIG.taxLabel}</th>
                    <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wide text-slate-500">Total</th>
                    <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wide text-slate-500">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map(e => (
                    <tr key={e.id} className="hover:bg-slate-50/80">
                      <td className="px-4 py-3 text-sm text-slate-700 whitespace-nowrap">{fmtDate(e.expense_date)}</td>
                      <td className="px-4 py-3 text-sm">
                        <div className="font-semibold text-slate-900">{e.supplier || '—'}</div>
                        {e.description && <div className="mt-0.5 text-xs text-slate-500">{e.description}</div>}
                      </td>
                      <td className="px-4 py-3 text-xs whitespace-nowrap">
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-600">{e.category || '—'}</span>
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-slate-700 whitespace-nowrap">{fmtMoney(e.subtotal)}</td>
                      <td className="px-4 py-3 text-right text-sm text-blue-600 whitespace-nowrap">{fmtMoney(e.tax_amount)}</td>
                      <td className="px-4 py-3 text-right text-sm font-bold text-slate-900 whitespace-nowrap">{fmtMoney(e.total)}</td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <button
                          onClick={() => startEdit(e)}
                          className="mr-2 rounded-lg px-3 py-1.5 text-xs font-medium text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => void deleteExpense(e)}
                          className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-100"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </>
    </AppShell>
  )
}
