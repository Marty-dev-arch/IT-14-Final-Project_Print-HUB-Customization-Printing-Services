# RJ HUB Printing — Supabase & PostgreSQL Architecture (Phase 2)

> **Status:** Prepared database migration and security blueprint (Phase 1 frontend operates via `localRepository`).

## Database Tables (`migrations/0001_initial_schema.sql`)
1. `admin_profiles` — Maps authenticated Supabase Auth users (`auth.users.id`) to administrator roles.
2. `customers` — Stores customer contact records and groups inquiry history.
3. `services` — Active catalog of the six RJ HUB Printing offerings.
4. `inquiries` — Customer inquiries with `Pending`, `Answered`, or `Completed` status, plus `customer_id ON DELETE SET NULL` and `is_customer_archived` so inquiry audit history survives client deletion.
5. `responses` — Saved administrator replies linked to `inquiries` and `admin_profiles`.

## Required Environment Variables (Phase 2)
- `VITE_SUPABASE_URL` — Public Supabase project URL (frontend)
- `VITE_SUPABASE_ANON_KEY` — Public anon key (frontend; never use service-role key here)
- `SUPABASE_SERVICE_ROLE_KEY` — Server-side only (`backend/` / Vercel env)
