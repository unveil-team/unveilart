import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, handleOptions, json } from '../_shared/cors.ts';
import { verifyAdminToken } from '../_shared/auth.ts';
import { stripe, calculateAmounts } from '../_shared/stripe.ts';

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

  // GET — list all venues or single venue detail
  if (req.method === 'GET') {
    if (id) {
      const [venueRes, artworksRes, paymentsRes] = await Promise.all([
        supabase.from('venues').select('*').eq('id', id).single(),
        supabase.from('artworks').select('*, artists(id, name, instagram)').eq('venue_id', id).order('installed_at', { ascending: false }),
        supabase.from('payments').select('*').eq('venue_id', id).order('created_at', { ascending: false }),
      ]);
      if (venueRes.error) return json({ error: venueRes.error.message }, 400);
      const artworkCount = (artworksRes.data || []).filter((a: { status: string }) => a.status === 'installed').length;
      const { amount, gstAmount, totalAmount } = calculateAmounts(artworkCount);
      return json({ ...venueRes.data, artwork_count: artworkCount, monthly_amount: amount, monthly_gst: gstAmount, monthly_total: totalAmount, artworks: artworksRes.data || [], payments: paymentsRes.data || [] });
    }

    const { data: venues, error } = await supabase.from('venues').select('*').order('created_at', { ascending: false });
    if (error) return json({ error: error.message }, 400);
    const { data: artworkCounts } = await supabase.from('artworks').select('venue_id').eq('status', 'installed');
    const countMap: Record<string, number> = {};
    (artworkCounts || []).forEach((a: { venue_id: string }) => { countMap[a.venue_id] = (countMap[a.venue_id] || 0) + 1; });
    const enriched = (venues || []).map((v: { id: string }) => {
      const count = countMap[v.id] || 0;
      const { amount, gstAmount, totalAmount } = calculateAmounts(count);
      return { ...v, artwork_count: count, monthly_amount: amount, monthly_gst: gstAmount, monthly_total: totalAmount };
    });
    return json(enriched);
  }

  // POST — create venue + Stripe customer
  if (req.method === 'POST') {
    const body = await req.json();
    const { name, contact_name, email, phone, venue_type, address, notes } = body;
    if (!name || !email) return json({ error: 'name and email are required' }, 400);

    const customer = await stripe.customers.create({ name, email, phone: phone || undefined });
    const { data, error } = await supabase.from('venues').insert({ name, contact_name, email, phone, venue_type, address, notes, stripe_customer_id: customer.id, status: 'inactive' }).select().single();
    if (error) return json({ error: error.message }, 400);
    return json(data, 201);
  }

  // PATCH — update venue info
  if (req.method === 'PATCH' && id) {
    const body = await req.json();
    const allowed = ['name', 'contact_name', 'email', 'phone', 'venue_type', 'address', 'notes'];
    const updates: Record<string, unknown> = {};
    allowed.forEach(k => { if (body[k] !== undefined) updates[k] = body[k]; });
    const { data, error } = await supabase.from('venues').update(updates).eq('id', id).select().single();
    if (error) return json({ error: error.message }, 400);
    return json(data);
  }

  return json({ error: 'Not found' }, 404);
});
