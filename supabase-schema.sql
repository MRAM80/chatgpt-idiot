-- ============================================================
-- BR Dispatch — Supabase Schema
-- Run this in the Supabase SQL Editor of the NEW project
-- ============================================================

-- Enable UUID extension
create extension if not exists "pgcrypto";

-- ── trucks ───────────────────────────────────────────────────
create table trucks (
  id uuid primary key default gen_random_uuid(),
  truck_number text,
  plate text,
  plate_number text,
  status text,
  notes text,
  created_at timestamptz default now()
);

-- ── drivers ──────────────────────────────────────────────────
create table drivers (
  id uuid primary key default gen_random_uuid(),
  name text,
  phone text,
  email text,
  status text default 'available',
  truck_id uuid references trucks(id),
  auth_user_id uuid,
  last_login_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ── customers ─────────────────────────────────────────────────
create table customers (
  id uuid primary key default gen_random_uuid(),
  name text,
  company_name text,
  contact_name text,
  phone text,
  email text,
  address text,
  service_address text,
  notes text,
  status text,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ── job_sites ─────────────────────────────────────────────────
create table job_sites (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references customers(id),
  site_name text,
  address text,
  notes text,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ── dump_sites ────────────────────────────────────────────────
create table dump_sites (
  id uuid primary key default gen_random_uuid(),
  name text,
  address text,
  created_at timestamptz default now()
);

-- ── bins ──────────────────────────────────────────────────────
create table bins (
  id uuid primary key default gen_random_uuid(),
  bin_number text,
  bin_size text,
  status text default 'available',
  location text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ── order ─────────────────────────────────────────────────────
create table "order" (
  id uuid primary key default gen_random_uuid(),
  ticket_number text,
  customer_name text,
  customer_phone text,
  customer_id uuid references customers(id),
  job_site_id uuid references job_sites(id),
  driver_id uuid references drivers(id),
  bin_id uuid references bins(id),
  old_bin_id uuid references bins(id),
  dump_site_id uuid references dump_sites(id),
  dump_site_address text,
  status text default 'unassigned',
  order_type text,
  bin_size integer,
  bin_type text,
  pickup_address text,
  dropoff_address text,
  service_address text,
  city text,
  postal_code text,
  service_date date,
  scheduled_date date,
  service_time text,
  service_window text,
  notes text,
  driver_notes text,
  delivery_photo_url text,
  route_position integer,
  completed_by text,
  completed_at timestamptz,
  parent_order_id uuid references "order"(id),
  workflow_step text,
  ticket_type text,
  priority text,
  material text,
  material_type text,
  job_type text,
  job_site_id_ref uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ── driver_push_subscriptions ─────────────────────────────────
create table driver_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid references drivers(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ── pre_trip_inspections ──────────────────────────────────────
create table pre_trip_inspections (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid,
  truck_id text,
  odometer text,
  items jsonb,
  has_major_defect boolean default false,
  created_at timestamptz default now()
);

-- ── profiles ──────────────────────────────────────────────────
create table profiles (
  id uuid primary key,
  email text,
  role text,
  full_name text,
  company text,
  is_active boolean default true,
  created_at timestamptz default now()
);

-- ── config ────────────────────────────────────────────────────
create table config (
  id bigserial primary key,
  type text,
  value text,
  created_at timestamptz default now()
);

-- ── Storage bucket for delivery photos ───────────────────────
insert into storage.buckets (id, name, public)
values ('delivery-photos', 'delivery-photos', true)
on conflict (id) do nothing;

-- ── Realtime ──────────────────────────────────────────────────
alter publication supabase_realtime add table "order";
alter publication supabase_realtime add table drivers;
alter publication supabase_realtime add table bins;
alter publication supabase_realtime add table customers;
alter publication supabase_realtime add table job_sites;

-- ── RLS (Row Level Security) ──────────────────────────────────
-- For now, disable RLS on all tables (same as current setup)
-- You can enable per-table later when adding user roles
alter table "order" disable row level security;
alter table drivers disable row level security;
alter table bins disable row level security;
alter table customers disable row level security;
alter table job_sites disable row level security;
alter table dump_sites disable row level security;
alter table trucks disable row level security;
alter table driver_push_subscriptions disable row level security;
alter table pre_trip_inspections disable row level security;
alter table profiles disable row level security;
alter table config disable row level security;
