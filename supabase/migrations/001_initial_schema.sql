-- UnveilArt subscription billing schema
-- Run in Supabase SQL Editor: https://supabase.com/dashboard/project/frgxtqljqliaafpxgloo/sql

-- venues
CREATE TABLE IF NOT EXISTS venues (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  text NOT NULL,
  contact_name          text,
  email                 text NOT NULL,
  phone                 text,
  venue_type            text CHECK (venue_type IN ('hotel','restaurant','cafe','bar','other')),
  address               text,
  stripe_customer_id    text UNIQUE,
  stripe_subscription_id text UNIQUE,
  status                text DEFAULT 'inactive' CHECK (status IN ('active','inactive','past_due','cancelled')),
  notes                 text,
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now()
);

-- artworks
CREATE TABLE IF NOT EXISTS artworks (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id              uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  title                 text,
  artist_name           text,
  installed_at          date,
  removed_at            date,
  condition_on_arrival  text,
  condition_on_return   text,
  status                text DEFAULT 'installed' CHECK (status IN ('installed','removed','sold')),
  notes                 text,
  created_at            timestamptz DEFAULT now()
);

-- payments
CREATE TABLE IF NOT EXISTS payments (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id                  uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  stripe_invoice_id         text UNIQUE,
  stripe_payment_intent_id  text,
  amount                    numeric,
  gst_amount                numeric,
  total_amount              numeric,
  artwork_count             int,
  status                    text CHECK (status IN ('paid','unpaid','failed')),
  paid_at                   timestamptz,
  invoice_url               text,
  created_at                timestamptz DEFAULT now()
);

-- indexes
CREATE INDEX IF NOT EXISTS artworks_venue_id_idx ON artworks(venue_id);
CREATE INDEX IF NOT EXISTS artworks_status_idx ON artworks(status);
CREATE INDEX IF NOT EXISTS payments_venue_id_idx ON payments(venue_id);
CREATE INDEX IF NOT EXISTS venues_stripe_customer_id_idx ON venues(stripe_customer_id);
CREATE INDEX IF NOT EXISTS venues_stripe_subscription_id_idx ON venues(stripe_subscription_id);

-- updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS venues_updated_at ON venues;
CREATE TRIGGER venues_updated_at
  BEFORE UPDATE ON venues
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Row Level Security (disable for server-side access with service key)
ALTER TABLE venues  DISABLE ROW LEVEL SECURITY;
ALTER TABLE artworks DISABLE ROW LEVEL SECURITY;
ALTER TABLE payments DISABLE ROW LEVEL SECURITY;
