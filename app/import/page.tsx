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

type Mode = 'customers' | 'products'

type ParsedTable = { headers: string[]; rows: string[][] }

type FieldDef = { key: string; label: string; required?: boolean; aliases: string[] }

// Column names we try to recognise automatically. QuickBooks Desktop's
// "Customer Contact List" and "Item Listing" exports are the main targets,
// but the aliases are loose enough to catch hand-made spreadsheets too.
const FIELDS: Record<Mode, FieldDef[]> = {
  customers: [
    { key: 'name', label: 'Customer name', required: true, aliases: ['customer', 'name', 'customer name', 'company', 'company name', 'client', 'full name', 'bill to'] },
    { key: 'phone', label: 'Phone', aliases: ['phone', 'main phone', 'telephone', 'tel', 'phone number', 'mobile', 'cell'] },
    { key: 'email', label: 'Email', aliases: ['email', 'main email', 'e-mail', 'email address'] },
    { key: 'address', label: 'Address', aliases: ['address', 'bill to', 'billing address', 'street', 'ship to', 'full address', 'bill to 1'] },
  ],
  products: [
    { key: 'name', label: 'Product / service name', required: true, aliases: ['item', 'name', 'product', 'service', 'item name', 'description', 'product name'] },
    { key: 'price', label: 'Price', required: true, aliases: ['price', 'rate', 'sales price', 'amount', 'unit price', 'cost', 'price/rate'] },
    { key: 'unit', label: 'Unit', aliases: ['unit', 'u/m', 'uom', 'unit of measure', 'per'] },
  ],
}

const UNIT_FALLBACK = 'each'

/** Minimal CSV/TSV parser — handles quoted fields, embedded commas and newlines. */
function parseDelimited(text: string): ParsedTable | null {
  const trimmed = text.trim()
  if (!trimmed) return null

  // Excel copy-paste gives tabs; downloaded exports give commas.
  const firstLine = trimmed.split('\n')[0]
  const delimiter = firstLine.split('\t').length > firstLine.split(',').length ? '\t' : ','

  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < trimmed.length; i++) {
    const c = trimmed[i]
    if (inQuotes) {
      if (c === '"') {
        if (trimmed[i + 1] === '"') { field += '"'; i++ } else { inQuotes = false }
      } else field += c
      continue
    }
    if (c === '"') { inQuotes = true; continue }
    if (c === delimiter) { row.push(field); field = ''; continue }
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue }
    if (c === '\r') continue
    field += c
  }
  row.push(field)
  rows.push(row)

  const cleaned = rows
    .map(r => r.map(c => c.trim()))
    .filter(r => r.some(c => c !== ''))

  if (cleaned.length < 2) return null
  const headers = cleaned[0]
  return { headers, rows: cleaned.slice(1).filter(r => r.length >= 1) }
}

function autoMap(headers: string[], fields: FieldDef[]): Record<string, number> {
  const map: Record<string, number> = {}
  const norm = headers.map(h => h.toLowerCase().replace(/[^a-z0-9 /]/g, '').trim())
  for (const field of fields) {
    // Exact alias match first, then "header contains alias"
    let idx = norm.findIndex(h => field.aliases.includes(h))
    if (idx === -1) idx = norm.findIndex(h => h && field.aliases.some(a => h === a || h.startsWith(a)))
    if (idx === -1) idx = norm.findIndex(h => h && field.aliases.some(a => h.includes(a)))
    if (idx !== -1 && !Object.values(map).includes(idx)) map[field.key] = idx
  }
  return map
}

function parseMoney(raw: string): number | null {
  if (!raw) return null
  const cleaned = raw.replace(/[$,\s]/g, '')
  if (!cleaned) return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

export default function ImportPage() {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const { role, loading: roleLoading } = useRole()

  const [mode, setMode] = useState<Mode>('customers')
  const [raw, setRaw] = useState('')
  const [parsed, setParsed] = useState<ParsedTable | null>(null)
  const [mapping, setMapping] = useState<Record<string, number>>({})
  const [existingNames, setExistingNames] = useState<Set<string>>(new Set())
  const [importing, setImporting] = useState(false)
  const [pageError, setPageError] = useState('')
  const [result, setResult] = useState<{ created: number; skipped: number } | null>(null)

  useEffect(() => {
    if (!roleLoading && role !== null && !can(role, 'canViewReports')) {
      router.push(role === 'driver' ? '/driver' : '/dispatch')
    }
  }, [roleLoading, role])

  // Existing records so the preview can flag duplicates before anything is written
  useEffect(() => {
    async function loadExisting() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      if (mode === 'customers') {
        const { data } = await supabase.from('customers').select('name')
        setExistingNames(new Set(((data as { name: string | null }[]) || []).map(c => (c.name || '').toLowerCase().trim())))
      } else {
        const { data } = await supabase.from('price_book').select('name').eq('kind', 'product')
        setExistingNames(new Set(((data as { name: string | null }[]) || []).map(p => (p.name || '').toLowerCase().trim())))
      }
    }
    void loadExisting()
  }, [mode])

  const fields = FIELDS[mode]

  function analyse(text: string) {
    setPageError('')
    setResult(null)
    const table = parseDelimited(text)
    if (!table) {
      setParsed(null)
      setPageError('Could not read that — make sure the first row is the column headings, with one record per line.')
      return
    }
    setParsed(table)
    setMapping(autoMap(table.headers, fields))
  }

  function onPaste(text: string) {
    setRaw(text)
    if (text.trim()) analyse(text)
    else { setParsed(null); setResult(null) }
  }

  async function onFile(file: File) {
    const text = await file.text()
    setRaw(text)
    analyse(text)
  }

  // Rows turned into records, with duplicates and unusable rows flagged
  const preview = useMemo(() => {
    if (!parsed) return []
    const nameIdx = mapping.name
    if (nameIdx === undefined) return []

    const seen = new Set<string>()
    return parsed.rows.map(row => {
      const name = (row[nameIdx] || '').trim()
      const key = name.toLowerCase()
      const values: Record<string, string> = {}
      for (const f of fields) {
        const idx = mapping[f.key]
        values[f.key] = idx === undefined ? '' : (row[idx] || '').trim()
      }

      let status: 'new' | 'duplicate' | 'invalid' = 'new'
      let note = ''

      if (!name) { status = 'invalid'; note = 'No name' }
      else if (existingNames.has(key)) { status = 'duplicate'; note = 'Already in the system' }
      else if (seen.has(key)) { status = 'duplicate'; note = 'Repeated in this file' }
      else if (mode === 'products' && parseMoney(values.price) === null) { status = 'invalid'; note = 'No usable price' }

      if (status === 'new') seen.add(key)
      return { name, values, status, note }
    })
  }, [parsed, mapping, existingNames, mode, fields])

  const counts = useMemo(() => ({
    total: preview.length,
    create: preview.filter(p => p.status === 'new').length,
    duplicate: preview.filter(p => p.status === 'duplicate').length,
    invalid: preview.filter(p => p.status === 'invalid').length,
  }), [preview])

  async function runImport() {
    setPageError('')
    const toCreate = preview.filter(p => p.status === 'new')
    if (toCreate.length === 0) { setPageError('Nothing new to import.'); return }

    setImporting(true)
    if (mode === 'customers') {
      const rows = toCreate.map(p => ({
        name: p.name,
        phone: p.values.phone || null,
        email: p.values.email || null,
        address: p.values.address || null,
        status: 'active',
      }))
      const { error } = await supabase.from('customers').insert(rows)
      if (error) { setPageError(error.message); setImporting(false); return }
    } else {
      const rows = toCreate.map(p => ({
        kind: 'product' as const,
        name: p.name,
        unit: p.values.unit || UNIT_FALLBACK,
        price: parseMoney(p.values.price) ?? 0,
      }))
      const { error } = await supabase.from('price_book').insert(rows)
      if (error) { setPageError(error.message); setImporting(false); return }
    }

    setImporting(false)
    setResult({ created: toCreate.length, skipped: counts.duplicate + counts.invalid })
    setRaw('')
    setParsed(null)
    // Refresh the duplicate set so a second run recognises what we just added
    setExistingNames(current => {
      const next = new Set(current)
      toCreate.forEach(p => next.add(p.name.toLowerCase()))
      return next
    })
  }

  const modeLabel = mode === 'customers' ? 'customers' : 'products'

  return (
    <AppShell
      title="Import Data"
      subtitle="Bring customers and prices in from QuickBooks or a spreadsheet"
      maxWidth="max-w-5xl"
    >
      <>
        {/* How-to */}
        <div className="mb-6 rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="text-base font-semibold text-slate-900">How to get your data out of QuickBooks</h2>
          <ol className="mt-3 space-y-1.5 text-sm leading-relaxed text-slate-600">
            <li><span className="font-semibold text-slate-800">1.</span> In QuickBooks Desktop, open <strong>Reports → List → {mode === 'customers' ? 'Customer Contact List' : 'Item Listing'}</strong>.</li>
            <li><span className="font-semibold text-slate-800">2.</span> Click <strong>Excel → Create New Worksheet → Export</strong>.</li>
            <li><span className="font-semibold text-slate-800">3.</span> In Excel, select everything (including the heading row) and copy.</li>
            <li><span className="font-semibold text-slate-800">4.</span> Paste it into the box below — or save as CSV and choose the file.</li>
          </ol>
          <p className="mt-3 text-xs text-slate-500">
            Nothing is saved until you review the preview and press Import. Exporting from QuickBooks doesn&apos;t change anything in it.
          </p>
        </div>

        {/* Mode */}
        <div className="mb-6 flex flex-wrap gap-3">
          {([
            { id: 'customers' as const, label: 'Customers', icon: 'customers' as const },
            { id: 'products' as const, label: 'Products & Prices', icon: 'price' as const },
          ]).map(m => (
            <button
              key={m.id}
              onClick={() => { setMode(m.id); setRaw(''); setParsed(null); setResult(null); setPageError('') }}
              className={`inline-flex items-center gap-2.5 rounded-xl px-5 py-3 text-sm font-semibold transition ${
                mode === m.id
                  ? 'text-white shadow-sm'
                  : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:ring-[var(--accent-ring)]'
              }`}
              style={mode === m.id ? { background: 'var(--accent)' } : undefined}
            >
              <Icon name={m.icon} className="h-4 w-4" />
              {m.label}
            </button>
          ))}
        </div>

        {pageError ? (
          <div className="mb-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{pageError}</div>
        ) : null}

        {result ? (
          <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-800">
            ✓ Imported <strong>{result.created}</strong> {modeLabel}
            {result.skipped > 0 && <> · skipped {result.skipped} (duplicates or missing data)</>}.{' '}
            <Link
              href={mode === 'customers' ? '/customers' : '/prices'}
              className="font-bold underline hover:text-emerald-900"
            >
              View {mode === 'customers' ? 'customers' : 'price book'} →
            </Link>
          </div>
        ) : null}

        {/* Input */}
        <div className="mb-6 rounded-xl bg-white p-6 ring-1 ring-slate-200">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-slate-900">Paste your {modeLabel}</h2>
            <label className="cursor-pointer rounded-lg px-3 py-2 text-sm font-medium text-slate-600 ring-1 ring-slate-200 transition hover:bg-slate-50 hover:text-slate-900">
              Choose a CSV file
              <input
                type="file"
                accept=".csv,.txt,.tsv,text/csv,text/plain"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) void onFile(f) }}
              />
            </label>
          </div>
          <textarea
            value={raw}
            onChange={e => onPaste(e.target.value)}
            rows={6}
            placeholder={
              mode === 'customers'
                ? 'Customer\tMain Phone\tMain Email\tBill to\nAcme Construction\t416 555 0100\tinfo@acme.ca\t12 King St, Toronto'
                : 'Item\tDescription\tPrice\nTriple Mix Soil\tPer yard\t45.00'
            }
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-3 font-mono text-xs text-slate-900 outline-none placeholder:text-slate-300 focus:border-slate-400"
          />
        </div>

        {/* Mapping + preview */}
        {parsed && (
          <>
            <div className="mb-6 rounded-xl bg-white p-6 ring-1 ring-slate-200">
              <h2 className="mb-1 text-base font-semibold text-slate-900">Check the columns</h2>
              <p className="mb-4 text-sm text-slate-500">
                We matched your headings automatically. Change any that look wrong.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {fields.map(f => (
                  <div key={f.key}>
                    <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500">
                      {f.label}{f.required && <span className="ml-1 text-rose-500">*</span>}
                    </label>
                    <select
                      value={mapping[f.key] ?? -1}
                      onChange={e => {
                        const v = Number(e.target.value)
                        setMapping(m => {
                          const next = { ...m }
                          if (v === -1) delete next[f.key]
                          else next[f.key] = v
                          return next
                        })
                      }}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-400"
                    >
                      <option value={-1}>— not in my file —</option>
                      {parsed.headers.map((h, i) => (
                        <option key={i} value={i}>{h || `Column ${i + 1}`}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
              {mapping.name === undefined && (
                <p className="mt-3 text-sm font-medium text-rose-600">
                  Pick which column holds the name before importing.
                </p>
              )}
            </div>

            {preview.length > 0 && (
              <div className="overflow-hidden rounded-xl bg-white ring-1 ring-slate-200">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-6 py-4">
                  <div>
                    <h2 className="text-base font-semibold text-slate-900">Preview</h2>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {counts.create} to add · {counts.duplicate} already there · {counts.invalid} unusable
                    </p>
                  </div>
                  <button
                    onClick={() => void runImport()}
                    disabled={importing || counts.create === 0}
                    className="inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-40"
                    style={{ background: 'var(--accent)' }}
                  >
                    <Icon name="check" className="h-4 w-4" />
                    {importing ? 'Importing…' : `Import ${counts.create} ${modeLabel}`}
                  </button>
                </div>

                <div className="max-h-[28rem] overflow-auto">
                  <table className="w-full divide-y divide-slate-200">
                    <thead className="sticky top-0 bg-slate-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">Status</th>
                        {fields.map(f => (
                          <th key={f.key} className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                            {f.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {preview.map((p, i) => (
                        <tr key={i} className={p.status === 'new' ? '' : 'bg-slate-50/60'}>
                          <td className="px-4 py-2.5 whitespace-nowrap">
                            <span
                              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                                p.status === 'new'
                                  ? 'bg-emerald-50 text-emerald-700'
                                  : p.status === 'duplicate'
                                    ? 'bg-slate-100 text-slate-500'
                                    : 'bg-rose-50 text-rose-700'
                              }`}
                            >
                              {p.status === 'new' ? 'Will add' : p.note}
                            </span>
                          </td>
                          {fields.map(f => (
                            <td
                              key={f.key}
                              className={`px-4 py-2.5 text-sm ${
                                f.key === 'name' ? 'font-semibold text-slate-900' : 'text-slate-600'
                              }`}
                            >
                              {f.key === 'price' && p.values.price
                                ? `$${(parseMoney(p.values.price) ?? 0).toFixed(2)}`
                                : p.values[f.key] || <span className="text-slate-300">—</span>}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}

        <p className="mt-6 text-xs leading-relaxed text-slate-500">
          Imports only add records — nothing existing is overwritten, and anything already in {CLIENT_CONFIG.name} is skipped.
          Safe to run twice.
        </p>
      </>
    </AppShell>
  )
}
