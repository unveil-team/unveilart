-- Migration 005: Fix schema for stored artworks and status values

-- venue_id: make nullable so artworks can exist without a venue (stored/sold state)
ALTER TABLE artworks ALTER COLUMN venue_id DROP NOT NULL;

-- status: add 'stored' value (artworks not yet at any venue)
ALTER TABLE artworks DROP CONSTRAINT IF EXISTS artworks_status_check;
ALTER TABLE artworks ADD CONSTRAINT artworks_status_check
  CHECK (status IN ('installed', 'stored', 'removed', 'sold'));

-- artist_id: already nullable (added in 003), ensure it is
ALTER TABLE artworks ALTER COLUMN artist_id DROP NOT NULL;

-- Backfill: artworks with removed/sold status and no venue_id are fine as-is
-- Artworks still at a venue keep venue_id populated
