'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Driver = {
  id: string
  full_name: string
  phone?: string | null
  email?: string | null
  truck_number?: string | null
  status?: string | null
}

export default function DriversPage() {
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [truckNumber, setTruckNumber] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  async function loadDrivers() {
    const { data, error } = await supabase
      .from('drivers')
      .select('id, full_name, phone, email, truck_number, status')
      .order('full_name', { ascending: true })

    if (error) {
      setErrorMessage(error.message)
      return
    }

    setDrivers((data as Driver[]) || [])
  }

  async function createDriver() {
    if (!fullName) {
      setErrorMessage('Driver name is required.')
      return
    }

    setErrorMessage('')

    const { error } = await supabase.from('drivers').insert([
      {
        full_name: fullName,
        phone: phone || null,
        email: email || null,
        truck_number: truckNumber || null,
        status: 'active',
      },
    ])

    if (error) {
      setErrorMessage(error.message)
      return
    }

    setFullName('')
    setPhone('')
    setEmail('')
    setTruckNumber('')
    await loadDrivers()
  }

  useEffect(() => {
    loadDrivers()
  }, [])

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Drivers</h1>
        <p className="text-sm text-gray-600">Manage field drivers and trucks.</p>
      </div>

      <div className="rounded-2xl border bg-white p-4 space-y-4">
        {errorMessage ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {errorMessage}
          </div>
        ) : null}

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Full name"
            className="border rounded-xl p-3"
          />
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Phone"
            className="border rounded-xl p-3"
          />
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            className="border rounded-xl p-3"
          />
          <input
            value={truckNumber}
            onChange={(e) => setTruckNumber(e.target.value)}
            placeholder="Truck number"
            className="border rounded-xl p-3"
          />
        </div>

        <button
          onClick={createDriver}
          className="rounded-xl bg-black px-5 py-3 text-white"
        >
          Add Driver
        </button>
      </div>

      <div className="rounded-2xl border bg-white overflow-hidden">
        <div className="border-b p-4">
          <h2 className="text-lg font-semibold">All Drivers</h2>
        </div>

        <div className="divide-y">
          {drivers.map((driver) => (
            <div key={driver.id} className="p-4 grid gap-2 md:grid-cols-5">
              <div>
                <div className="text-xs text-gray-500">Name</div>
                <div className="font-medium">{driver.full_name}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">Phone</div>
                <div>{driver.phone || '—'}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">Email</div>
                <div>{driver.email || '—'}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">Truck</div>
                <div>{driver.truck_number || '—'}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">Status</div>
                <div>{driver.status || 'active'}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}