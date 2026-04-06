'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const resetBrokenSession = async () => {
      await supabase.auth.signOut()
    }

    resetBrokenSession()
  }, [])

  const handleLogin = async () => {
    setLoading(true)
    setErrorMessage('')

    await supabase.auth.signOut()

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    })

    if (error || !data.user) {
      setErrorMessage(error?.message || 'Login failed')
      setLoading(false)
      return
    }

    const userEmail = data.user.email?.trim().toLowerCase() || ''

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role, email, is_active')
      .eq('email', userEmail)
      .single()

    if (profileError || !profile) {
      setErrorMessage('Profile not found')
      setLoading(false)
      return
    }

    if (profile.is_active === false) {
      setErrorMessage('Profile is inactive')
      setLoading(false)
      return
    }

    if (profile.role === 'admin') {
      router.push('/admin')
    } else if (profile.role === 'dispatcher') {
      router.push('/dispatcher')
    } else {
      setErrorMessage('Invalid role')
    }

    setLoading(false)
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-100 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl p-8">
        <h1 className="text-2xl font-bold text-slate-900">Login</h1>
        <p className="mt-2 text-sm text-slate-600">Sign in to continue</p>

        <div className="mt-6 space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-slate-500"
              placeholder="admin@simpliitrash.com"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-slate-500"
              placeholder="••••••••"
            />
          </div>

          {errorMessage ? (
            <p className="text-sm text-red-600">{errorMessage}</p>
          ) : null}

          <button
            onClick={handleLogin}
            disabled={loading}
            className="w-full rounded-xl bg-slate-900 px-4 py-3 font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {loading ? 'Signing in...' : 'Login'}
          </button>

          <div className="text-center">
            <Link
              href="/reset-password"
              className="text-sm text-slate-600 hover:text-slate-900"
            >
              Forgot password?
            </Link>
          </div>
        </div>
      </div>
    </main>
  )
}