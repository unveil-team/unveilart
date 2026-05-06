-- Enable RLS — all access goes through Edge Functions (service_role key bypasses RLS)
ALTER TABLE venues   ENABLE ROW LEVEL SECURITY;
ALTER TABLE artworks ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
