'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { CLIENT_CONFIG } from '@/lib/client-config'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function redirectAfterLogin() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const { data: driver } = await supabase
      .from('drivers').select('id').eq('auth_user_id', user.id).maybeSingle()
    if (driver?.id) {
      // Fresh login ends an overnight park or logout — driver is back on duty
      await supabase.from('drivers').update({ status: 'available' }).eq('id', driver.id).in('status', ['parked', 'offline'])
      router.push('/driver'); router.refresh(); return
    }

    const { data: driverByEmail } = await supabase
      .from('drivers').select('id').ilike('email', (user.email || '').toLowerCase()).maybeSingle()
    if (driverByEmail?.id) {
      await supabase.from('drivers').update({ auth_user_id: user.id, last_login_at: new Date().toISOString() }).eq('id', driverByEmail.id)
      await supabase.from('drivers').update({ status: 'available' }).eq('id', driverByEmail.id).in('status', ['parked', 'offline'])
      router.push('/driver'); router.refresh(); return
    }

    const { data: profile } = await supabase.from('user_profiles').select('role').eq('user_id', user.id).maybeSingle()
    router.push(profile?.role === 'dispatcher' ? '/dispatch' : '/dashboard')
    router.refresh()
  }

  async function handleLogin(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const supabase = createClient()
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
    if (signInError) { setError(signInError.message); setLoading(false); return }

    if (!rememberMe) sessionStorage.setItem('no-persist', '1')

    await redirectAfterLogin()
  }

  // ── Main login form ───────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-950">
      <div className="grid min-h-screen lg:grid-cols-2">

        {/* Hero panel */}
        <div className="relative hidden overflow-hidden lg:flex">
          <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-950" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.10),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.18),transparent_30%)]" />
          <div className="relative z-10 flex h-full w-full flex-col justify-between p-10 text-white">
            <div>
              <div className="flex items-center gap-4">
                {CLIENT_CONFIG.logoUrl
                  ? <img src={CLIENT_CONFIG.logoUrl} alt={CLIENT_CONFIG.shortName} className="h-24 w-auto object-contain" />
                  : <span className="text-2xl font-bold text-white">{CLIENT_CONFIG.name}</span>}
                {CLIENT_CONFIG.logoUrl && CLIENT_CONFIG.tagline && (
                  <span className="text-5xl font-bold tracking-tight" style={{ color: CLIENT_CONFIG.secondaryColor }}>
                    {CLIENT_CONFIG.tagline}
                  </span>
                )}
              </div>
            </div>
            <div className="max-w-xl">
              <div className="inline-flex rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-200 backdrop-blur">
                Operations Platform
              </div>
              <h1 className="mt-6 text-5xl font-bold leading-tight tracking-tight">
                Dispatch, drivers, bins, and jobs in one clean system.
              </h1>
              <p className="mt-5 max-w-lg text-base leading-7 text-slate-300">
                Run {CLIENT_CONFIG.name} with a modern dashboard built for scheduling,
                real-time dispatching, driver control, and organized customer management.
              </p>
              <div className="mt-8 grid gap-4 sm:grid-cols-3">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
                  <div className="text-2xl font-bold">Real-time</div>
                  <div className="mt-1 text-sm text-slate-300">Live operational updates</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
                  <div className="text-2xl font-bold">Dispatch</div>
                  <div className="mt-1 text-sm text-slate-300">Faster assignments</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
                  <div className="text-2xl font-bold">Control</div>
                  <div className="mt-1 text-sm text-slate-300">Cleaner workflow</div>
                </div>
              </div>
            </div>
            <div className="text-sm text-slate-400">{CLIENT_CONFIG.name} Secure Access</div>
          </div>
        </div>

        {/* Login panel */}
        <div className="flex items-center justify-center bg-slate-100 px-4 py-10 sm:px-6 lg:px-10">
          <div className="w-full max-w-md">
            <div className="mb-8 flex justify-center lg:hidden">
              {CLIENT_CONFIG.logoUrl
                ? <img src={CLIENT_CONFIG.logoUrl} alt={CLIENT_CONFIG.shortName} className="h-16 w-auto object-contain" />
                : <span className="text-2xl font-bold text-slate-900">{CLIENT_CONFIG.name}</span>}
            </div>

            <div className="rounded-3xl bg-white p-8 shadow-xl ring-1 ring-slate-200">
              <div className="mb-7">
                <h2 className="text-2xl font-bold tracking-tight text-slate-900">Sign in</h2>
                <p className="mt-1 text-sm text-slate-500">Access your {CLIENT_CONFIG.name} account.</p>
              </div>

              {error && (
                <div className="mb-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
              )}

              <form onSubmit={handleLogin} className="space-y-5">
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700">Username</label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder={CLIENT_CONFIG.emailPlaceholder}
                    autoComplete="username email"
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-slate-400 focus:bg-white transition"
                    required
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700">Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-slate-400 focus:bg-white transition"
                    required
                  />
                </div>
                <div className="flex items-center gap-2">
                  <input
                    id="remember"
                    type="checkbox"
                    checked={rememberMe}
                    onChange={e => setRememberMe(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 accent-slate-900 cursor-pointer"
                  />
                  <label htmlFor="remember" className="text-sm text-slate-600 cursor-pointer select-none">
                    Remember me
                  </label>
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loading ? 'Signing in...' : 'Sign In'}
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
