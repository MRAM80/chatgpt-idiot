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
- **Bin tracking is per-tenant**: `CLIENT_CONFIG.requireBin` (env `NEXT_PUBLIC_CLIENT_REQUIRE_BIN`, default true). SimpliiTrash requires bins; BR Garden Center sets `false` → all bin requirements (old_bin_id validation, driver bin gates) become optional. Any new bin validation must respect this flag.
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

`price_book` table (added 2026-07-22, stage 1 of invoicing — run in both projects):

```sql
create table if not exists price_book (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('service','product')),
  service_type text,
  bin_size text,
  name text,
  unit text,
  price numeric(10,2) not null default 0,
  customer_id uuid references customers(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table price_book enable row level security;
drop policy if exists "price_book_select" on price_book;
drop policy if exists "price_book_insert" on price_book;
drop policy if exists "price_book_update" on price_book;
drop policy if exists "price_book_delete" on price_book;
create policy "price_book_select" on price_book for select to authenticated using (true);
create policy "price_book_insert" on price_book for insert to authenticated with check (true);
create policy "price_book_update" on price_book for update to authenticated using (true) with check (true);
create policy "price_book_delete" on price_book for delete to authenticated using (true);
```

`invoices` + `invoice_items` (added 2026-07-22, stage 3 of invoicing — run in both projects). Invoice numbers come from a DB sequence so concurrent tills can't collide:

```sql
create sequence if not exists invoice_number_seq start 1;

create table if not exists invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null unique
    default ('INV-' || lpad(nextval('invoice_number_seq')::text, 5, '0')),
  kind text not null default 'counter' check (kind in ('counter','account')),
  customer_id uuid references customers(id) on delete set null,
  customer_name text,
  issue_date date not null default current_date,
  subtotal numeric(10,2) not null default 0,
  tax_rate numeric(5,2) not null default 13,
  tax_amount numeric(10,2) not null default 0,
  total numeric(10,2) not null default 0,
  status text not null default 'paid' check (status in ('draft','sent','paid','void')),
  payment_method text,
  notes text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id) on delete cascade,
  description text not null,
  unit text,
  quantity numeric(10,2) not null default 1,
  rate numeric(10,2) not null default 0,
  amount numeric(10,2) not null default 0,
  created_at timestamptz not null default now()
);

alter table invoices enable row level security;
alter table invoice_items enable row level security;
drop policy if exists "invoices_select" on invoices;
drop policy if exists "invoices_insert" on invoices;
drop policy if exists "invoices_update" on invoices;
drop policy if exists "invoices_delete" on invoices;
create policy "invoices_select" on invoices for select to authenticated using (true);
create policy "invoices_insert" on invoices for insert to authenticated with check (true);
create policy "invoices_update" on invoices for update to authenticated using (true) with check (true);
create policy "invoices_delete" on invoices for delete to authenticated using (true);
drop policy if exists "invoice_items_select" on invoice_items;
drop policy if exists "invoice_items_insert" on invoice_items;
drop policy if exists "invoice_items_update" on invoice_items;
drop policy if exists "invoice_items_delete" on invoice_items;
create policy "invoice_items_select" on invoice_items for select to authenticated using (true);
create policy "invoice_items_insert" on invoice_items for insert to authenticated with check (true);
create policy "invoice_items_update" on invoice_items for update to authenticated using (true) with check (true);
create policy "invoice_items_delete" on invoice_items for delete to authenticated using (true);
```

`order_items` (added 2026-07-30 — orders carry material and charges alongside the bin service, so one order covers a whole trip). The bin service itself is NOT a line: it stays as `order.order_type` + `bin_size` and is priced from the price book at billing time.

```sql
create table if not exists order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references "order"(id) on delete cascade,
  price_book_id uuid references price_book(id) on delete set null,
  kind text not null default 'product' check (kind in ('product','charge')),
  description text not null,
  unit text,
  quantity numeric(10,2) not null default 1,
  rate numeric(10,2) not null default 0,
  amount numeric(10,2) not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists order_items_order_id_idx on order_items(order_id);

alter table order_items enable row level security;
drop policy if exists "order_items_select" on order_items;
drop policy if exists "order_items_insert" on order_items;
drop policy if exists "order_items_update" on order_items;
drop policy if exists "order_items_delete" on order_items;
create policy "order_items_select" on order_items for select to authenticated using (true);
create policy "order_items_insert" on order_items for insert to authenticated with check (true);
create policy "order_items_update" on order_items for update to authenticated using (true) with check (true);
create policy "order_items_delete" on order_items for delete to authenticated using (true);

-- Which invoice settled this order, and whether it was paid when placed
alter table "order" add column if not exists invoice_id uuid references invoices(id) on delete set null;
alter table "order" add column if not exists prepaid boolean not null default false;

-- Stock movements can be caused by an order, not just a counter invoice
alter table stock_movements add column if not exists order_id uuid references "order"(id) on delete set null;
```

Retail inventory (added 2026-07-29 — stock lives on `price_book` products; `adjust_stock` is a function so concurrent tills can't clobber each other's read-modify-write):

```sql
alter table price_book add column if not exists track_stock boolean not null default false;
alter table price_book add column if not exists stock_qty numeric(10,2) not null default 0;
alter table price_book add column if not exists low_stock_at numeric(10,2);

create table if not exists stock_movements (
  id uuid primary key default gen_random_uuid(),
  price_book_id uuid not null references price_book(id) on delete cascade,
  movement_date date not null default current_date,
  kind text not null check (kind in ('receive','sale','adjust','return')),
  quantity numeric(10,2) not null,
  note text,
  invoice_id uuid references invoices(id) on delete set null,
  created_by uuid,
  created_at timestamptz not null default now()
);
alter table stock_movements enable row level security;
drop policy if exists "stock_movements_select" on stock_movements;
drop policy if exists "stock_movements_insert" on stock_movements;
drop policy if exists "stock_movements_update" on stock_movements;
drop policy if exists "stock_movements_delete" on stock_movements;
create policy "stock_movements_select" on stock_movements for select to authenticated using (true);
create policy "stock_movements_insert" on stock_movements for insert to authenticated with check (true);
create policy "stock_movements_update" on stock_movements for update to authenticated using (true) with check (true);
create policy "stock_movements_delete" on stock_movements for delete to authenticated using (true);

-- Receiving a delivery links the supplier bill to the stock it brought in
alter table expenses add column if not exists reference text;
alter table stock_movements add column if not exists expense_id uuid references expenses(id) on delete set null;

-- Atomic increment/decrement; returns the new quantity
create or replace function adjust_stock(p_id uuid, p_delta numeric)
returns numeric
language sql
security invoker
as $$
  update price_book
     set stock_qty = stock_qty + p_delta,
         updated_at = now()
   where id = p_id
  returning stock_qty;
$$;
grant execute on function adjust_stock(uuid, numeric) to authenticated;
```

`expenses` table (added 2026-07-28, stage 5 of invoicing — supplier bills feed the HST return's input tax credits):

```sql
create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  expense_date date not null default current_date,
  supplier text,
  category text,
  description text,
  subtotal numeric(10,2) not null default 0,
  tax_amount numeric(10,2) not null default 0,
  total numeric(10,2) not null default 0,
  payment_method text,
  receipt_url text,
  notes text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table expenses enable row level security;
drop policy if exists "expenses_select" on expenses;
drop policy if exists "expenses_insert" on expenses;
drop policy if exists "expenses_update" on expenses;
drop policy if exists "expenses_delete" on expenses;
create policy "expenses_select" on expenses for select to authenticated using (true);
create policy "expenses_insert" on expenses for insert to authenticated with check (true);
create policy "expenses_update" on expenses for update to authenticated using (true) with check (true);
create policy "expenses_delete" on expenses for delete to authenticated using (true);
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
