import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-admin-token',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
};

function handleOptions() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function verifyAdminToken(req: Request): Promise<boolean> {
  const password = Deno.env.get('ADMIN_PASSWORD');
  if (!password) return false;
  const token = req.headers.get('x-admin-token') || '';
  const encoder = new TextEncoder();
  const data = encoder.encode(password + ':unveilart-admin');
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const expected = Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  return token === expected;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleOptions();
  if (!await verifyAdminToken(req)) return json({ error: 'Unauthorised' }, 401);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const url = new URL(req.url);
  const id = url.searchParams.get('id');

  if (req.method === 'GET') {
    if (id) {
      const [artistRes, artworksRes, venuesRes] = await Promise.all([
        supabase.from('artists').select('*').eq('id', id).single(),
        supabase.from('artworks').select('id, title, venue_id, price, price_tier, status, installed_at, removed_at, sold_at, artist_name').eq('artist_id', id).order('installed_at', { ascending: false }),
        supabase.from('venues').select('id, name'),
      ]);
      if (artistRes.error) return json({ error: artistRes.error.message }, 400);
      const venueMap: Record<string, string> = {};
      (venuesRes.data || []).forEach((v: { id: string; name: string }) => { venueMap[v.id] = v.name; });
      const artworks = (artworksRes.data || []).map((a: { venue_id: string | null; [key: string]: unknown }) => ({
        ...a,
        venue_name: a.venue_id ? (venueMap[a.venue_id] ?? null) : null,
      }));
      return json({ ...artistRes.data, artworks });
    }

    const { data, error } = await supabase.from('artists').select('*').order('name', { ascending: true });
    if (error) return json({ error: error.message }, 400);

    const { data: counts } = await supabase.from('artworks').select('artist_id').eq('status', 'installed');
    const countMap: Record<string, number> = {};
    (counts || []).forEach((a: { artist_id: string }) => {
      if (a.artist_id) countMap[a.artist_id] = (countMap[a.artist_id] || 0) + 1;
    });
    return json((data || []).map((a: { id: string }) => ({ ...a, installed_count: countMap[a.id] || 0 })));
  }

  if (req.method === 'POST') {
    const body = await req.json();
    const { name, email, phone, instagram, website, bio, notes } = body;
    if (!name) return json({ error: 'name is required' }, 400);
    const { data, error } = await supabase.from('artists').insert({ name, email, phone, instagram, website, bio, notes }).select().single();
    if (error) return json({ error: error.message }, 400);
    return json(data, 201);
  }

  if (req.method === 'PATCH' && id) {
    const body = await req.json();
    const allowed = [
      'name', 'email', 'phone', 'instagram', 'website', 'bio', 'notes', 'status',
      'genre', 'style', 'portfolio_url', 'contract_date',
      'photo_url', 'motto', 'tags', 'published',
    ];
    const updates: Record<string, unknown> = {};
    allowed.forEach(k => { if (body[k] !== undefined) updates[k] = body[k]; });
    const { data, error } = await supabase.from('artists').update(updates).eq('id', id).select().single();
    if (error) return json({ error: error.message }, 400);
    return json(data);
  }

  return json({ error: 'Not found' }, 404);
});
