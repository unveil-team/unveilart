import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-admin-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
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

const BUCKET = 'artist-media';
const ALLOWED_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png':  'png',
  'image/webp': 'webp',
  'image/gif':  'gif',
};
const MAX_BYTES = 8 * 1024 * 1024; // 8 MB

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// POST /admin-upload  { folder: 'artists'|'artworks', contentType, data: base64 }
// → uploads an image to the public artist-media bucket and returns its public URL
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleOptions();
  if (req.method !== 'POST') return json({ error: 'Not found' }, 404);
  if (!await verifyAdminToken(req)) return json({ error: 'Unauthorised' }, 401);

  const body = await req.json().catch(() => null);
  if (!body || typeof body.data !== 'string') return json({ error: 'data (base64) is required' }, 400);

  const contentType = String(body.contentType || '');
  const ext = ALLOWED_TYPES[contentType];
  if (!ext) return json({ error: 'Unsupported image type' }, 400);

  const folder = body.folder === 'artworks' ? 'artworks' : 'artists';

  let bytes: Uint8Array;
  try {
    bytes = base64ToBytes(body.data);
  } catch {
    return json({ error: 'Invalid base64 data' }, 400);
  }
  if (bytes.byteLength > MAX_BYTES) return json({ error: 'Image is too large (max 8 MB)' }, 400);

  const path = `${folder}/${crypto.randomUUID()}.${ext}`;

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { error: uploadErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType, upsert: false });

  if (uploadErr) return json({ error: uploadErr.message }, 400);

  const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return json({ url: pub.publicUrl, path }, 201);
});
