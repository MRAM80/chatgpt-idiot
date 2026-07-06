# Pending SQL Migrations

Print the full SQL block that must be run in BOTH Supabase projects (SimpliiTrash and BR Garden Center).
Remind the user to run it in the Supabase SQL editor for each project.

## SQL to run

```sql
-- Run in BOTH: SimpliiTrash and BR Garden Center Supabase projects

ALTER TABLE "order" ADD COLUMN IF NOT EXISTS bin_number text;
ALTER TABLE "order" ADD COLUMN IF NOT EXISTS workflow_step text;
ALTER TABLE "order" ADD COLUMN IF NOT EXISTS parent_order_id uuid;
ALTER TABLE "order" ADD COLUMN IF NOT EXISTS dump_site_address text;
ALTER TABLE "order" ADD COLUMN IF NOT EXISTS delivery_photo_url text;
ALTER TABLE dump_sites ADD COLUMN IF NOT EXISTS notes text;
UPDATE customers SET status = 'active' WHERE status IS NULL;
```

## Storage RLS (also needed in both projects)
Run these in the Supabase SQL editor for the `delivery-photos` bucket:
```sql
-- Allow authenticated users to upload photos
CREATE POLICY "Allow upload" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'delivery-photos');

-- Allow authenticated users to read photos
CREATE POLICY "Allow read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'delivery-photos');
```

Do not make code changes. Just print this block and remind the user.
