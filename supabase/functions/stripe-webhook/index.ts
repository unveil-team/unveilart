import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/cors.ts';
import { stripe, calculateAmounts } from '../_shared/stripe.ts';

const sb = () => createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });

  const sig = req.headers.get('stripe-signature');
  const body = await req.text();
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');

  let event;
  try {
    if (webhookSecret && sig) {
      event = await stripe.webhooks.constructEventAsync(body, sig, webhookSecret);
    } else {
      event = JSON.parse(body);
    }
  } catch (err) {
    return json({ error: `Webhook error: ${err.message}` }, 400);
  }

  const supabase = sb();

  const getVenueByCustomer = async (customerId: string) => {
    const { data } = await supabase.from('venues').select('*').eq('stripe_customer_id', customerId).single();
    return data;
  };

  try {
    switch (event.type) {
      case 'invoice.paid': {
        const invoice = event.data.object;
        const venue = await getVenueByCustomer(invoice.customer);
        if (!venue) break;
        const artworkCount = invoice.lines?.data?.[0]?.quantity || 0;
        const { amount, gstAmount, totalAmount } = calculateAmounts(artworkCount);
        await supabase.from('payments').upsert({
          venue_id: venue.id,
          stripe_invoice_id: invoice.id,
          stripe_payment_intent_id: invoice.payment_intent,
          amount, gst_amount: gstAmount, total_amount: totalAmount, artwork_count: artworkCount,
          status: 'paid',
          paid_at: new Date((invoice.status_transitions?.paid_at || Date.now() / 1000) * 1000),
          invoice_url: invoice.hosted_invoice_url,
        }, { onConflict: 'stripe_invoice_id' });
        await supabase.from('venues').update({ status: 'active' }).eq('id', venue.id);
        break;
      }
      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const venue = await getVenueByCustomer(invoice.customer);
        if (!venue) break;
        const artworkCount = invoice.lines?.data?.[0]?.quantity || 0;
        const { amount, gstAmount, totalAmount } = calculateAmounts(artworkCount);
        await supabase.from('payments').upsert({
          venue_id: venue.id,
          stripe_invoice_id: invoice.id,
          stripe_payment_intent_id: invoice.payment_intent,
          amount, gst_amount: gstAmount, total_amount: totalAmount, artwork_count: artworkCount,
          status: 'failed',
          invoice_url: invoice.hosted_invoice_url,
        }, { onConflict: 'stripe_invoice_id' });
        await supabase.from('venues').update({ status: 'past_due' }).eq('id', venue.id);
        break;
      }
      case 'invoice.payment_action_required': {
        const invoice = event.data.object;
        const venue = await getVenueByCustomer(invoice.customer);
        if (venue) await supabase.from('venues').update({ status: 'past_due' }).eq('id', venue.id);
        break;
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        const { data: venue } = await supabase.from('venues').select('id').eq('stripe_subscription_id', sub.id).single();
        if (venue) await supabase.from('venues').update({ status: 'cancelled', stripe_subscription_id: null }).eq('id', venue.id);
        break;
      }
    }
    return json({ received: true });
  } catch (err) {
    console.error(err);
    return json({ error: err.message }, 500);
  }
});
