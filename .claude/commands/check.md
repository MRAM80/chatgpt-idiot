# Project Health Check

Run a full automated health check and fix any straightforward issues found.

## Steps

### 1. TypeScript
Run `npx tsc --noEmit` and report all errors with file:line. Fix any that are simple (missing type, wrong import). For complex ones, describe what needs to be done.

### 2. Dead symbol references
Grep for symbols that were removed in past sessions — any hit means a broken reference:
- `quickForm` in any `.tsx`/`.ts` (removed — replaced by NewOrderModal)
- `quickSaving` / `quickError` / `emptyQuickForm` / `QUICK_TIME_OPTIONS` (same)
- `handleQuickCreate` / `handleQuickCustomerChange` (same)
- `setQuickForm` (same)

### 3. Time input violations
Run: `grep -rn 'type="time"' app/ components/`
There must be zero results. Every time field uses a `<select>` dropdown (5 AM–8 PM, 30-min slots). Fix any violations found.

### 4. Job sites query flag
Run: `grep -rn "is_active.*true\|eq.*is_active" app/ components/`
Any `.eq('is_active', true)` must be changed to `.neq('is_active', false)`. Fix automatically.

### 5. Cancelled/completed orders on dispatch board
Check `app/dispatch/page.tsx` loads orders with `.not('status', 'in', '("cancelled","completed")')`. If missing, add it.

### 6. Form parity — NewOrderModal vs order page
Check that `components/NewOrderModal.tsx` contains all of these fields in order:
Customer, Customer Name, Job Site Address (col-span-2), Order Type (col-span-2),
Date, Time, Bin Size, Material, Dump Site (conditional), Old Bin (conditional),
Assign Driver, Notes.
Compare with `app/order/page.tsx` create form. Report any differences.

### 7. Multi-step order workflow_step
Check that DUMP RETURN / EXCHANGE / REMOVAL orders set `workflow_step: 'PICKUP'` on insert, not `'MAIN'`. Check both `components/NewOrderModal.tsx` and `app/order/page.tsx`.

### 8. NewOrderModal used correctly
Verify `app/dispatch/page.tsx` imports and uses `NewOrderModal` for the "+ New Order" button. No inline quick-create form should exist.

## Output format
Report each check as ✅ pass or ❌ fail with details.
Auto-fix what you can. For anything requiring the user's action (e.g. SQL), list it clearly at the end.
