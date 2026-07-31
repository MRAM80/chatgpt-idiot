'use client'

export const dynamic = 'force-dynamic'

import Till from '@/components/Till'

export default function QuickSalePage() {
  return (
    <Till
      mode="products"
      title="Quick Sale"
      subtitle="Counter sales — materials and products"
      searchPlaceholder="Search materials and products…"
      emptyPriceBookHint="No products priced yet."
      allowDelivery
    />
  )
}
