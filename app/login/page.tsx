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

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error || !data.user) {
      setErrorMessage(error?.message || 'Login failed')
      setLoading(false)
      return
    }

    // Get user profile
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

    // Redirect by role
    if (profile.role === 'admin') router.push('/admin')
    else if (profile.role === 'dispatcher') router.push('/dispatcher')
    else router.push('/driver')
  }

  const handleResetPassword = async () => {
    setLoading(true)
    setErrorMessage('')
    setSuccessMessage('')

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: 'http://localhost:3000/reset-password',
    })

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

        {/* Logo / Title */}
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold">SimpliiTrash</h1>
          <p className="text-gray-500 text-sm mt-1">
            Waste Management System
          </p>
        </div>

        {/* Error */}
        {errorMessage && (
          <div className="mb-4 text-red-500 text-sm text-center">
            {errorMessage}
          </div>
        )}

        {/* Success */}
        {successMessage && (
          <div className="mb-4 text-green-600 text-sm text-center">
            {successMessage}
          </div>
        )}

        {/* Form */}
        <div className="space-y-4">

          {/* Email */}
          <input
            type="email"
            placeholder="Email"
            className="w-full border rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-black"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          {/* Password (only in login mode) */}
          {!resetMode && (
            <input
              type="password"
              placeholder="Password"
              className="w-full border rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-black"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          )}

          {/* Button */}
          <button
            onClick={resetMode ? handleResetPassword : handleLogin}
            disabled={loading}
            className="w-full bg-black text-white py-2 rounded-lg hover:opacity-90 transition"
          >
            {loading
              ? 'Loading...'
              : resetMode
              ? 'Send Reset Link'
              : 'Login'}
          </button>

          {/* Toggle */}
          <div className="text-center text-sm text-gray-500">
            {resetMode ? (
              <button
                onClick={() => {
                  setResetMode(false)
                  setErrorMessage('')
                  setSuccessMessage('')
                }}
                className="underline"
              >
                Back to login
              </button>
            ) : (
              <button
                onClick={() => {
                  setResetMode(true)
                  setErrorMessage('')
                  setSuccessMessage('')
                }}
                className="underline"
              >
                Forgot password?
              </button>
            )}
          </div>

        </div>
      </div>
    </div>
  )
}