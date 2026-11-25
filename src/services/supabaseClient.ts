// Phase 2 Supabase client integration point.
// Phase 1 operates completely offline-capable via localRepository.ts.
// When connecting Supabase in Phase 2:
// 1. Install `@supabase/supabase-js` in `frontend/`.
// 2. Populate `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `frontend/.env`.
// 3. Implement a Supabase-backed `DataRepository` & `AuthService` matching `./repository.ts`.

export const SUPABASE_CONFIG = {
  url: import.meta.env.VITE_SUPABASE_URL ?? '',
  anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? '',
  isConfigured: Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY),
} as const;
