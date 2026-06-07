import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
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

// Public, unauthenticated read-only feed of published artists/artworks for unveilart.com.au
//   GET /public-artists        → list of published artists (card-level fields)
//   GET /public-artists?id=X   → a single published artist with their published artworks
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleOptions();
  if (req.method !== 'GET') return json({ error: 'Not found' }, 404);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const url = new URL(req.url);
  const id = url.searchParams.get('id');

  if (id) {
    const [artistRes, artworksRes] = await Promise.all([
      supabase.from('artists')
        .select('id, name, genre, style, bio, motto, tags, photo_url')
        .eq('id', id).eq('published', true).single(),
      supabase.from('artworks')
        .select('id, title, image_url, dimensions, description')
        .eq('artist_id', id).eq('published', true)
        .not('image_url', 'is', null)
        .order('created_at', { ascending: false }),
    ]);

    if (artistRes.error) return json({ error: 'Artist not found' }, 404);

    return json({ ...artistRes.data, artworks: artworksRes.data || [] });
  }

  const { data, error } = await supabase
    .from('artists')
    .select('id, name, genre, style, photo_url')
    .eq('published', true)
    .order('name', { ascending: true });

  if (error) return json({ error: error.message }, 400);
  return json(data || []);
});
