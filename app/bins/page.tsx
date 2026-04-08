'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Bin = {
  id: string
  bin_number: string
  size?: string | null
  status?: string | null
  current_location?: string | null
}

export default function BinsPage() {
  const [bins, setBins] = useState<Bin[]>([])
  const [binNumber, setBinNumber] = useState('')
  const [size, setSize] = useState('')
  const [currentLocation, setCurrentLocation] = useState('yard')
  const [errorMessage, setErrorMessage] = useState('')

  async function loadBins() {
    const { data, error } = await supabase
      .from('bins')
      .select('id, bin_number, size, status, current_location')
      .order('bin_number', { ascending: true })

    if (error) {
      setErrorMessage(error.message)
      return
    }

    setBins((data as Bin[]) || [])
  }

  async function createBin() {
    if (!binNumber) {
      setErrorMessage('Bin number is required.')
      return
    }

    setErrorMessage('')

    const { error } = await supabase.from('bins').insert([
      {
        bin_number: binNumber,
        size: size || null,
        status: 'available',
        current_location: currentLocation || 'yard',
      },
    ])

    if (error) {
      setErrorMessage(error.message)
      return
    }

    setBinNumber('')
    setSize('')
    setCurrentLocation('yard')
    await loadBins()
  }

  useEffect(() => {
    loadBins()
  }, [])

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Bins</h1>
        <p className="text-sm text-gray-600">Track available and assigned bins.</p>
      </div>

      <div className="rounded-2xl border bg-white p-4 space-y-4">
        {errorMessage ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {errorMessage}
          </div>
        ) : null}

        <div className="grid gap-3 md:grid-cols-3">
          <input
            value={binNumber}
            onChange={(e) => setBinNumber(e.target.value)}
            placeholder="Bin number"
            className="border rounded-xl p-3"
          />
          <input
            value={size}
            onChange={(e) => setSize(e.target.value)}
            placeholder="Size"
            className="border rounded-xl p-3"
          />
          <input
            value={currentLocation}
            onChange={(e) => setCurrentLocation(e.target.value)}
            placeholder="Current location"
            className="border rounded-xl p-3"
          />
        </div>

        <button
          onClick={createBin}
          className="rounded-xl bg-black px-5 py-3 text-white"
        >
          Add Bin
        </button>
      </div>

      <div className="rounded-2xl border bg-white overflow-hidden">
        <div className="border-b p-4">
          <h2 className="text-lg font-semibold">All Bins</h2>
        </div>

        <div className="divide-y">
          {bins.map((bin) => (
            <div key={bin.id} className="p-4 grid gap-2 md:grid-cols-4">
              <div>
                <div className="text-xs text-gray-500">Bin</div>
                <div className="font-medium">{bin.bin_number}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">Size</div>
                <div>{bin.size || '—'}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">Status</div>
                <div>{bin.status || 'available'}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">Location</div>
                <div>{bin.current_location || '—'}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}