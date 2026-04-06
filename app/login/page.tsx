'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowRight, Eye, EyeOff, KeyRound, Mail, ShieldCheck, Truck } from 'lucide-react'
import { supabase } from '@/lib/supabase'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [resetMode, setResetMode] = useState(false)

  const redirectBase = useMemo(() => {
    if (typeof window === 'undefined') return ''
    return window.location.origin
  }, [])

  async function handleLogin() {
    setLoading(true)
    setErrorMessage('')
    setSuccessMessage('')

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error || !data.user) {
      setErrorMessage(error?.message || 'Login failed.')
      setLoading(false)
      return
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', data.user.id)
      .single()

    if (profileError || !profile?.role) {
      setErrorMessage('Profile not found. Check the profiles table in Supabase.')
      setLoading(false)
      return
    }

    if (profile.role === 'admin') {
      router.push('/admin')
    } else if (profile.role === 'dispatcher') {
      router.push('/dispatcher')
    } else {
      setErrorMessage('This project currently supports admin and dispatcher access only.')
      await supabase.auth.signOut()
    }

    setLoading(false)
  }

  async function handleResetPassword() {
    setLoading(true)
    setErrorMessage('')
    setSuccessMessage('')

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${redirectBase}/reset-password`,
    })

    if (error) {
      setErrorMessage(error.message)
    } else {
      setSuccessMessage('Reset link sent. Please check your email.')
    }

    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="grid min-h-screen lg:grid-cols-[1.1fr_0.9fr]">
        <section className="hidden bg-gradient-to-br from-emerald-500/20 via-slate-950 to-slate-950 p-10 lg:flex lg:flex-col lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/20 text-emerald-300">
              <Truck className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xl font-bold">SimpliiTrash</p>
              <p className="text-sm text-slate-300">Waste Operations Control</p>
            </div>
          </div>

          <div className="max-w-xl">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-4 py-2 text-sm font-semibold text-emerald-300">
              <ShieldCheck className="h-4 w-4" />
              Built for real dispatch control
            </div>
            <h1 className="text-5xl font-bold leading-tight tracking-tight">
              Tickets, drivers, bins, and dispatch flow in one place.
            </h1>
            <p className="mt-5 max-w-lg text-base text-slate-300">
              Admin controls the full system. Dispatcher focuses on the live operation,
              creates tickets, assigns work, and keeps drivers moving.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Role</p>
              <p className="mt-2 font-semibold">Admin</p>
              <p className="mt-1 text-sm text-slate-300">Full create, edit, and delete access.</p>
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Role</p>
              <p className="mt-2 font-semibold">Dispatcher</p>
              <p className="mt-1 text-sm text-slate-300">Runs operations, tickets, and assignments.</p>
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Focus</p>
              <p className="mt-2 font-semibold">Flow</p>
              <p className="mt-1 text-sm text-slate-300">Live status board for delivery and pickup work.</p>
            </div>
          </div>
        </section>

        <section className="flex items-center justify-center px-4 py-10 sm:px-6 lg:px-10">
          <div className="w-full max-w-md rounded-[28px] border border-white/10 bg-white p-8 text-slate-900 shadow-2xl shadow-black/20">
            <div className="mb-8 lg:hidden">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
                  <Truck className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-xl font-bold">SimpliiTrash</p>
                  <p className="text-sm text-slate-500">Waste Operations Control</p>
                </div>
              </div>
            </div>

            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-emerald-600">
                Welcome back
              </p>
              <h2 className="mt-2 text-3xl font-bold tracking-tight">
                {resetMode ? 'Forgot password' : 'Sign in'}
              </h2>
              <p className="mt-2 text-sm text-slate-500">
                {resetMode
                  ? 'Enter your email and we will send a reset link.'
                  : 'Access admin or dispatcher control.'}
              </p>
            </div>

            {errorMessage ? (
              <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {errorMessage}
              </div>
            ) : null}

            {successMessage ? (
              <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                {successMessage}
              </div>
            ) : null}

            <div className="mt-6 space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Email</label>
                <div className="flex items-center rounded-2xl border border-slate-200 px-4 py-3 focus-within:border-slate-900">
                  <Mail className="mr-3 h-4 w-4 text-slate-400" />
                  <input
                    type="email"
                    placeholder="name@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-transparent text-sm outline-none"
                  />
                </div>
              </div>

              {!resetMode ? (
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">Password</label>
                  <div className="flex items-center rounded-2xl border border-slate-200 px-4 py-3 focus-within:border-slate-900">
                    <KeyRound className="mr-3 h-4 w-4 text-slate-400" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full bg-transparent text-sm outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      className="ml-3 text-slate-400 transition hover:text-slate-700"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              ) : null}

              <button
                onClick={resetMode ? handleResetPassword : handleLogin}
                disabled={loading}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? 'Please wait...' : resetMode ? 'Send reset link' : 'Enter system'}
                {!loading ? <ArrowRight className="h-4 w-4" /> : null}
              </button>
            </div>

            <div className="mt-5 flex items-center justify-between text-sm">
              <button
                type="button"
                onClick={() => {
                  setResetMode((prev) => !prev)
                  setErrorMessage('')
                  setSuccessMessage('')
                }}
                className="font-medium text-slate-600 underline-offset-4 hover:text-slate-950 hover:underline"
              >
                {resetMode ? 'Back to login' : 'Forgot password?'}
              </button>

              <Link href="/login" className="font-medium text-emerald-700">
                Secure access
              </Link>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
