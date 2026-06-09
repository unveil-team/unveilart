-- Add all columns missing from the live artworks table
-- (migrations 004 + 006 were never applied to the Supabase project)

ALTER TABLE artworks
  ADD COLUMN IF NOT EXISTS price             NUMERIC,
  ADD COLUMN IF NOT EXISTS price_tier        TEXT CHECK (price_tier IN ('entry','mid','premium')),
  ADD COLUMN IF NOT EXISTS genre             TEXT,
  ADD COLUMN IF NOT EXISTS description       TEXT,
  ADD COLUMN IF NOT EXISTS arrival_condition TEXT,
  ADD COLUMN IF NOT EXISTS return_condition  TEXT,
  ADD COLUMN IF NOT EXISTS sold_at           TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS buyer_name        TEXT,
  ADD COLUMN IF NOT EXISTS buyer_email       TEXT,
  ADD COLUMN IF NOT EXISTS delivery_date     DATE,
  ADD COLUMN IF NOT EXISTS delivered_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sale_price        NUMERIC,
  ADD COLUMN IF NOT EXISTS artist_share      NUMERIC,
  ADD COLUMN IF NOT EXISTS venue_commission  NUMERIC,
  ADD COLUMN IF NOT EXISTS ua_share          NUMERIC,
  ADD COLUMN IF NOT EXISTS removed_at_ts     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS image_url         TEXT,
  ADD COLUMN IF NOT EXISTS dimensions        TEXT,
  ADD COLUMN IF NOT EXISTS published         BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS quantity          INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS memo              TEXT;

-- Artists table (migration 004 + 006 additions)
ALTER TABLE artists
  ADD COLUMN IF NOT EXISTS genre         TEXT,
  ADD COLUMN IF NOT EXISTS style         TEXT,
  ADD COLUMN IF NOT EXISTS portfolio_url TEXT,
  ADD COLUMN IF NOT EXISTS contract_date DATE,
  ADD COLUMN IF NOT EXISTS photo_url     TEXT,
  ADD COLUMN IF NOT EXISTS motto         TEXT,
  ADD COLUMN IF NOT EXISTS tags          TEXT[],
  ADD COLUMN IF NOT EXISTS published     BOOLEAN NOT NULL DEFAULT false;

-- Venues table (migration 004 additions)
ALTER TABLE venues
  ADD COLUMN IF NOT EXISTS contract_start   DATE,
  ADD COLUMN IF NOT EXISTS contract_renewal DATE,
  ADD COLUMN IF NOT EXISTS contract_status  TEXT DEFAULT 'active'
    CHECK (contract_status IN ('active','expired','negotiating')),
  ADD COLUMN IF NOT EXISTS contract_url     TEXT,
  ADD COLUMN IF NOT EXISTS contract_notes   TEXT;

-- Storage bucket for artist/artwork photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('artist-media', 'artist-media', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public read artist-media" ON storage.objects;
CREATE POLICY "Public read artist-media" ON storage.objects
  FOR SELECT USING (bucket_id = 'artist-media');
