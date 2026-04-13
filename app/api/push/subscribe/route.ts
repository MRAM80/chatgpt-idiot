import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

type SubscribeBody = {
  driverId?: string
  endpoint?: string
  p256dh?: string
  auth?: string
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as SubscribeBody

    const driverId = body.driverId
    const endpoint = body.endpoint
    const p256dh = body.p256dh
    const auth = body.auth

    if (!driverId || !endpoint || !p256dh || !auth) {
      return NextResponse.json(
        { error: 'Invalid subscription payload.' },
        { status: 400 }
      )
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        { error: 'Missing server environment variables.' },
        { status: 500 }
      )
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey)

    const { error } = await supabase
      .from('driver_push_subscriptions')
      .upsert(
        {
          driver_id: driverId,
          endpoint,
          p256dh,
          auth,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'driver_id,endpoint',
        }
      )

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unable to save push subscription.',
      },
      { status: 500 }
    )
  }
}