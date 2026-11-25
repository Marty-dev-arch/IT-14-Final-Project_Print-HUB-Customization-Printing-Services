# RJ HUB Printing — Production Setup & Deployment Guide

This repository contains **three isolated deployable applications** wired to one shared **Supabase PostgreSQL** database and **Google OAuth** identity provider:

1. **Public Customer Website** (root `.`) — `https://rjhubprinting.com`
2. **Backend API** (`backend/`) — Node.js + Express + TypeScript (deployed on Vercel Serverless or Node 26+)
3. **Administrator Panel** (`admin/`) — `https://admin.rjhubprinting.com` (physically separate frontend with strict `#8FE515` + daylight workspace UI)

---

## 1. Supabase PostgreSQL Setup

1. Create a Supabase project (or open your existing RJ HUB project).
2. Open **SQL Editor** in the Supabase Dashboard and run the migrations **in exact order**:
   - `supabase/migrations/0001_initial_schema.sql`
   - `supabase/migrations/0002_admin_security_and_logs.sql`
   - `supabase/migrations/0003_customer_reviews.sql`
   - `supabase/migrations/0004_client_order_fields.sql`
   - `supabase/migrations/0005_workflow_reservation_and_logs.sql`
3. From **Project Settings → API**, copy:
   - `Project URL` (`SUPABASE_URL` / `VITE_SUPABASE_URL`)
   - `anon public` key (`VITE_SUPABASE_ANON_KEY`)
   - `service_role secret` key (`SUPABASE_SERVICE_ROLE_KEY` — **backend only, never put in frontend env vars**)

> [!IMPORTANT]
> Migration `0002_admin_security_and_logs.sql` revokes direct anonymous `INSERT` on `inquiries` and enforces append-only immutability triggers (`prevent_audit_log_mutation`) on `activity_logs` and `security_logs`. All public inquiries flow through the rate-limited Backend API.

---

## 2. Google OAuth 2.0 Setup (Customer Sign-In)

1. Go to [Google Cloud Console → APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials).
2. Create or select an **OAuth 2.0 Client ID** (Application type: **Web application**).
3. Under **Authorized JavaScript origins**, add:
   - Local dev: `http://localhost:5173`
   - Production: `https://rjhubprinting.com` and `https://www.rjhubprinting.com`
4. Under **Authorized redirect URIs**, add your Supabase callback URL if using Supabase Auth OAuth (`https://<your-project-ref>.supabase.co/auth/v1/callback`) and `http://localhost:5173`.
5. Copy the **Client ID** (`*.apps.googleusercontent.com`) into:
   - Root `.env` → `VITE_GOOGLE_CLIENT_ID=<client-id>`
   - `backend/.env` → `GOOGLE_CLIENT_ID=<client-id>`

---

## 3. Environment Variables

### A. Backend (`backend/.env`)

Copy `backend/.env.example` to `backend/.env`:

```env
NODE_ENV=production
PORT=3001
ALLOWED_ADMIN_ORIGINS=https://admin.rjhubprinting.com
ALLOWED_PUBLIC_ORIGINS=https://rjhubprinting.com
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role-secret>
GOOGLE_CLIENT_ID=<google-oauth-client-id>
SESSION_HMAC_SECRET=<64-hex-char-secret>
PIN_HMAC_SECRET=<64-hex-char-secret>
TOTP_ENCRYPTION_KEY=<64-hex-char-key>
TOTP_ISSUER=RJ HUB Printing
COOKIE_DOMAIN=.rjhubprinting.com
```

Generate random 32-byte (64-hex) secrets with Node:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### B. Public Customer Site (root `.env`)

Copy `.env.example` to `.env`:

```env
VITE_API_BASE_URL=https://api.rjhubprinting.com
VITE_GOOGLE_CLIENT_ID=<google-oauth-client-id>
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>
```

### C. Administrator Panel (`admin/.env`)

Copy `admin/.env.example` to `admin/.env`:

```env
VITE_API_BASE_URL=https://api.rjhubprinting.com
```

> [!NOTE]
> During local development, leave `VITE_API_BASE_URL` unset so Vite proxies `/api` to `http://localhost:3001`. If `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` are omitted locally, the backend safely falls back to `backend/.local-data/store.json`.

---

## 4. Provision Your First Administrator Account

Public admin self-registration is blocked by design. Create your owner or staff account securely from the backend CLI (`backend/`):

```powershell
cd backend
npm install
$env:ADMIN_EMAIL="owner@rjhubprinting.com"
$env:ADMIN_NAME="RJ Hub Owner"
$env:ADMIN_ROLE="owner"
$env:ADMIN_PASSWORD="Use-A-Strong-Unique-Password-12!"
$env:ADMIN_PIN="482913"
npm run provision-admin
```

The script prints your **RFC 6238 `otpauth://` TOTP URI** (add to Google Authenticator / 1Password) and **8 single-use recovery codes**. Store them offline immediately.

---

## 5. Vercel Deployment (3 Separate Projects)

Create three Vercel projects from this Git repository:

| Project | Root Directory | Custom Domain | Build Command | Output Directory |
| :--- | :--- | :--- | :--- | :--- |
| Public Website | `.` | `rjhubprinting.com` | `npm run build` | `dist` |
| Administrator Panel | `admin` | `admin.rjhubprinting.com` | `npm run build` | `dist` |
| Backend API | `backend` | `api.rjhubprinting.com` | `npm run build` | Uses `vercel.json` -> `api/index.ts` |

Add DNS records in your domain registrar:
- `A` / `ALIAS` `@` → Vercel (`rjhubprinting.com`)
- `CNAME` `admin` → `cname.vercel-dns.com` (`admin.rjhubprinting.com`)
- `CNAME` `api` → `cname.vercel-dns.com` (`api.rjhubprinting.com`)
