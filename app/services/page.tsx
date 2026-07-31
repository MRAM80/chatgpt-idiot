'use client'

export const dynamic = 'force-dynamic'

import Link from 'next/link'
import Till from '@/components/Till'

export default function BinServicesPage() {
  return (
    <Till
      mode="services"
      title="Bin Services"
      subtitle="Charge a bin service — delivery is already covered by the service price"
      searchPlaceholder="Search bin services…"
      emptyPriceBookHint="No bin services priced yet."
      notice={
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm leading-relaxed text-amber-900">
          Bin work is normally charged <strong>once, when the bin is picked up</strong> — completed jobs
          bill automatically from{' '}
          <Link href="/reports/statements" className="font-bold underline">Statements &amp; Invoices</Link>.
          Use this page to take payment on the spot instead. No delivery fee applies: the trip is already
          part of the service price.
        </div>
      }
    />
  )
}
