# Project Health Check

Run a full health check on the codebase and report what needs fixing.

## Steps

1. **TypeScript** — run `npx tsc --noEmit` and report all errors with file:line references.

2. **Unused imports / dead references** — grep for any references to removed symbols:
   - `quickForm`, `quickSaving`, `quickError`, `emptyQuickForm`, `QUICK_TIME_OPTIONS` in any `.tsx`/`.ts` file (these were removed; any leftover means a broken import)

3. **Form parity** — check that `components/NewOrderModal.tsx` and the create-modal section of `app/order/page.tsx` have the same set of fields: Customer, Customer Name, Job Site Address, Order Type, Date, Time, Bin Size, Material, Dump Site (conditional), Old Bin (conditional), Driver, Notes.

4. **Dispatch board** — verify `app/dispatch/page.tsx` queries orders with `.not('status', 'in', '("cancelled","completed")')`.

5. **Job sites query** — verify every Supabase query against `job_sites` uses `.neq('is_active', false)` and not `.eq('is_active', true)`.

6. **Time fields** — grep for `<input type="time"` in all `.tsx` files. There should be none (all time fields must use a `<select>` dropdown).

7. **workflow_step** — verify that DUMP RETURN / EXCHANGE / REMOVAL orders set `workflow_step: 'PICKUP'` on insert, not `'MAIN'`.

Report findings as a checklist: ✅ pass / ❌ fail with details. Fix any failures automatically if they are straightforward (typos, wrong query flags). For larger issues, describe what needs to be done.
