import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@16.0.0?target=deno';

// ── Inline helpers ────────────────────────────────────────────────────────────

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

function getStripe() {
  return new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
    apiVersion: '2024-06-20' as Parameters<typeof Stripe>[1]['apiVersion'],
    httpClient: Stripe.createFetchHttpClient(),
  });
}

function calculateAmounts(artworkCount: number) {
  const amount      = artworkCount * 150;
  const gstAmount   = Math.round(amount * 0.10 * 100) / 100;
  const totalAmount = Math.round((amount + gstAmount) * 100) / 100;
  return { amount, gstAmount, totalAmount };
}

// ── Supabase client ───────────────────────────────────────────────────────────

const sb = () => createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleOptions();
  if (!await verifyAdminToken(req)) return json({ error: 'Unauthorised' }, 401);

  const url      = new URL(req.url);
  const id       = url.searchParams.get('id');
  const supabase = sb();

  // GET — list all venues or single venue detail
  if (req.method === 'GET') {
    if (id) {
      const [venueRes, artworksRes, paymentsRes] = await Promise.all([
        supabase.from('venues').select('*').eq('id', id).single(),
        supabase
          .from('artworks')
          .select('id, title, artist_id, artist_name, price, price_tier, status, installed_at, removed_at, arrival_condition, return_condition, sold_at, sale_price, notes')
          .eq('venue_id', id)
          .order('installed_at', { ascending: false }),
        supabase
          .from('payments')
          .select('*')
          .eq('venue_id', id)
          .order('created_at', { ascending: false }),
      ]);

      if (venueRes.error) return json({ error: venueRes.error.message }, 400);

      const artworkCount = (artworksRes.data || []).filter(
        (a: { status: string }) => a.status === 'installed'
      ).length;

      const { amount, gstAmount, totalAmount } = calculateAmounts(artworkCount);

      return json({
        ...venueRes.data,
        artwork_count:   artworkCount,
        installed_count: artworkCount,
        monthly_amount:  amount,
        monthly_gst:     gstAmount,
        monthly_total:   totalAmount,
        artworks:        artworksRes.data  || [],
        payments:        paymentsRes.data  || [],
      });
    }

    // List all venues with installed artwork counts
    const { data: venues, error } = await supabase
      .from('venues')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) return json({ error: error.message }, 400);

    const { data: artworkCounts } = await supabase
      .from('artworks')
      .select('venue_id')
      .eq('status', 'installed');

    const countMap: Record<string, number> = {};
    (artworkCounts || []).forEach((a: { venue_id: string }) => {
      countMap[a.venue_id] = (countMap[a.venue_id] || 0) + 1;
    });

    const enriched = (venues || []).map((v: { id: string }) => {
      const count = countMap[v.id] || 0;
      const { amount, gstAmount, totalAmount } = calculateAmounts(count);
      return {
        ...v,
        artwork_count:   count,
        installed_count: count,
        monthly_amount:  amount,
        monthly_gst:     gstAmount,
        monthly_total:   totalAmount,
      };
    });

    return json(enriched);
  }

  // POST — create venue + Stripe customer
  if (req.method === 'POST') {
    const body = await req.json().catch(() => ({}));
    const { name, contact_name, email, phone, venue_type, address, notes } = body;

    if (!name || !email) return json({ error: 'name and email are required' }, 400);

    let stripeCustomerId: string | null = null;
    try {
      const stripe = getStripe();
      const customer = await stripe.customers.create({
        name,
        email,
        phone: phone || undefined,
      });
      stripeCustomerId = customer.id;
    } catch {
      // Stripe customer creation is non-blocking; venue is still created
    }

    const { data, error } = await supabase
      .from('venues')
      .insert({
        name,
        contact_name,
        email,
        phone,
        venue_type,
        address,
        notes,
        stripe_customer_id: stripeCustomerId,
        status: 'inactive',
      })
      .select()
      .single();

    if (error) return json({ error: error.message }, 400);
    return json(data, 201);
  }

  // PATCH — update venue fields
  if (req.method === 'PATCH' && id) {
    const body = await req.json().catch(() => ({}));
    const allowed = ['name', 'contact_name', 'email', 'phone', 'venue_type', 'address', 'notes', 'status'];
    const updates: Record<string, unknown> = {};
    allowed.forEach(k => { if (body[k] !== undefined) updates[k] = body[k]; });

    if (Object.keys(updates).length === 0) {
      return json({ error: 'No valid fields provided to update' }, 400);
    }

    const { data, error } = await supabase
      .from('venues')
      .update(updates)
      .eq('id', id)
      .select()
      .maybeSingle();

    if (error) return json({ error: error.message }, 400);
    if (!data) return json({ error: 'Venue not found' }, 404);
    return json(data);
  }

  return json({ error: 'Not found' }, 404);
});
