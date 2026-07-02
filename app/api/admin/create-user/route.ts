import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

type CreateUserBody = {
  email?: string
  password?: string
  name?: string
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as CreateUserBody
    const email = (body.email || '').trim().toLowerCase()
    const password = body.password || ''
    const name = body.name || ''

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 })
    }
    if (password.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters.' }, { status: 400 })
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json({ error: 'Server is missing Supabase service role configuration.' }, { status: 500 })
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: name ? { name } : undefined,
    })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ userId: data.user?.id })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Unexpected error creating user.' }, { status: 500 })
  }
}
