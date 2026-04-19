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
    console.log('SUBSCRIBE BODY:', body)

    const driverId = body.driverId
    const endpoint = body.endpoint
    const p256dh = body.p256dh
    const auth = body.auth

    if (!driverId || !endpoint || !p256dh || !auth) {
      console.log('SUBSCRIBE ERROR: invalid payload', {
        driverId,
        endpoint: !!endpoint,
        p256dh: !!p256dh,
        auth: !!auth,
      })

      return NextResponse.json(
        {
          error: 'Invalid subscription payload.',
          debug: {
            driverId,
            endpoint: !!endpoint,
            p256dh: !!p256dh,
            auth: !!auth,
          },
        },
        { status: 400 }
      )
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !serviceRoleKey) {
      console.log('SUBSCRIBE ERROR: missing env', {
        hasSupabaseUrl: !!supabaseUrl,
        hasServiceRoleKey: !!serviceRoleKey,
      })

      return NextResponse.json(
        {
          error: 'Missing server environment variables.',
          debug: {
            hasSupabaseUrl: !!supabaseUrl,
            hasServiceRoleKey: !!serviceRoleKey,
          },
        },
        { status: 500 }
      )
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey)

    await supabase
      .from('driver_push_subscriptions')
      .delete()
      .eq('endpoint', endpoint)

    const { data, error } = await supabase
      .from('driver_push_subscriptions')
      .insert({
        driver_id: driverId,
        endpoint,
        p256dh,
        auth,
        updated_at: new Date().toISOString(),
      })
      .select()

    if (error) {
      console.log('SUBSCRIBE DB ERROR:', error)

      return NextResponse.json(
        { error: error.message, debug: error },
        { status: 500 }
      )
    }

    console.log('SUBSCRIBE OK:', data)

    return NextResponse.json({ ok: true, data })
  } catch (error) {
    console.log('SUBSCRIBE CATCH ERROR:', error)

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unable to save push subscription.',
      },
      { status: 500 }
    )
  }
}