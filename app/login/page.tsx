'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function LoginPage() {
  const router = useRouter()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [resetMode, setResetMode] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')

  const handleLogin = async () => {
    setLoading(true)
    setErrorMessage('')
    setSuccessMessage('')

    const cleanEmail = email.trim().toLowerCase()

    const { data, error } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password,
    })

    if (error || !data.user) {
      setErrorMessage(error?.message || 'Login failed')
      setLoading(false)
      return
    }

    const { data: sessionData } = await supabase.auth.getSession()
    if (!sessionData.session) {
      setErrorMessage('Session not created. Please try again.')
      setLoading(false)
      return
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', data.user.id)
      .single()

    if (profileError || !profile) {
      setErrorMessage('Profile not found')
      setLoading(false)
      return
    }

    if (profile.role === 'admin') {
      router.replace('/admin')
    } else if (profile.role === 'dispatcher') {
      router.replace('/dispatcher')
    } else {
      setErrorMessage('Invalid role')
      setLoading(false)
      return
    }

    router.refresh()
    setLoading(false)
  }

  const handleResetPassword = async () => {
    setLoading(true)
    setErrorMessage('')
    setSuccessMessage('')

    const { error } = await supabase.auth.resetPasswordForEmail(
      email.trim().toLowerCase(),
      {
        redirectTo:
          typeof window !== 'undefined'
            ? `${window.location.origin}/reset-password`
            : undefined,
      }
    )

    if (error) {
      setErrorMessage(error.message)
    } else {
      setSuccessMessage('Check your email for reset link')
    }

    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-8">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold">SimpliiTrash</h1>
          <p className="text-gray-500 text-sm mt-1">Waste Management System</p>
        </div>

        {errorMessage && (
          <div className="mb-4 text-red-500 text-sm text-center">
            {errorMessage}
          </div>
        )}

        {successMessage && (
          <div className="mb-4 text-green-600 text-sm text-center">
            {successMessage}
          </div>
        )}

        <div className="space-y-4">
          <input
            type="email"
            placeholder="Email"
            className="w-full border rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-black"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          {!resetMode && (
            <input
              type="password"
              placeholder="Password"
              className="w-full border rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-black"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          )}

          <button
            onClick={resetMode ? handleResetPassword : handleLogin}
            disabled={loading}
            className="w-full bg-black text-white rounded-lg py-2 font-medium hover:opacity-90 disabled:opacity-50"
          >
            {loading ? 'Please wait...' : resetMode ? 'Send reset link' : 'Login'}
          </button>

          <div className="text-center">
            <button
              type="button"
              onClick={() => {
                setResetMode(!resetMode)
                setErrorMessage('')
                setSuccessMessage('')
              }}
              className="text-sm text-gray-500 hover:text-black"
            >
              {resetMode ? 'Back to login' : 'Forgot password?'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}