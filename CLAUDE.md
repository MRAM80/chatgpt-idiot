@AGENTS.md

# Project: SimpliiTrash / BR Garden Center Dispatch Platform

Multi-tenant dispatch SaaS. Same codebase, different Supabase projects per tenant.
- SimpliiTrash → simpliidash.ca
- BR Garden Center → brdash.ca

## Stack
- Next.js App Router (`'use client'` + `export const dynamic = 'force-dynamic'`)
- Supabase (client-side via `@/lib/supabase/client`)
- Tailwind CSS v4
- TypeScript

## Key Database Tables

| Table | Important columns |
|---|---|
| `order` | `bin_id`, `old_bin_id`, `bin_number` (text), `bin_size`, `bin_type`, `workflow_step` (MAIN/PICKUP/DUMP), `dump_site_id`, `dump_site_address`, `service_time`, `parent_order_id` |
| `bins` | `bin_number`, `bin_size`, `bin_type`, `status` (`in_use`/`available`), `location` |
| `dump_sites` | `id`, `name`, `address`, `notes` |
| `job_sites` | `customer_id`, `site_name`, `address`, `unit`, `city`, `province`, `postal_code`, `is_active` |
| `drivers` | `auth_user_id` links to `user_profiles` |
| `user_profiles` | `auth_user_id`, `role`, `full_name` |

## Conventions

- **Job sites query**: always `.neq('is_active', false)` — never `.eq('is_active', true)`, because null means active too.
- **Time fields**: always `<select>` dropdown (5 AM–8 PM, 30-min slots), never `<input type="time">`.
- **Card style**: `rounded-3xl` with `ring-1` border, Tailwind classes only, no inline styles.
- **New order form**: use `NewOrderModal` component (`components/NewOrderModal.tsx`) — identical to the order page form. Do NOT build custom quick-create forms.
- **DUMP RETURN / EXCHANGE / REMOVAL**: require `old_bin_id` (FK to bins table) + `dump_site_id`. Single order with `workflow_step` cycling PICKUP → DUMP → complete. Never create two separate orders for a two-step job.
- **Dispatch board**: excludes cancelled and completed orders (`.not('status', 'in', '("cancelled","completed")')`).
- **Material auto-fill**: derive `bin_type` from order history linked to the selected bin (`bin_id` or `old_bin_id`), not just from the bin record.
- **Bin lookup for existing-bin orders**: filter bins by `location === address && status === 'in_use'`.
- **Ticket numbers**: `ST-` prefix + random alphanumeric (8 chars).

## Key Files

| File | Purpose |
|---|---|
| `app/dispatch/page.tsx` | Dispatch board (kanban + order management) |
| `app/order/page.tsx` | Full order CRUD page |
| `app/driver/page.tsx` | Driver mobile app (photo upload, workflow steps) |
| `app/dashboard/page.tsx` | Dashboard home |
| `app/settings/page.tsx` | Settings hub |
| `app/dump-sites/page.tsx` | Dump site CRUD |
| `components/NewOrderModal.tsx` | Shared create-order modal (used by dispatch + order page) |
| `lib/supabase/client.ts` | Supabase browser client |
| `lib/roles.ts` | RBAC helpers |
| `hooks/useRole.ts` | Role hook |

## Tenant Setup SQL
**All applied and verified on both current projects (SimpliiTrash + BR Garden Center) as of 2026-07-08.** Keep for onboarding any NEW tenant — run everything below in its Supabase project.

⚠ RLS note: every NEW table starts publicly exposed. Enable RLS + create the four `to authenticated` policies (select/insert/update/delete), same pattern as dump_sites below. Old projects may carry permissive "allow everyone" template policies that override new ones — drop all policies first (loop over pg_policies) when locking down an existing table.

```sql
ALTER TABLE "order" ADD COLUMN IF NOT EXISTS bin_number text;
ALTER TABLE "order" ADD COLUMN IF NOT EXISTS workflow_step text;
ALTER TABLE "order" ADD COLUMN IF NOT EXISTS parent_order_id uuid;
ALTER TABLE "order" ADD COLUMN IF NOT EXISTS dump_site_address text;
ALTER TABLE "order" ADD COLUMN IF NOT EXISTS delivery_photo_url text;
ALTER TABLE dump_sites ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE job_sites ADD COLUMN IF NOT EXISTS unit text;
ALTER TABLE job_sites ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE job_sites ADD COLUMN IF NOT EXISTS province text DEFAULT 'ON';
ALTER TABLE job_sites ADD COLUMN IF NOT EXISTS postal_code text;
UPDATE customers SET status = 'active' WHERE status IS NULL;
```

RLS policies for `dump_sites` (INSERT was blocked, found 2026-07-07 — run in both projects):

```sql
alter table dump_sites enable row level security;
drop policy if exists "dump_sites_select" on dump_sites;
drop policy if exists "dump_sites_insert" on dump_sites;
drop policy if exists "dump_sites_update" on dump_sites;
drop policy if exists "dump_sites_delete" on dump_sites;
create policy "dump_sites_select" on dump_sites for select to authenticated using (true);
create policy "dump_sites_insert" on dump_sites for insert to authenticated with check (true);
create policy "dump_sites_update" on dump_sites for update to authenticated using (true) with check (true);
create policy "dump_sites_delete" on dump_sites for delete to authenticated using (true);
```

Storage bucket `delivery-photos` (both projects — bucket must be PUBLIC for getPublicUrl display; upload uses upsert so UPDATE policy is required too):

```sql
insert into storage.buckets (id, name, public)
values ('delivery-photos', 'delivery-photos', true)
on conflict (id) do update set public = true;
drop policy if exists "delivery_photos_insert" on storage.objects;
drop policy if exists "delivery_photos_update" on storage.objects;
drop policy if exists "delivery_photos_select" on storage.objects;
create policy "delivery_photos_insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'delivery-photos');
create policy "delivery_photos_update" on storage.objects
  for update to authenticated using (bucket_id = 'delivery-photos') with check (bucket_id = 'delivery-photos');
create policy "delivery_photos_select" on storage.objects
  for select to authenticated using (bucket_id = 'delivery-photos');
```

(Verified 2026-07-07 on SimpliiTrash: bucket exists and is public; writes still RLS-blocked until the policies above are run.)

BR Garden Center: Rodrigo driver needs Supabase Auth account created and `auth_user_id` linked in `drivers` table.
