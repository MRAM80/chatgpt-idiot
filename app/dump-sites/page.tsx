'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import AppLogo from '@/components/AppLogo'

type DumpSite = {
  id: string
  name: string | null
  address: string | null
  notes?: string | null
}

const empty = (): Omit<DumpSite, 'id'> => ({ name: '', address: '', notes: '' })

export default function DumpSitesPage() {
  const supabase = createClient()
  const router = useRouter()

  const [sites, setSites] = useState<DumpSite[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [form, setForm] = useState(empty())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      await load()
    }
    void init()
  }, [])

  async function load() {
    setLoading(true)
    const { data, error: err } = await supabase
      .from('dump_sites')
      .select('id,name,address,notes')
      .order('name', { ascending: true })
    if (err) setError(err.message)
    setSites((data as DumpSite[]) || [])
    setLoading(false)
  }

  function startEdit(site: DumpSite) {
    setEditingId(site.id)
    setForm({ name: site.name || '', address: site.address || '', notes: site.notes || '' })
    setError('')
  }

  function cancelEdit() {
    setEditingId(null)
    setForm(empty())
    setError('')
  }

  async function save() {
    if (!form.name?.trim()) { setError('Name is required.'); return }
    if (!form.address?.trim()) { setError('Address is required.'); return }
    setSaving(true)
    setError('')

    const payload = { name: form.name.trim(), address: form.address.trim(), notes: form.notes?.trim() || null }

    if (editingId) {
      const { error: err } = await supabase.from('dump_sites').update(payload).eq('id', editingId)
      if (err) { setError(err.message); setSaving(false); return }
    } else {
      const { error: err } = await supabase.from('dump_sites').insert([payload])
      if (err) { setError(err.message); setSaving(false); return }
    }

    setSaving(false)
    cancelEdit()
    await load()
  }

  async function remove(id: string, name: string | null) {
    if (!confirm(`Delete dump site "${name}"? This cannot be undone.`)) return
    const { error: err } = await supabase.from('dump_sites').delete().eq('id', id)
    if (err) { setError(err.message); return }
    setSites(prev => prev.filter(s => s.id !== id))
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="mx-auto max-w-3xl p-4 md:p-6">

        {/* Header */}
        <div className="mb-6 rounded-3xl bg-gradient-to-r from-slate-950 via-slate-900 to-slate-800 p-6 text-white shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <AppLogo className="h-9 w-auto" />
              <div>
                <h1 className="text-2xl font-bold tracking-tight">Dump Sites</h1>
                <p className="mt-0.5 text-sm text-slate-400">Manage dump locations for driver routes</p>
              </div>
            </div>
            <Link href="/settings" className="inline-flex items-center gap-2 rounded-2xl border border-slate-600 bg-slate-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-700">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" /></svg>
              Settings
            </Link>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
        )}

        {/* Add / Edit form */}
        <div className="mb-6 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <h2 className="mb-4 text-base font-bold text-slate-900">{editingId ? 'Edit Dump Site' : 'Add Dump Site'}</h2>
          <div className="flex flex-col gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Name *</label>
                <input
                  value={form.name || ''}
                  onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                  placeholder="e.g. Yard, Landfill North"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Address *</label>
                <input
                  value={form.address || ''}
                  onChange={e => setForm(p => ({ ...p, address: e.target.value }))}
                  placeholder="Full address"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Notes (optional)</label>
              <input
                value={form.notes || ''}
                onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                placeholder="Hours, access instructions, etc."
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={save}
                disabled={saving}
                className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
              >
                {saving ? 'Saving…' : editingId ? 'Save Changes' : 'Add Dump Site'}
              </button>
              {editingId && (
                <button onClick={cancelEdit} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                  Cancel
                </button>
              )}
            </div>
          </div>
        </div>

        {/* List */}
        <div className="rounded-3xl bg-white shadow-sm ring-1 ring-slate-200">
          <div className="border-b border-slate-200 px-6 py-4">
            <h2 className="text-base font-bold text-slate-900">Dump Sites <span className="ml-2 text-sm font-normal text-slate-500">{sites.length} total</span></h2>
          </div>
          {loading ? (
            <div className="p-10 text-center text-sm text-slate-500">Loading…</div>
          ) : sites.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">No dump sites yet. Add one above.</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {sites.map(site => (
                <div key={site.id} className="flex items-center justify-between gap-4 px-6 py-4">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900">{site.name}</p>
                    <p className="text-sm text-slate-500 truncate">{site.address}</p>
                    {site.notes && <p className="text-xs text-slate-400 mt-0.5">{site.notes}</p>}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button onClick={() => startEdit(site)} className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Edit</button>
                    <button onClick={() => remove(site.id, site.name)} className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-sm font-semibold text-rose-700 hover:bg-rose-100">Delete</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
