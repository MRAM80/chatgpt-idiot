'use client'

import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function Navbar({ title }: { title: string }) {
  const router = useRouter()

  const logout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div className="flex items-center justify-between bg-black text-white px-6 py-4">
      <h1 className="font-bold text-lg">{title}</h1>
      <button onClick={logout} className="text-sm opacity-80 hover:opacity-100">
        Logout
      </button>
    </div>
  )
}