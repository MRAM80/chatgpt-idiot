import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

type SubscribeBody = {
  driverId: string
  subscription: PushSubscriptionJSON
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as SubscribeBody

    const driverId = body?.driverId
    const subscription = body?.subscription

    if (!driverId || !subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      return NextResponse.json({ error: 'Invalid subscription payload.' }, { status: 400 })
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json({ error: 'Missing server environment variables.' }, { status: 500 })
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey)

    const { error } = await supabase
      .from('driver_push_subscriptions')
      .upsert(
        {
          driver_id: driverId,
          endpoint: subscription.endpoint,
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth,
        },
        {
          onConflict: 'driver_id,endpoint',
        }
      )

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Unable to save push subscription.' }, { status: 500 })
  }
}