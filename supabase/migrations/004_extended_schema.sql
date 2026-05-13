-- UnveilArt extended schema: artwork metadata, settlements, settings

-- ============================================================
-- Extend artworks table
-- ============================================================
ALTER TABLE artworks
  ADD COLUMN IF NOT EXISTS price            NUMERIC,
  ADD COLUMN IF NOT EXISTS price_tier       TEXT CHECK (price_tier IN ('entry','mid','premium')),
  ADD COLUMN IF NOT EXISTS genre            TEXT,
  ADD COLUMN IF NOT EXISTS description      TEXT,
  ADD COLUMN IF NOT EXISTS arrival_condition  TEXT,
  ADD COLUMN IF NOT EXISTS return_condition   TEXT,
  ADD COLUMN IF NOT EXISTS sold_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS buyer_name       TEXT,
  ADD COLUMN IF NOT EXISTS buyer_email      TEXT,
  ADD COLUMN IF NOT EXISTS delivery_date    DATE,
  ADD COLUMN IF NOT EXISTS delivered_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sale_price       NUMERIC,
  ADD COLUMN IF NOT EXISTS artist_share     NUMERIC,
  ADD COLUMN IF NOT EXISTS venue_commission NUMERIC,
  ADD COLUMN IF NOT EXISTS ua_share         NUMERIC;

-- removed_at already exists as DATE; add a separate TIMESTAMPTZ for precision events
-- We alias via a new column to avoid breaking existing code
ALTER TABLE artworks
  ADD COLUMN IF NOT EXISTS removed_at_ts    TIMESTAMPTZ;

-- ============================================================
-- Extend artists table
-- ============================================================
ALTER TABLE artists
  ADD COLUMN IF NOT EXISTS genre         TEXT,
  ADD COLUMN IF NOT EXISTS style         TEXT,
  ADD COLUMN IF NOT EXISTS portfolio_url TEXT,
  ADD COLUMN IF NOT EXISTS contract_date DATE;

-- ============================================================
-- Extend venues table
-- ============================================================
ALTER TABLE venues
  ADD COLUMN IF NOT EXISTS contract_start   DATE,
  ADD COLUMN IF NOT EXISTS contract_renewal DATE,
  ADD COLUMN IF NOT EXISTS contract_status  TEXT DEFAULT 'active'
    CHECK (contract_status IN ('active','expired','negotiating')),
  ADD COLUMN IF NOT EXISTS contract_url     TEXT,
  ADD COLUMN IF NOT EXISTS contract_notes   TEXT;

-- ============================================================
-- artwork_history: tracks each venue installation lifecycle
-- ============================================================
CREATE TABLE IF NOT EXISTS artwork_history (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  artwork_id        UUID        NOT NULL REFERENCES artworks(id) ON DELETE CASCADE,
  venue_id          UUID        NOT NULL REFERENCES venues(id)   ON DELETE CASCADE,
  installed_at      TIMESTAMPTZ,
  removed_at        TIMESTAMPTZ,
  arrival_condition TEXT,
  return_condition  TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS artwork_history_artwork_id_idx ON artwork_history(artwork_id);
CREATE INDEX IF NOT EXISTS artwork_history_venue_id_idx   ON artwork_history(venue_id);

ALTER TABLE artwork_history DISABLE ROW LEVEL SECURITY;

-- ============================================================
-- settlements: monthly artist payment records
-- ============================================================
CREATE TABLE IF NOT EXISTS settlements (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id           UUID        NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  month               TEXT        NOT NULL, -- YYYY-MM
  subscription_amount NUMERIC     DEFAULT 0,
  sales_amount        NUMERIC     DEFAULT 0,
  total               NUMERIC     DEFAULT 0,
  status              TEXT        DEFAULT 'pending' CHECK (status IN ('pending','completed')),
  completed_at        TIMESTAMPTZ,
  notes               TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (artist_id, month)
);

CREATE INDEX IF NOT EXISTS settlements_artist_id_idx ON settlements(artist_id);
CREATE INDEX IF NOT EXISTS settlements_month_idx     ON settlements(month);
CREATE INDEX IF NOT EXISTS settlements_status_idx    ON settlements(status);

ALTER TABLE settlements DISABLE ROW LEVEL SECURITY;

-- ============================================================
-- settings: key/value admin configuration
-- ============================================================
CREATE TABLE IF NOT EXISTS settings (
  key        TEXT        PRIMARY KEY,
  value      TEXT        NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE settings DISABLE ROW LEVEL SECURITY;

-- Default settings
INSERT INTO settings (key, value) VALUES
  ('subscription_price',      '150'),
  ('gst_rate',                '0.10'),
  ('subscription_artist_rate','0.10'),
  ('entry_artist_rate',       '0.80'),
  ('mid_artist_rate',         '0.85'),
  ('premium_artist_rate',     '0.90'),
  ('entry_max',               '1500'),
  ('mid_max',                 '5000'),
  ('venue_commission_rate',   '0.50')
ON CONFLICT (key) DO NOTHING;
