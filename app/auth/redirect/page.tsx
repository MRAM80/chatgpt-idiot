'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function AuthRedirectPage() {
  const router = useRouter()

  useEffect(() => {
    async function redirect() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      // Check if driver first
      const { data: driver } = await supabase
        .from('drivers')
        .select('id')
        .or(`auth_user_id.eq.${user.id},email.ilike.${(user.email || '').toLowerCase()}`)
        .maybeSingle()

      if (driver?.id) { router.push('/driver'); return }

      // Check role
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('role')
        .eq('user_id', user.id)
        .maybeSingle()

      const role = profile?.role
      if (role === 'dispatcher') {
        router.push('/dispatch')
      } else {
        router.push('/dashboard')
      }
    }
    void redirect()
  }, [router])

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950">
      <div className="text-center text-slate-400 text-sm">Signing you in...</div>
    </div>
  )
}
