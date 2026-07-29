import { CLIENT_CONFIG } from '@/lib/client-config'

export type PrintLine = {
  description: string
  unit?: string | null
  quantity: number
  rate: number
  amount: number
}

export type PrintDoc = {
  /** "Invoice" or "Receipt" — drives the big word in the header. */
  kind: 'Invoice' | 'Receipt'
  number: string
  dateLabel: string
  customer: string
  status?: string | null
  paymentMethod?: string | null
  notes?: string | null
  lines: PrintLine[]
  subtotal: number
  taxAmount: number
  total: number
  /** Shown under the total, e.g. "Paid in full — thank you". */
  footerNote?: string | null
}

function money(v: number) {
  return `$${Number(v || 0).toFixed(2)}`
}

/** 0.5 reads better as ½ on a customer-facing document. */
function qty(n: number) {
  const v = Number(n)
  if (Number.isInteger(v)) return String(v)
  if (v === 0.5) return '½'
  if (v === 0.25) return '¼'
  if (v === 0.75) return '¾'
  return String(v)
}

function escapeHtml(s: string | null | undefined) {
  return (s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Opens a print window with a single, consistent document layout used for
 * counter receipts and account invoices alike. Kept as raw HTML because the
 * print window is a separate document — React never renders into it.
 */
export function printInvoiceDocument(doc: PrintDoc) {
  const win = window.open('', '_blank')
  if (!win) return

  // The print window is its own document, so relative asset paths won't resolve
  const logoUrl = CLIENT_CONFIG.logoUrl
    ? `${window.location.origin}${CLIENT_CONFIG.logoUrl}`
    : null

  const accent = CLIENT_CONFIG.primaryColor

  const rows = doc.lines.map(l => `
    <tr>
      <td class="desc">
        ${escapeHtml(l.description)}
        ${l.unit ? `<span class="unit">per ${escapeHtml(l.unit)}</span>` : ''}
      </td>
      <td class="num">${qty(l.quantity)}</td>
      <td class="num">${money(l.rate)}</td>
      <td class="num strong">${money(l.amount)}</td>
    </tr>`).join('')

  win.document.write(`<!doctype html>
<html><head><meta charset="utf-8"><title>${escapeHtml(doc.kind)} ${escapeHtml(doc.number)}</title>
<style>
  *{box-sizing:border-box}
  body{
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;
    color:#0f172a;margin:0;padding:40px;max-width:760px;
    -webkit-print-color-adjust:exact;print-color-adjust:exact;
  }

  .top{display:flex;justify-content:space-between;align-items:flex-start;gap:32px;
       padding-bottom:24px;border-bottom:3px solid ${accent}}
  .brand img{max-height:56px;max-width:220px;object-fit:contain;display:block}
  .brand .name{font-size:19px;font-weight:700;letter-spacing:-.01em}
  .brand .tag{font-size:12px;color:#64748b;margin-top:3px}

  .docmeta{text-align:right;flex-shrink:0}
  .docmeta .word{font-size:30px;font-weight:800;letter-spacing:-.02em;color:${accent};line-height:1}
  .docmeta .num{font-size:14px;font-weight:600;margin-top:6px;font-variant-numeric:tabular-nums}
  .docmeta .date{font-size:12px;color:#64748b;margin-top:3px}

  .parties{display:flex;justify-content:space-between;gap:32px;margin:26px 0 22px}
  .block{font-size:13px;line-height:1.55}
  .block .label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.09em;
                color:#94a3b8;margin-bottom:5px}
  .block .who{font-size:15px;font-weight:700}
  .pill{display:inline-block;padding:4px 11px;border-radius:99px;font-size:10px;
        font-weight:700;text-transform:uppercase;letter-spacing:.05em}
  .pill.paid{background:#d1fae5;color:#047857}
  .pill.due{background:#fef3c7;color:#b45309}

  table{width:100%;border-collapse:collapse;margin-top:6px}
  thead th{background:#f8fafc;text-align:left;padding:9px 12px;font-size:10px;font-weight:700;
           text-transform:uppercase;letter-spacing:.07em;color:#64748b;border-bottom:1px solid #e2e8f0}
  thead th.num,tbody td.num{text-align:right}
  tbody td{padding:11px 12px;border-bottom:1px solid #f1f5f9;font-size:13px;vertical-align:top}
  tbody td.num{font-variant-numeric:tabular-nums;white-space:nowrap}
  tbody td.strong{font-weight:700}
  .desc .unit{color:#94a3b8;font-size:11px;margin-left:6px}

  .totals{margin-top:20px;display:flex;justify-content:flex-end}
  .totals table{width:290px}
  .totals td{padding:6px 12px;font-size:13px;border:none}
  .totals td.num{text-align:right;font-variant-numeric:tabular-nums}
  .totals tr.grand td{border-top:2px solid ${accent};padding-top:11px;font-size:17px;font-weight:800}
  .totals tr.grand td.num{color:${accent}}

  .note{margin-top:26px;padding:12px 15px;background:#f8fafc;border-radius:7px;
        font-size:12px;color:#475569;line-height:1.55}
  .footer{margin-top:34px;padding-top:14px;border-top:1px solid #e2e8f0;
          text-align:center;font-size:11px;color:#94a3b8}

  @media print{ body{padding:0} @page{margin:14mm} }
</style></head><body>

  <div class="top">
    <div class="brand">
      ${logoUrl
        ? `<img src="${logoUrl}" alt="${escapeHtml(CLIENT_CONFIG.name)}" />`
        : `<div class="name">${escapeHtml(CLIENT_CONFIG.name)}</div>`}
      ${logoUrl ? `<div class="tag">${escapeHtml(CLIENT_CONFIG.name)}</div>` : ''}
    </div>
    <div class="docmeta">
      <div class="word">${doc.kind.toUpperCase()}</div>
      <div class="num">${escapeHtml(doc.number)}</div>
      <div class="date">${escapeHtml(doc.dateLabel)}</div>
    </div>
  </div>

  <div class="parties">
    <div class="block">
      <div class="label">Bill to</div>
      <div class="who">${escapeHtml(doc.customer)}</div>
    </div>
    <div class="block" style="text-align:right">
      ${doc.status ? `<div class="label">Status</div>
        <div><span class="pill ${doc.status.toLowerCase() === 'paid' ? 'paid' : 'due'}">${escapeHtml(doc.status)}</span></div>` : ''}
      ${doc.paymentMethod ? `<div style="margin-top:8px;color:#64748b;font-size:12px">
        Payment: <strong style="color:#0f172a">${escapeHtml(doc.paymentMethod)}</strong></div>` : ''}
    </div>
  </div>

  <table>
    <thead><tr>
      <th>Description</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Amount</th>
    </tr></thead>
    <tbody>${rows || '<tr><td colspan="4" style="color:#94a3b8">No items</td></tr>'}</tbody>
  </table>

  <div class="totals"><table>
    <tr><td>Subtotal</td><td class="num">${money(doc.subtotal)}</td></tr>
    <tr><td>${escapeHtml(CLIENT_CONFIG.taxLabel)} (${CLIENT_CONFIG.taxRate}%)</td><td class="num">${money(doc.taxAmount)}</td></tr>
    <tr class="grand"><td>Total</td><td class="num">${money(doc.total)}</td></tr>
  </table></div>

  ${doc.notes ? `<div class="note"><strong>Notes:</strong> ${escapeHtml(doc.notes)}</div>` : ''}

  <div class="footer">
    ${doc.footerNote ? `${escapeHtml(doc.footerNote)}<br/>` : ''}
    Thank you for your business — ${escapeHtml(CLIENT_CONFIG.name)}
  </div>

</body></html>`)

  win.document.close()
  // Give the logo a moment to load so it isn't missing from the printout
  win.setTimeout(() => win.print(), 250)
}
