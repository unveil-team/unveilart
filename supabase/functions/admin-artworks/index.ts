import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, handleOptions, json } from '../_shared/cors.ts';
import { verifyAdminToken } from '../_shared/auth.ts';
import { stripe, getOrCreatePrice, getOrCreateGSTTaxRate, calculateAmounts } from '../_shared/stripe.ts';

const sb = () => createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

async function getInstalledCount(supabase: ReturnType<typeof sb>, venueId: string): Promise<number> {
  const { data } = await supabase.from('artworks').select('id').eq('venue_id', venueId).eq('status', 'installed');
  return (data || []).length;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleOptions();
  if (!await verifyAdminToken(req)) return json({ error: 'Unauthorised' }, 401);

  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  const venueId = url.searchParams.get('venue_id');
  const supabase = sb();

  // POST — install artwork, create/update subscription
  if (req.method === 'POST') {
    const body = await req.json();
    const { venue_id } = body;

    const { data: venue, error: venueErr } = await supabase.from('venues').select('*').eq('id', venue_id).single();
    if (venueErr || !venue) return json({ error: 'Venue not found' }, 404);

    const { venue_id, title, artist_id, installed_at, condition_on_arrival, notes } = body;

    // Resolve artist name from artist_id
    let artist_name = body.artist_name || null;
    if (artist_id) {
      const { data: artist } = await supabase.from('artists').select('name').eq('id', artist_id).single();
      if (artist) artist_name = artist.name;
    }

    const { data: artwork, error: artErr } = await supabase.from('artworks').insert({ venue_id, title, artist_id: artist_id || null, artist_name, installed_at, condition_on_arrival, notes, status: 'installed' }).select().single();
    if (artErr) return json({ error: artErr.message }, 400);

    const newCount = await getInstalledCount(supabase, venue_id);
    const { amount, gstAmount, totalAmount } = calculateAmounts(newCount);

    try {
      if (!venue.stripe_subscription_id) {
        const priceId = await getOrCreatePrice();
        const taxRateId = await getOrCreateGSTTaxRate();
        const sub = await stripe.subscriptions.create({
          customer: venue.stripe_customer_id,
          items: [{ price: priceId, quantity: newCount }],
          default_tax_rates: [taxRateId],
          collection_method: 'send_invoice',
          days_until_due: 30,
        });
        await supabase.from('venues').update({ stripe_subscription_id: sub.id, status: 'active' }).eq('id', venue_id);
      } else {
        const sub = await stripe.subscriptions.retrieve(venue.stripe_subscription_id);
        await stripe.subscriptionItems.update(sub.items.data[0].id, { quantity: newCount, proration_behavior: 'create_prorations' });
      }
    } catch (stripeErr) {
      await supabase.from('artworks').delete().eq('id', artwork.id);
      return json({ error: `Stripe error: ${stripeErr.message}` }, 500);
    }

    return json({ artwork, subscription: { artwork_count: newCount, monthly_amount: amount, monthly_gst: gstAmount, monthly_total: totalAmount } }, 201);
  }

  // PATCH — update artwork details
  if (req.method === 'PATCH' && id) {
    const body = await req.json();
    const allowed = ['title', 'artist_name', 'installed_at', 'condition_on_arrival', 'condition_on_return', 'notes', 'status'];
    const updates: Record<string, unknown> = {};
    allowed.forEach(k => { if (body[k] !== undefined) updates[k] = body[k]; });
    const { data, error } = await supabase.from('artworks').update(updates).eq('id', id).select().single();
    if (error) return json({ error: error.message }, 400);
    return json(data);
  }

  // DELETE — remove artwork, update/cancel subscription
  if (req.method === 'DELETE' && id && venueId) {
    const body = req.headers.get('content-length') !== '0' ? await req.json().catch(() => ({})) : {};
    const removed_at = body.removed_at || new Date().toISOString().split('T')[0];

    const { data: venue } = await supabase.from('venues').select('*').eq('id', venueId).single();
    if (!venue) return json({ error: 'Venue not found' }, 404);

    await supabase.from('artworks').update({ status: 'removed', removed_at, condition_on_return: body.condition_on_return || null }).eq('id', id);

    const remainingCount = await getInstalledCount(supabase, venueId);

    if (remainingCount === 0 && venue.stripe_subscription_id) {
      await stripe.subscriptions.update(venue.stripe_subscription_id, { cancel_at_period_end: true });
      await supabase.from('venues').update({ stripe_subscription_id: null, status: 'inactive' }).eq('id', venueId);
    } else if (remainingCount > 0 && venue.stripe_subscription_id) {
      const sub = await stripe.subscriptions.retrieve(venue.stripe_subscription_id);
      await stripe.subscriptionItems.update(sub.items.data[0].id, { quantity: remainingCount, proration_behavior: 'create_prorations' });
    }

    const { amount, gstAmount, totalAmount } = calculateAmounts(remainingCount);
    return json({ removed: true, subscription: { artwork_count: remainingCount, monthly_amount: amount, monthly_gst: gstAmount, monthly_total: totalAmount } });
  }

  return json({ error: 'Not found' }, 404);
});
