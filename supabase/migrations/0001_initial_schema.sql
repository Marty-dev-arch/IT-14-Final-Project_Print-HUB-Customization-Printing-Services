-- RJ HUB Printing — Initial Release 1 Schema (Section 06 & 07)
-- Covers FR-01 through FR-10; excludes deferred carts, orders, schedules, and payments.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE inquiry_status AS ENUM ('Pending', 'Answered', 'Completed');

CREATE TABLE IF NOT EXISTS admin_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL CHECK (char_length(trim(display_name)) BETWEEN 2 AND 100),
  role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('owner', 'admin', 'staff')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL CHECK (char_length(trim(full_name)) BETWEEN 2 AND 100),
  contact_info TEXT NOT NULL CHECK (char_length(trim(contact_info)) BETWEEN 5 AND 120),
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS services (
  id TEXT PRIMARY KEY,
  service_name TEXT NOT NULL,
  description TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS inquiries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_code TEXT NOT NULL UNIQUE,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  customer_name_snapshot TEXT NOT NULL,
  customer_contact_snapshot TEXT NOT NULL,
  is_customer_archived BOOLEAN NOT NULL DEFAULT FALSE,
  service_id TEXT NOT NULL REFERENCES services(id),
  message TEXT NOT NULL CHECK (char_length(trim(message)) BETWEEN 10 AND 2000),
  status inquiry_status NOT NULL DEFAULT 'Pending',
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inquiry_id UUID NOT NULL REFERENCES inquiries(id) ON DELETE CASCADE,
  admin_id UUID NOT NULL REFERENCES admin_profiles(id) ON DELETE RESTRICT,
  response_text TEXT NOT NULL CHECK (char_length(trim(response_text)) BETWEEN 2 AND 2000),
  responded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed the 6 approved Release 1 services
INSERT INTO services (id, service_name, description, is_active) VALUES
  ('lamination', 'Lamination', 'Protective matte or gloss film sealing for IDs, certificates, menus, and frequent-use prints.', TRUE),
  ('souvenir-making', 'Souvenir Making', 'Customized event keepsakes and giveaways tailored for birthdays, milestones, and school or corporate gatherings.', TRUE),
  ('document-printing', 'Document Printing', 'Clear, reliable black-and-white or full-color document runs for reports, handouts, forms, and study materials.', TRUE),
  ('refrigerator-magnets', 'Refrigerator Magnets', 'Full-color custom magnets sized for event favors, family keepsakes, and local business reminders.', TRUE),
  ('laser-engraving', 'Laser Engraving', 'Precision etched lettering, logos, and personal markings on custom gift items, tags, and keepsakes.', TRUE),
  ('mug-customization', 'Mug Customization', 'Vibrant heat-transferred mug prints for personal gifts, team merchandise, and milestone souvenirs.', TRUE)
ON CONFLICT (id) DO NOTHING;

-- Row Level Security (RLS)
ALTER TABLE admin_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE inquiries ENABLE ROW LEVEL SECURITY;
ALTER TABLE responses ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION is_rjhub_admin()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM admin_profiles WHERE auth_user_id = auth.uid()
  );
$$;

-- Public visitors can read active services only
CREATE POLICY "Public can view active services"
  ON services FOR SELECT
  TO anon, authenticated
  USING (is_active = TRUE);

-- Authenticated admins have full access to operational tables
CREATE POLICY "Admins manage admin_profiles"
  ON admin_profiles FOR SELECT
  TO authenticated
  USING (is_rjhub_admin());

CREATE POLICY "Admins manage customers"
  ON customers FOR ALL
  TO authenticated
  USING (is_rjhub_admin())
  WITH CHECK (is_rjhub_admin());

CREATE POLICY "Admins manage inquiries"
  ON inquiries FOR ALL
  TO authenticated
  USING (is_rjhub_admin())
  WITH CHECK (is_rjhub_admin());

-- Anonymous users may only submit new inquiries (through validated edge/API flow), never read or mutate
CREATE POLICY "Anonymous can submit pending inquiry only"
  ON inquiries FOR INSERT
  TO anon
  WITH CHECK (status = 'Pending' AND is_customer_archived = FALSE);

CREATE POLICY "Admins manage responses"
  ON responses FOR ALL
  TO authenticated
  USING (is_rjhub_admin())
  WITH CHECK (is_rjhub_admin());
