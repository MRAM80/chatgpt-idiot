'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function CustomersPage() {
  const [customers, setCustomers] = useState<any[]>([])
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')

  async function loadCustomers() {
    const { data } = await supabase.from('customers').select('*').order('created_at', { ascending: false })
    setCustomers(data || [])
  }

  async function createCustomer() {
    if (!name) return

    await supabase.from('customers').insert([
      { company_name: name, phone }
    ])

    setName('')
    setPhone('')
    loadCustomers()
  }

  useEffect(() => {
    loadCustomers()
  }, [])

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Customers</h1>

      <div className="mb-4 flex gap-2">
        <input
          className="border p-2"
          placeholder="Company name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          className="border p-2"
          placeholder="Phone"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
        <button onClick={createCustomer} className="bg-black text-white px-4">
          Add
        </button>
      </div>

      <div>
        {customers.map((c) => (
          <div key={c.id} className="border p-2 mb-2">
            <div className="font-bold">{c.company_name}</div>
            <div>{c.phone}</div>
          </div>
        ))}
      </div>
    </div>
  )
}