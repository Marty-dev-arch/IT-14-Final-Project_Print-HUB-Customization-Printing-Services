-- 0004_client_order_fields.sql
-- Adds structured printing order tracking fields to client records

alter table public.customers
  add column if not exists order_item text not null default '',
  add column if not exists quantity integer not null default 1,
  add column if not exists total_price numeric(12,2) not null default 0,
  add column if not exists order_date date not null default current_date,
  add column if not exists order_status text not null default 'Pending'
    check (order_status in ('Pending', 'In Progress', 'Done'));
