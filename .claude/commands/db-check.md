# Database Schema Check

Verify the codebase is not referencing columns or tables that may not exist in Supabase.

## Steps

1. **Columns used in inserts/selects** — scan all `.tsx`/`.ts` files for Supabase `.insert()`, `.update()`, `.select()` calls on the `order` table and list every column referenced.

2. **Required columns** — confirm the following columns are referenced correctly (these required manual SQL migrations):
   - `order.bin_number` (text)
   - `order.workflow_step` (text)
   - `order.parent_order_id` (uuid)
   - `order.dump_site_address` (text)
   - `order.delivery_photo_url` (text)
   - `dump_sites.notes` (text)

3. **Pending migrations reminder** — print the SQL block from CLAUDE.md so the user knows what still needs to be run in both Supabase projects.

4. **bin_type on bins table** — check if any query selects `bin_type` from the `bins` table (it may or may not exist; flag it if found).

5. **Storage bucket** — check `app/driver/page.tsx` for the storage bucket name used for photo uploads and confirm it matches `delivery-photos`.

Report findings as a checklist. Do not make code changes — only report.
