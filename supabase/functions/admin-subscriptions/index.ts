import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, handleOptions, json } from '../_shared/cors.ts';
import { verifyAdminToken } from '../_shared/auth.ts';
import { stripe } from '../_shared/stripe.ts';

const sb = () => createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleOptions();
  if (!await verifyAdminToken(req)) return json({ error: 'Unauthorised' }, 401);

  const url = new URL(req.url);
  const venueId = url.searchParams.get('venue_id');
  const supabase = sb();

  // GET — subscription details
  if (req.method === 'GET' && venueId) {
    const { data: venue } = await supabase.from('venues').select('*').eq('id', venueId).single();
    if (!venue) return json({ error: 'Venue not found' }, 404);
    if (!venue.stripe_subscription_id) return json({ subscription: null });

    const sub = await stripe.subscriptions.retrieve(venue.stripe_subscription_id, {
      expand: ['latest_invoice', 'default_payment_method'],
    });
    return json({
      subscription: {
        id: sub.id,
        status: sub.status,
        quantity: sub.items.data[0]?.quantity || 0,
        current_period_start: new Date(sub.current_period_start * 1000),
        current_period_end: new Date(sub.current_period_end * 1000),
        cancel_at_period_end: sub.cancel_at_period_end,
        cancel_at: sub.cancel_at ? new Date(sub.cancel_at * 1000) : null,
      },
    });
  }

  // POST — cancel or get portal
  if (req.method === 'POST') {
    const body = await req.json();
    const vid = body.venue_id || venueId;
    const { data: venue } = await supabase.from('venues').select('*').eq('id', vid).single();
    if (!venue) return json({ error: 'Venue not found' }, 404);

    // Cancel subscription
    if (body.action === 'cancel') {
      if (!venue.stripe_subscription_id) return json({ error: 'No active subscription' }, 400);
      if (body.cancel_immediately) {
        await stripe.subscriptions.cancel(venue.stripe_subscription_id);
        await supabase.from('venues').update({ status: 'cancelled', stripe_subscription_id: null }).eq('id', vid);
      } else {
        await stripe.subscriptions.update(venue.stripe_subscription_id, { cancel_at_period_end: true });
      }
      return json({ cancelled: true, immediately: body.cancel_immediately });
    }

    // Customer portal
    if (body.action === 'portal') {
      const returnUrl = body.return_url || `https://www.unveilart.com.au/admin/venue.html?id=${vid}`;
      const session = await stripe.billingPortal.sessions.create({ customer: venue.stripe_customer_id, return_url: returnUrl });
      return json({ url: session.url });
    }

    return json({ error: 'Unknown action' }, 400);
  }

  return json({ error: 'Not found' }, 404);
});
