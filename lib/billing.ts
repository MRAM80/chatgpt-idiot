import { CLIENT_CONFIG } from '@/lib/client-config'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Account billing — turning a customer's unbilled work into invoice lines.
 *
 * The rules this module exists to hold in one place:
 *  - an order is billable exactly once: `invoice_id is null` and not `prepaid`
 *  - a missing price is `null`, never 0 — silently billing $0 is the failure
 *    mode every caller here is written to prevent
 *  - tax is computed in JS on the combined subtotal, once
 */

export type PriceMap = Record<string, number>

export type BillingOrder = {
  id: string
  ticket_number: string | null
  order_type: string | null
  service_address?: string | null
  pickup_address?: string | null
  bin_size: string | null
  bin_type?: string | null
  bin_number?: string | null
  bin_id?: string | null
  old_bin_id?: string | null
  status: string | null
  scheduled_date: string | null
  driver_id?: string | null
  driver_notes?: string | null
  parent_order_id?: string | null
}

export type BillingCycle = {
  id: string
  ticket_number: string | null
  order_type: string | null
  address: string | null
  bin_size: string | null
  bin_type: string | null
  bin_number: string | null
  status: string | null
  cycle_end_date: string | null
  cycle_start_date: string | null
  days_on_site: number | null
  driver_id: string | null
  driver_notes: string | null
  parent_ticket: string | null
}

export type InvoiceLine = {
  order_type: string
  bin_size: string
  count: number
  rate: number | null
  amount: number | null
}

/** Material carried by an order. Null rate means unpriced, not free. */
export type MaterialLine = {
  description: string
  unit: string | null
  quantity: number
  rate: number | null
  amount: number | null
}

/** A line typed by hand on the invoice — always priced, never null. */
export type ManualLine = {
  key: string
  description: string
  unit: string | null
  quantity: number
  rate: number
}

/** Bin work that closes a rental cycle. A DELIVERY opens one; it doesn't bill. */
export const BILLING_TYPES = ['REMOVAL', 'EXCHANGE', 'DUMP RETURN']

/** Guards the unbounded-history fetch; reported to the caller when hit. */
const HISTORY_LIMIT = 2000

export function fmtBinSize(size: string) {
  return size === '—' ? '—' : `${size}Y`
}

export function fmtMoney(value: number | null) {
  if (value == null) return '—'
  return `$${value.toFixed(2)}`
}

export function daysBetween(from: string | null, to: string | null): number | null {
  if (!from || !to) return null
  const a = new Date(from + 'T12:00:00')
  const b = new Date(to + 'T12:00:00')
  const diff = Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24))
  return diff >= 0 ? diff : null
}

function normAddr(o: { service_address?: string | null; pickup_address?: string | null }) {
  return (o.service_address || o.pickup_address || '').toLowerCase().trim()
}

/**
 * Group closed cycles into one line per service × bin size and price each from
 * the price book. An unmatched combination yields `rate: null` so the caller
 * can flag it and leave it out of the total.
 */
export function buildInvoiceLines(cycles: BillingCycle[], prices: PriceMap = {}): InvoiceLine[] {
  const map = new Map<string, { order_type: string; bin_size: string; count: number }>()
  cycles.forEach(c => {
    const type = c.order_type || 'Unknown'
    const size = c.bin_size ? String(c.bin_size) : '—'
    const key = `${type}|${size}`
    const current = map.get(key)
    if (current) current.count += 1
    else map.set(key, { order_type: type, bin_size: size, count: 1 })
  })

  return [...map.values()]
    .sort((a, b) =>
      a.order_type !== b.order_type
        ? a.order_type.localeCompare(b.order_type)
        : (Number(b.bin_size) || 0) - (Number(a.bin_size) || 0)
    )
    .map(l => {
      const rate = prices[`${l.order_type}|${l.bin_size}`]
      const hasRate = typeof rate === 'number'
      return { ...l, rate: hasRate ? rate : null, amount: hasRate ? rate * l.count : null }
    })
}

export function computeInvoiceTotals(lines: InvoiceLine[]) {
  return {
    subtotal: lines.reduce((s, l) => s + (l.amount ?? 0), 0),
    missingCount: lines.filter(l => l.rate == null).length,
  }
}

/** Bin work plus everything the trucks carried, taxed together, once. */
export function computeGrandTotal(parts: {
  serviceSubtotal: number
  materialSubtotal: number
  manualSubtotal: number
}) {
  const subtotal = parts.serviceSubtotal + parts.materialSubtotal + parts.manualSubtotal
  const tax = subtotal * (CLIENT_CONFIG.taxRate / 100)
  return { subtotal, tax, total: subtotal + tax }
}

export type AccountBilling = {
  cycles: BillingCycle[]
  materialLines: MaterialLine[]
  prices: PriceMap
  /** Orders this bill covers — stamped with invoice_id when it is issued. */
  billedOrderIds: string[]
  /** True when the history fetch hit its cap; days-on-site may be wrong. */
  historyTruncated: boolean
}

/**
 * Everything a customer owes for a period that has not already been billed.
 *
 * Prepaid orders and orders already carrying an invoice_id are excluded on both
 * passes — re-billing them is the double-billing defect this filter closes.
 */
export async function loadAccountBilling(
  supabase: SupabaseClient,
  customerId: string,
  dateFrom: string,
  dateTo: string
): Promise<AccountBilling> {
  // Price book — a customer-specific rate wins over the base rate
  const { data: priceRows } = await supabase
    .from('price_book')
    .select('service_type,bin_size,price,customer_id')
    .eq('kind', 'service')
    .or(`customer_id.is.null,customer_id.eq.${customerId}`)

  const basePrices: PriceMap = {}
  const customerPrices: PriceMap = {}
  for (const row of (priceRows as { service_type: string | null; bin_size: string | null; price: number; customer_id: string | null }[]) || []) {
    if (!row.service_type || !row.bin_size) continue
    const key = `${row.service_type}|${row.bin_size}`
    if (row.customer_id) customerPrices[key] = Number(row.price)
    else basePrices[key] = Number(row.price)
  }
  const prices: PriceMap = { ...basePrices, ...customerPrices }

  // Material and charges carried in the period
  const { data: orderRows } = await supabase
    .from('order')
    .select('id,status,scheduled_date,order_items(description,unit,quantity,rate,amount,kind)')
    .eq('customer_id', customerId)
    .neq('status', 'cancelled')
    .is('invoice_id', null)
    .eq('prepaid', false)
    .gte('scheduled_date', dateFrom)
    .lte('scheduled_date', dateTo)

  type OrderWithItems = {
    id: string
    order_items?: { description: string; unit: string | null; quantity: number; rate: number | null; amount: number | null }[] | null
  }

  const materialLines: MaterialLine[] = []
  const materialOrderIds: string[] = []
  for (const row of (orderRows as OrderWithItems[]) || []) {
    const items = row.order_items || []
    if (items.length > 0) materialOrderIds.push(row.id)
    for (const it of items) {
      materialLines.push({
        description: it.description,
        unit: it.unit,
        quantity: Number(it.quantity),
        // Number(null) is 0 — keep null so the line is flagged, not billed free
        rate: it.rate == null ? null : Number(it.rate),
        amount: it.amount == null ? null : Number(it.amount),
      })
    }
  }

  // Bin work that closes a cycle in the period
  const { data: billingOrders } = await supabase
    .from('order')
    .select('id,ticket_number,order_type,service_address,pickup_address,bin_size,bin_type,bin_number,bin_id,old_bin_id,status,scheduled_date,driver_id,driver_notes,parent_order_id')
    .eq('customer_id', customerId)
    .in('order_type', BILLING_TYPES)
    .neq('status', 'cancelled')
    .is('invoice_id', null)
    .eq('prepaid', false)
    .gte('scheduled_date', dateFrom)
    .lte('scheduled_date', dateTo)
    .order('scheduled_date', { ascending: false })

  const orders = (billingOrders as BillingOrder[]) || []

  // History, to work out when each bin landed. Bounded by the period end —
  // the lookup only ever considers dates before the event — and capped, with
  // the cap reported so a silent truncation can't corrupt days-on-site unseen.
  const { data: allOrders } = await supabase
    .from('order')
    .select('id,ticket_number,order_type,service_address,pickup_address,bin_size,scheduled_date,parent_order_id')
    .eq('customer_id', customerId)
    .neq('status', 'cancelled')
    .lte('scheduled_date', dateTo)
    .order('scheduled_date', { ascending: true })
    .limit(HISTORY_LIMIT)

  const history = (allOrders as BillingOrder[]) || []

  // Bin numbers for orders that don't carry the text column
  const binIds = [...new Set(orders.flatMap(o => [o.bin_id, o.old_bin_id]).filter((id): id is string => Boolean(id)))]
  const binNumberById = new Map<string, string>()
  if (binIds.length > 0) {
    const { data: binRows } = await supabase
      .from('bins')
      .select('id,bin_number')
      .in('id', binIds)
    for (const b of (binRows as { id: string; bin_number: string | null }[]) || []) {
      if (b.bin_number) binNumberById.set(b.id, b.bin_number)
    }
  }

  const cycles: BillingCycle[] = orders.map(o => {
    const endDate = o.scheduled_date
    let startDate: string | null = null
    let parentTicket: string | null = null

    // 1. Explicit parent link
    if (o.parent_order_id) {
      const parent = history.find(h => h.id === o.parent_order_id)
      if (parent) {
        startDate = parent.scheduled_date
        parentTicket = parent.ticket_number
      }
    }

    if (!startDate) {
      const addr = normAddr(o)
      const size = o.bin_size

      // 2. Root DELIVERY at the same address and size — earliest wins, which
      //    holds only because history is ordered ascending
      const deliveries = history.filter(h =>
        h.id !== o.id &&
        h.order_type === 'DELIVERY' &&
        normAddr(h) === addr &&
        h.bin_size === size &&
        h.scheduled_date != null &&
        h.scheduled_date < (endDate || '')
      )
      if (deliveries.length > 0) {
        startDate = deliveries[0].scheduled_date
        parentTicket = deliveries[0].ticket_number
      }

      // 3. Most recent prior event at the same address, any type
      if (!startDate && addr) {
        const prior = history.filter(h =>
          h.id !== o.id &&
          normAddr(h) === addr &&
          h.scheduled_date != null &&
          h.scheduled_date < (endDate || '')
        )
        if (prior.length > 0) {
          startDate = prior[prior.length - 1].scheduled_date
          parentTicket = prior[prior.length - 1].ticket_number
        }
      }
    }

    return {
      id: o.id,
      ticket_number: o.ticket_number,
      order_type: o.order_type,
      address: o.service_address || o.pickup_address || null,
      bin_size: o.bin_size,
      bin_type: o.bin_type ?? null,
      bin_number: o.bin_number
        || (o.old_bin_id && binNumberById.get(o.old_bin_id))
        || (o.bin_id && binNumberById.get(o.bin_id))
        || null,
      status: o.status,
      cycle_end_date: endDate,
      cycle_start_date: startDate,
      days_on_site: daysBetween(startDate, endDate),
      driver_id: o.driver_id ?? null,
      driver_notes: o.driver_notes ?? null,
      parent_ticket: parentTicket,
    }
  })

  return {
    cycles,
    materialLines,
    prices,
    billedOrderIds: [...new Set([...materialOrderIds, ...orders.map(o => o.id)])],
    historyTruncated: history.length >= HISTORY_LIMIT,
  }
}
