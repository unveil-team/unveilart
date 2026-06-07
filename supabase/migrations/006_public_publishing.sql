-- Publishing fields so admin-managed artists/artworks can be shown on the public site,
-- plus a storage bucket for their photos.

ALTER TABLE artists
  ADD COLUMN IF NOT EXISTS photo_url TEXT,
  ADD COLUMN IF NOT EXISTS motto     TEXT,
  ADD COLUMN IF NOT EXISTS tags      TEXT[],
  ADD COLUMN IF NOT EXISTS published BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE artworks
  ADD COLUMN IF NOT EXISTS image_url  TEXT,
  ADD COLUMN IF NOT EXISTS dimensions TEXT,
  ADD COLUMN IF NOT EXISTS published  BOOLEAN NOT NULL DEFAULT false;

INSERT INTO storage.buckets (id, name, public)
VALUES ('artist-media', 'artist-media', true)
ON CONFLICT (id) DO NOTHING;

-- Photos are uploaded only via the admin-upload edge function (service-role key),
-- but need to be readable by anyone visiting the public site.
DROP POLICY IF EXISTS "Public read artist-media" ON storage.objects;
CREATE POLICY "Public read artist-media" ON storage.objects
  FOR SELECT USING (bucket_id = 'artist-media');
