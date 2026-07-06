# Driver App Workflow Check

Verify the driver app correctly handles multi-step orders and the two-step delivery workflow.

## Steps

### 1. Workflow step display
Read `app/driver/page.tsx`. Check that:
- Orders with `workflow_step = 'PICKUP'` are labeled clearly for the driver (e.g., "Pick Up Bin")
- Orders with `workflow_step = 'DUMP'` are labeled as dump trips
- Orders with `workflow_step = 'MAIN'` are standard deliveries

### 2. bin_number display
Check that `bin_number` is shown to the driver — they need to know which physical bin to pick up.
If it's missing from the driver view, note which component to update.

### 3. Photo upload
Check that the photo upload uses bucket `delivery-photos` (not `photos`, `images`, or any other name).
Check the bucket name in the storage upload call.

### 4. Old bin reference
For DUMP RETURN / REMOVAL / EXCHANGE, confirm the driver sees the old bin info (bin_number or old_bin_id display).

### 5. Status transitions
Check what statuses a driver can transition an order to. Document what you find.

## Output
Report each check as ✅ pass or ❌ fail. For failures, describe what's missing and where.
