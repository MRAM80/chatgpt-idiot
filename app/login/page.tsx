'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { CLIENT_CONFIG } from '@/lib/client-config'

type Tab = 'google' | 'magic' | 'password'

export default function LoginPage() {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('google')

  // Email/password
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [magicEmail, setMagicEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [magicSent, setMagicSent] = useState(false)

  async function handleGoogle() {
    setLoading(true)
    setError('')
    const supabase = createClient()
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
    if (oauthError) { setError(oauthError.message); setLoading(false) }
  }

  async function handleMagicLink(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const supabase = createClient()
    const { error: mlError } = await supabase.auth.signInWithOtp({
      email: magicEmail,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    })
    if (mlError) { setError(mlError.message) } else { setMagicSent(true) }
    setLoading(false)
  }

  async function handlePassword(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const supabase = createClient()

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
    if (signInError) { setError(signInError.message); setLoading(false); return }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setError('Could not load user.'); setLoading(false); return }

    // Check driver
    const { data: driverByAuth } = await supabase
      .from('drivers').select('id').eq('auth_user_id', user.id).maybeSingle()

    if (driverByAuth?.id) { router.push('/driver'); router.refresh(); return }

    const { data: driverByEmail } = await supabase
      .from('drivers').select('id').ilike('email', (user.email || '').toLowerCase()).maybeSingle()

    if (driverByEmail?.id) {
      await supabase.from('drivers').update({ auth_user_id: user.id, last_login_at: new Date().toISOString() }).eq('id', driverByEmail.id)
      router.push('/driver'); router.refresh(); return
    }

    // Check role
    const { data: profile } = await supabase.from('user_profiles').select('role').eq('user_id', user.id).maybeSingle()
    if (profile?.role === 'dispatcher') { router.push('/dispatch') } else { router.push('/dashboard') }
    router.refresh()
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'google', label: 'Google' },
    { id: 'magic', label: 'Magic Link' },
    { id: 'password', label: 'Password' },
  ]

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
              <div className="mb-6">
                <h2 className="text-2xl font-bold tracking-tight text-slate-900">Welcome back</h2>
                <p className="mt-2 text-sm text-slate-500">Sign in to access your dashboard or driver route.</p>
              </div>

              {/* Tabs */}
              <div className="mb-6 flex rounded-2xl bg-slate-100 p-1">
                {tabs.map(t => (
                  <button
                    key={t.id}
                    onClick={() => { setTab(t.id); setError(''); setMagicSent(false) }}
                    className={`flex-1 rounded-xl py-2 text-sm font-semibold transition ${
                      tab === t.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {error && (
                <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {error}
                </div>
              )}

              {/* Google */}
              {tab === 'google' && (
                <div className="space-y-4">
                  <p className="text-sm text-slate-500">Recommended for owners, managers, admins, and dispatchers.</p>
                  <button
                    onClick={handleGoogle}
                    disabled={loading}
                    className="flex w-full items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
                  >
                    <svg className="h-5 w-5" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                    {loading ? 'Redirecting...' : 'Continue with Google'}
                  </button>
                </div>
              )}

              {/* Magic Link */}
              {tab === 'magic' && (
                magicSent ? (
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-6 text-center">
                    <div className="text-2xl mb-2">📧</div>
                    <p className="font-semibold text-emerald-800">Check your email</p>
                    <p className="mt-1 text-sm text-emerald-600">We sent a sign-in link to <strong>{magicEmail}</strong></p>
                  </div>
                ) : (
                  <form onSubmit={handleMagicLink} className="space-y-4">
                    <p className="text-sm text-slate-500">For drivers — enter your email and we'll send a sign-in link. No password needed.</p>
                    <div>
                      <label className="mb-2 block text-sm font-semibold text-slate-700">Email</label>
                      <input
                        type="email"
                        value={magicEmail}
                        onChange={e => setMagicEmail(e.target.value)}
                        placeholder={CLIENT_CONFIG.emailPlaceholder}
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-slate-400"
                        required
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
                    >
                      {loading ? 'Sending...' : 'Send Magic Link'}
                    </button>
                  </form>
                )
              )}

              {/* Password */}
              {tab === 'password' && (
                <form onSubmit={handlePassword} className="space-y-5">
                  <p className="text-sm text-slate-500">Email and password sign-in.</p>
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-700">Email</label>
                    <input
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder={CLIENT_CONFIG.emailPlaceholder}
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-slate-400"
                      required
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-700">Password</label>
                    <input
                      type="password"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-slate-400"
                      required
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
                  >
                    {loading ? 'Signing in...' : 'Sign In'}
                  </button>
                </form>
              )}

              <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">
                Secure access for dispatch managers and drivers.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
