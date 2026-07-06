# Form Parity Check — NewOrderModal vs Order Page

Deep-compare `components/NewOrderModal.tsx` and `app/order/page.tsx` create form to detect any drift.

## What to check

### Field presence and order
Both forms must have these fields in this exact order:
1. Customer selector (col 1)
2. Customer Name text input (col 2)
3. Job Site Address with datalist suggestions (md:col-span-2)
4. Order Type selector (md:col-span-2)
5. Scheduled Date input (col 1)
6. Service Time selector (col 2) — must be `<select>`, NOT `type="time"`
7. Bin Size selector (col 1)
8. Material/bin_type selector (col 2)
9. [If multi-step] Dump Site selector (col 1) + Dump Site Address display (col 2)
10. [If multi-step] Old Bin / existing bin selector (md:col-span-2)
11. Assign Driver selector (md:col-span-2)
12. Notes textarea (md:col-span-2)

### Logic parity
- `isMultiStep` includes: DUMP RETURN, EXCHANGE, REMOVAL
- Multi-step validation: `old_bin_id` required + `dump_site_id` required
- `workflow_step`: multi-step → `'PICKUP'`, single → `'MAIN'`
- Address suggestions: job_sites + past order service_address/pickup_address (deduped)
- Bin auto-fill: `binsAtJobSite` filtered by `status === 'in_use'` + `location === address`
- Material auto-fill: derived from `pastOrders` linked to `old_bin_id`, then `bin.bin_type`
- Single bin auto-select: if only one bin at job site, auto-select it

### Time options
Both must use the same TIME_OPTIONS constant: 5:00 AM to 8:00 PM in 30-min intervals.

## Output
List every difference found. If none, confirm they are in parity.
Auto-fix simple differences (copy the correct version from whichever file is authoritative — the order page is the reference).
