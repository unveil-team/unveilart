import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleOptions, json } from '../_shared/cors.ts';
import { verifyAdminToken } from '../_shared/auth.ts';

const sb = () => createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleOptions();
  if (!await verifyAdminToken(req)) return json({ error: 'Unauthorised' }, 401);

  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  const supabase = sb();

  // GET — list all artists or single artist detail
  if (req.method === 'GET') {
    if (id) {
      const [artistRes, artworksRes] = await Promise.all([
        supabase.from('artists').select('*').eq('id', id).single(),
        supabase.from('artworks').select('*, venues(name)').eq('artist_id', id).order('installed_at', { ascending: false }),
      ]);
      if (artistRes.error) return json({ error: artistRes.error.message }, 400);
      return json({ ...artistRes.data, artworks: artworksRes.data || [] });
    }

    const { data, error } = await supabase.from('artists').select('*').order('name', { ascending: true });
    if (error) return json({ error: error.message }, 400);

    // Artwork counts per artist
    const { data: counts } = await supabase.from('artworks').select('artist_id').eq('status', 'installed');
    const countMap: Record<string, number> = {};
    (counts || []).forEach((a: { artist_id: string }) => {
      if (a.artist_id) countMap[a.artist_id] = (countMap[a.artist_id] || 0) + 1;
    });
    return json((data || []).map((a: { id: string }) => ({ ...a, installed_count: countMap[a.id] || 0 })));
  }

  // POST — create artist
  if (req.method === 'POST') {
    const body = await req.json();
    const { name, email, phone, instagram, website, bio, notes } = body;
    if (!name) return json({ error: 'name is required' }, 400);
    const { data, error } = await supabase.from('artists').insert({ name, email, phone, instagram, website, bio, notes }).select().single();
    if (error) return json({ error: error.message }, 400);
    return json(data, 201);
  }

  // PATCH — update artist
  if (req.method === 'PATCH' && id) {
    const body = await req.json();
    const allowed = ['name', 'email', 'phone', 'instagram', 'website', 'bio', 'notes', 'status'];
    const updates: Record<string, unknown> = {};
    allowed.forEach(k => { if (body[k] !== undefined) updates[k] = body[k]; });
    const { data, error } = await supabase.from('artists').update(updates).eq('id', id).select().single();
    if (error) return json({ error: error.message }, 400);
    return json(data);
  }

  return json({ error: 'Not found' }, 404);
});
