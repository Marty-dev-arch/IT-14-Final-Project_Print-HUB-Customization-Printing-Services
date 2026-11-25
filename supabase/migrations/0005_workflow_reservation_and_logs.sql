-- 0005_workflow_reservation_and_logs.sql
-- Adds reservation fees, status lifecycle ('Pending' | 'Done' | 'Cancelled'),
-- inquiry quantity/total pricing, admin seen tracking, and history archival.

update public.customers
  set order_status = 'Pending'
  where order_status = 'In Progress';

alter table public.customers
  drop constraint if exists customers_order_status_check;

alter table public.customers
  add column if not exists reservation_fee numeric(12,2) default null,
  add column if not exists status_updated_at timestamptz not null default now();

alter table public.customers
  add constraint customers_order_status_check
  check (order_status in ('Pending', 'Done', 'Cancelled'));

alter table public.inquiries
  add column if not exists quantity integer not null default 1,
  add column if not exists total_price numeric(12,2) not null default 0,
  add column if not exists reservation_fee numeric(12,2) default null,
  add column if not exists admin_seen_at timestamptz default null,
  add column if not exists accepted_at timestamptz default null,
  add column if not exists archived_to_history boolean not null default false;
