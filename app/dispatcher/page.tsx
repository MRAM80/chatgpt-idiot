'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Navbar from '@/components/Navbar'

export default function DispatcherPage() {
  const [bins, setBins] = useState<any[]>([])

  const fetchBins = async () => {
    const { data } = await supabase.from('bins').select('*')
    setBins(data || [])
  }

  useEffect(() => {
    fetchBins()

    const channel = supabase
      .channel('realtime bins')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bins' }, fetchBins)
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  const collect = async (id: number) => {
    await supabase
      .from('bins')
      .update({ status: 'collected' })
      .eq('id', id)
  }

  return (
    <div>
      <Navbar title="Dispatcher" />

      <main className="p-4 max-w-3xl mx-auto">
        <div className="grid gap-3">
          {bins.map((bin) => (
            <div
              key={bin.id}
              className="bg-white p-4 rounded-xl shadow flex justify-between items-center"
            >
              <div>
                <p className="font-semibold">{bin.location}</p>
                <p className="text-sm text-gray-500">{bin.status}</p>
              </div>

              {bin.status === 'assigned' && (
                <button
                  onClick={() => collect(bin.id)}
                  className="bg-green-500 text-white px-3 py-1 rounded"
                >
                  Done
                </button>
              )}
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}