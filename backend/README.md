# RJ HUB Printing — Backend Architecture (Phase 2)

> **Status:** Architectural scaffold only (Phase 1 runs purely on the frontend `localRepository` seam). Do not deploy or start a backend process until Supabase credentials and Vercel environment variables are provisioned.

## Planned Responsibilities (Section 07 of Project Plan)
- **`src/routes/`**: Express / Vercel serverless route definitions:
  - `POST /api/inquiries` — Public endpoint (validated, sanitized, rate-limited, bot-protected) that matches or creates a `customers` row and inserts a `Pending` inquiry.
  - `GET /api/admin/inquiries`, `GET /api/admin/inquiries/:id`, `PATCH /api/admin/inquiries/:id` — Admin-authenticated routes verified via Supabase JWT + `admin_profiles`.
  - `POST /api/admin/inquiries/:id/responses` — Saves administrator replies and updates inquiry status.
  - `GET/POST/PATCH/DELETE /api/admin/clients` — Client records management enforcing the unlink/anonymize retention rule on deletion.
- **`src/controllers/`**: Request handlers mapping HTTP payloads to Supabase queries.
- **`src/middleware/`**: Supabase JWT verification (`requireAdmin`), request rate limiting, and error formatting.
- **`src/validators/`**: Server-side schema validation mirroring `frontend/src/lib/validation.ts` (`customerName`, `contactInfo`, `serviceId`, `message` length and format guards).

## Security Baseline
- Never expose `SUPABASE_SERVICE_ROLE_KEY` in `frontend/`. Keep service-role keys strictly in server-side Vercel environment variables.
- All database access remains gated by PostgreSQL Row Level Security (RLS) defined in `../supabase/migrations/0001_initial_schema.sql`.
