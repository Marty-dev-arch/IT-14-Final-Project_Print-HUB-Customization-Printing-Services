-- 0003_customer_reviews.sql
-- Stores verified customer reviews submitted on RJ HUB Printing (zero seeded demo data)

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  author_name text not null,
  initials text not null,
  role_label text not null default 'Verified Customer',
  quote text not null,
  rating integer not null check (rating between 1 and 5),
  created_at timestamptz not null default now()
);

create index if not exists reviews_created_at_idx
  on public.reviews (created_at desc);

alter table public.reviews enable row level security;

create policy "Public can read customer reviews"
  on public.reviews
  for select
  to anon, authenticated
  using (true);

create policy "Admins manage customer reviews"
  on public.reviews
  for all
  to authenticated
  using (public.is_rjhub_admin())
  with check (public.is_rjhub_admin());
