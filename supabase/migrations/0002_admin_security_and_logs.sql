-- RJ HUB Printing — Phase 2: Separate Admin Security, 4-Layer Auth, Audit Logs, Rate Limiting, Google OAuth & Strict RLS

-- 1. Seed remaining active services
INSERT INTO services (id, service_name, description, is_active) VALUES
  ('sintra-board', 'Sintra Board', 'High-resolution mounted portrait and wall signage boards with rigid backing.', TRUE),
  ('custom-keychains', 'Custom Keychains', 'Clear double-sided acrylic photo keychains with metal split-ring loops.', TRUE),
  ('a4-calendar', 'A4 Calendar', 'Custom family and brand wall calendars with PH holidays and photo headers.', TRUE)
ON CONFLICT (id) DO NOTHING;

-- 2. Harden admin_profiles for provisioned 4-layer authentication (Argon2id password + 6-digit PIN + TOTP MFA)
ALTER TABLE admin_profiles ALTER COLUMN auth_user_id DROP NOT NULL;
ALTER TABLE admin_profiles
  ADD COLUMN IF NOT EXISTS email TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS password_hash TEXT,
  ADD COLUMN IF NOT EXISTS pin_hash TEXT,
  ADD COLUMN IF NOT EXISTS totp_secret_encrypted TEXT,
  ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS recovery_code_hashes TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS last_totp_step BIGINT,
  ADD COLUMN IF NOT EXISTS failed_login_attempts INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pin_failed_attempts INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pin_locked_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;

-- 3. Harden customers & responses
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'customers_notes_length_chk'
  ) THEN
    ALTER TABLE customers ADD CONSTRAINT customers_notes_length_chk CHECK (char_length(notes) <= 500);
  END IF;
END$$;

ALTER TABLE responses ALTER COLUMN admin_id DROP NOT NULL;
ALTER TABLE responses
  ADD COLUMN IF NOT EXISTS sender_role TEXT NOT NULL DEFAULT 'admin' CHECK (sender_role IN ('admin', 'customer')),
  ADD COLUMN IF NOT EXISTS image_data_url TEXT;

-- 4. Customer Google OAuth accounts linked optionally to customers CRM table
CREATE TABLE IF NOT EXISTS customer_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  google_sub TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL CHECK (char_length(trim(full_name)) BETWEEN 2 AND 100),
  avatar_url TEXT,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Active Admin Sessions (opaque token hash + idle/absolute TTL + rotation + step-up stage)
CREATE TABLE IF NOT EXISTS admin_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES admin_profiles(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  csrf_token_hash TEXT NOT NULL,
  auth_stage TEXT NOT NULL DEFAULT 'password_ok' CHECK (auth_stage IN ('password_ok', 'pin_ok', 'mfa_verified')),
  ip_address TEXT NOT NULL DEFAULT 'unknown',
  user_agent TEXT NOT NULL DEFAULT '',
  last_active_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  reauth_verified_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Immutable Activity & Security Audit Logs
CREATE TABLE IF NOT EXISTS activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_type TEXT NOT NULL CHECK (actor_type IN ('admin', 'customer', 'system')),
  actor_id TEXT,
  actor_identity TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'operations',
  action TEXT NOT NULL,
  description TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS security_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('info', 'warn', 'critical')),
  actor_identity TEXT NOT NULL DEFAULT '',
  ip_address TEXT NOT NULL DEFAULT 'unknown',
  description TEXT NOT NULL,
  target_id TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Centralized Rate Limiting Store (serverless-safe atomic buckets)
CREATE TABLE IF NOT EXISTS rate_limit_buckets (
  bucket_key TEXT PRIMARY KEY,
  count INT NOT NULL DEFAULT 1,
  reset_at TIMESTAMPTZ NOT NULL
);

CREATE OR REPLACE FUNCTION increment_rate_limit(p_key TEXT, p_window_seconds INT)
RETURNS TABLE (current_count INT, bucket_reset TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now TIMESTAMPTZ := NOW();
  v_reset TIMESTAMPTZ := v_now + make_interval(secs => p_window_seconds);
BEGIN
  INSERT INTO rate_limit_buckets (bucket_key, count, reset_at)
  VALUES (p_key, 1, v_reset)
  ON CONFLICT (bucket_key) DO UPDATE
  SET
    count = CASE WHEN rate_limit_buckets.reset_at <= v_now THEN 1 ELSE rate_limit_buckets.count + 1 END,
    reset_at = CASE WHEN rate_limit_buckets.reset_at <= v_now THEN v_reset ELSE rate_limit_buckets.reset_at END
  RETURNING rate_limit_buckets.count, rate_limit_buckets.reset_at INTO current_count, bucket_reset;
  RETURN NEXT;
END;
$$;

-- 8. Harden helper & enforce immutable audit logs
CREATE OR REPLACE FUNCTION is_rjhub_admin()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_profiles WHERE auth_user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION prevent_audit_log_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Audit logs are append-only and cannot be modified or deleted.';
END;
$$;

DROP TRIGGER IF EXISTS trg_activity_logs_immutable ON activity_logs;
CREATE TRIGGER trg_activity_logs_immutable
  BEFORE UPDATE OR DELETE ON activity_logs
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation();

DROP TRIGGER IF EXISTS trg_security_logs_immutable ON security_logs;
CREATE TRIGGER trg_security_logs_immutable
  BEFORE UPDATE OR DELETE ON security_logs
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation();

-- 9. Strict Deny-by-Default RLS on all tables
ALTER TABLE customer_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limit_buckets ENABLE ROW LEVEL SECURITY;

-- Public inquiries must flow through validated, rate-limited backend API (service role)
DROP POLICY IF EXISTS "Anonymous can submit pending inquiry only" ON inquiries;

DROP POLICY IF EXISTS "Admins read activity_logs" ON activity_logs;
CREATE POLICY "Admins read activity_logs"
  ON activity_logs FOR SELECT
  TO authenticated
  USING (is_rjhub_admin());

DROP POLICY IF EXISTS "Admins read security_logs" ON security_logs;
CREATE POLICY "Admins read security_logs"
  ON security_logs FOR SELECT
  TO authenticated
  USING (is_rjhub_admin());
