CREATE TABLE artists (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  email        TEXT,
  phone        TEXT,
  instagram    TEXT,
  website      TEXT,
  bio          TEXT,
  status       TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  notes        TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER set_updated_at_artists
  BEFORE UPDATE ON artists
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE artworks ADD COLUMN artist_id UUID REFERENCES artists(id) ON DELETE SET NULL;

ALTER TABLE artists ENABLE ROW LEVEL SECURITY;
