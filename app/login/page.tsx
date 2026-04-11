'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const router = useRouter()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleLogin(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const supabase = createClient()

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (signInError) {
      setError(signInError.message)
      setLoading(false)
      return
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      setError(userError?.message || 'Could not load signed in user.')
      setLoading(false)
      return
    }

    let linkedDriverId: string | null = null

    const { data: driverByAuth, error: driverByAuthError } = await supabase
      .from('drivers')
      .select('id, auth_user_id, email')
      .eq('auth_user_id', user.id)
      .maybeSingle()

    if (driverByAuthError) {
      setError(driverByAuthError.message)
      setLoading(false)
      return
    }

    if (driverByAuth?.id) {
      linkedDriverId = driverByAuth.id
    } else {
      const normalizedEmail = (user.email || '').trim().toLowerCase()

      if (normalizedEmail) {
        const { data: driverByEmail, error: driverByEmailError } = await supabase
          .from('drivers')
          .select('id, auth_user_id, email')
          .ilike('email', normalizedEmail)
          .maybeSingle()

        if (driverByEmailError) {
          setError(driverByEmailError.message)
          setLoading(false)
          return
        }

        if (driverByEmail?.id) {
          const { error: linkError } = await supabase
            .from('drivers')
            .update({
              auth_user_id: user.id,
              last_login_at: new Date().toISOString(),
            })
            .eq('id', driverByEmail.id)

          if (linkError) {
            setError(linkError.message)
            setLoading(false)
            return
          }

          linkedDriverId = driverByEmail.id
        }
      }
    }

    if (linkedDriverId) {
      router.push('/driver')
      router.refresh()
      return
    }

    router.push('/dashboard')
    router.refresh()
  }

  return (
    <div className="min-h-screen bg-slate-950">
      <div className="grid min-h-screen lg:grid-cols-2">
        <div className="relative hidden overflow-hidden lg:flex">
          <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-950" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.10),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.18),transparent_30%)]" />

          <div className="relative z-10 flex h-full w-full flex-col justify-between p-10 text-white">
            <div>
              <div className="flex items-center gap-3">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-lg font-bold text-slate-900 shadow-lg">
                  ST
                </div>
                <div>
                  <div className="text-2xl font-bold tracking-tight">SIMPLIITRASH</div>
                  <div className="text-sm text-slate-300">Professional Operations Suite</div>
                </div>
              </div>
            </div>

            <div className="max-w-xl">
              <div className="inline-flex rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-200 backdrop-blur">
                Waste Operations Platform
              </div>

              <h1 className="mt-6 text-5xl font-bold leading-tight tracking-tight">
                Dispatch, drivers, bins, and jobs in one clean system.
              </h1>

              <p className="mt-5 max-w-lg text-base leading-7 text-slate-300">
                Run SIMPLIITRASH with a modern dashboard built for scheduling,
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

            <div className="text-sm text-slate-400">
              SIMPLIITRASH Secure Access
            </div>
          </div>
        </div>

        <div className="flex items-center justify-center bg-slate-100 px-4 py-10 sm:px-6 lg:px-10">
          <div className="w-full max-w-md">
            <div className="mb-8 text-center lg:hidden">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-900 text-lg font-bold text-white shadow-sm">
                ST
              </div>
              <h1 className="mt-4 text-3xl font-bold tracking-tight text-slate-900">
                SIMPLIITRASH
              </h1>
              <p className="mt-2 text-sm text-slate-500">
                Professional Operations Suite
              </p>
            </div>

            <div className="rounded-3xl bg-white p-8 shadow-xl ring-1 ring-slate-200">
              <div className="mb-6">
                <h2 className="text-2xl font-bold tracking-tight text-slate-900">
                  Welcome back
                </h2>
                <p className="mt-2 text-sm text-slate-500">
                  Sign in to access your dashboard or driver route.
                </p>
              </div>

              <form onSubmit={handleLogin} className="space-y-5">
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700">
                    Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@simpliitrash.com"
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-slate-400"
                    required
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700">
                    Password
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-slate-400"
                    required
                  />
                </div>

                {error ? (
                  <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    {error}
                  </div>
                ) : null}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loading ? 'Signing in...' : 'Sign In'}
                </button>
              </form>

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