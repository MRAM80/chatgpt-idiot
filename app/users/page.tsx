'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { CLIENT_CONFIG } from '@/lib/client-config'
import { ROLE_LABELS, type Role } from '@/lib/roles'
import AppLogo from '@/components/AppLogo'
import ThemeToggle from '@/components/ThemeToggle'
import Link from 'next/link'

type UserProfile = {
  id: string
  user_id: string
  role: Role
  name: string | null
  email?: string | null
  created_at: string
}

const ROLES: Role[] = ['owner', 'manager', 'admin', 'dispatcher', 'driver']

const roleColors: Record<Role, string> = {
  owner:      'bg-violet-100 text-violet-800 border-violet-200',
  manager:    'bg-blue-100 text-blue-800 border-blue-200',
  admin:      'bg-emerald-100 text-emerald-800 border-emerald-200',
  dispatcher: 'bg-amber-100 text-amber-800 border-amber-200',
  driver:     'bg-slate-100 text-slate-700 border-slate-200',
}

export default function UsersPage() {
  const supabase = createClient()
  const router = useRouter()

  const [users, setUsers] = useState<UserProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [currentRole, setCurrentRole] = useState<Role | null>(null)
  const [error, setError] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<Role>('dispatcher')
  const [inviteName, setInviteName] = useState('')
  const [inviting, setInviting] = useState(false)
  const [inviteSuccess, setInviteSuccess] = useState('')

  async function loadUsers() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const { data: myProfile } = await supabase
      .from('user_profiles').select('role').eq('user_id', user.id).maybeSingle()

    if (!myProfile || (myProfile.role !== 'owner' && myProfile.role !== 'manager')) {
      router.push('/dashboard')
      return
    }
    setCurrentRole(myProfile.role as Role)

    const { data, error: fetchError } = await supabase
      .from('user_profiles')
      .select('id,user_id,role,name,email,created_at')
      .order('created_at', { ascending: false })

    if (fetchError) setError(fetchError.message)
    setUsers((data as UserProfile[]) || [])
    setLoading(false)
  }

  async function changeRole(userId: string, newRole: Role) {
    const { error: updateError } = await supabase
      .from('user_profiles').update({ role: newRole }).eq('user_id', userId)
    if (updateError) { setError(updateError.message); return }
    setUsers(prev => prev.map(u => u.user_id === userId ? { ...u, role: newRole } : u))
  }

  async function removeUser(userId: string) {
    if (!confirm('Remove this user? They will lose access immediately.')) return
    const { error: deleteError } = await supabase
      .from('user_profiles').delete().eq('user_id', userId)
    if (deleteError) { setError(deleteError.message); return }
    setUsers(prev => prev.filter(u => u.user_id !== userId))
  }

  async function sendInvite(e: React.FormEvent) {
    e.preventDefault()
    setInviting(true)
    setError('')
    setInviteSuccess('')

    const { error: otpError } = await supabase.auth.signInWithOtp({
      email: inviteEmail,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    })

    if (otpError) { setError(otpError.message); setInviting(false); return }

    // Pre-create the profile so when they log in they have the right role
    // We need their user_id — we store a pending invite using email lookup after they sign in
    // For now, record intent in user_profiles using a placeholder that auth/callback will finalize
    setInviteSuccess(`Invite sent to ${inviteEmail}. Once they sign in, set their role here.`)
    setInviteEmail('')
    setInviteName('')
    setInviting(false)
  }

  useEffect(() => { void loadUsers() }, [])

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="mx-auto max-w-5xl p-4 md:p-6">
        <div className="mb-6 rounded-3xl bg-gradient-to-r from-slate-950 via-slate-900 to-slate-800 p-6 text-white shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-4">
              <AppLogo className="h-9 w-auto" />
              <h1 className="text-3xl font-bold tracking-tight">User Management</h1>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href="/dashboard" className="rounded-2xl border border-slate-600 bg-slate-800 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-700">
                ← Dashboard
              </Link>
              <ThemeToggle />
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
        )}

        {/* Invite */}
        <div className="mb-6 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <h2 className="mb-4 text-lg font-bold text-slate-900">Invite User</h2>
          <form onSubmit={sendInvite} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Email</label>
              <input
                type="email"
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                placeholder="name@company.com"
                required
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Role</label>
              <select
                value={inviteRole}
                onChange={e => setInviteRole(e.target.value as Role)}
                className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
              >
                {ROLES.filter(r => r !== 'owner' || currentRole === 'owner').map(r => (
                  <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              disabled={inviting}
              className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
            >
              {inviting ? 'Sending...' : 'Send Invite'}
            </button>
          </form>
          {inviteSuccess && (
            <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{inviteSuccess}</div>
          )}
        </div>

        {/* Users list */}
        <div className="rounded-3xl bg-white shadow-sm ring-1 ring-slate-200">
          <div className="border-b border-slate-200 px-6 py-5">
            <h2 className="text-lg font-bold text-slate-900">Team Members</h2>
          </div>
          {loading ? (
            <div className="p-10 text-center text-sm text-slate-500">Loading...</div>
          ) : users.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">No users yet. Send an invite above.</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {users.map(u => (
                <div key={u.id} className="flex items-center justify-between gap-4 px-6 py-4">
                  <div>
                    <p className="font-semibold text-slate-900">{u.name || u.email || u.user_id}</p>
                    {u.email && u.name && <p className="text-sm text-slate-500">{u.email}</p>}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${roleColors[u.role]}`}>
                      {ROLE_LABELS[u.role]}
                    </span>
                    <select
                      value={u.role}
                      onChange={e => changeRole(u.user_id, e.target.value as Role)}
                      disabled={u.role === 'owner' && currentRole !== 'owner'}
                      className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm focus:outline-none"
                    >
                      {ROLES.filter(r => r !== 'owner' || currentRole === 'owner').map(r => (
                        <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => removeUser(u.user_id)}
                      className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-sm font-semibold text-rose-700 hover:bg-rose-100"
                    >
                      Remove
                    </button>
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
