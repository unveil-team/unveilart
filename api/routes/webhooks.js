const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');
const { constructWebhookEvent, calculateAmounts } = require('../lib/stripe');

// POST /api/webhooks/stripe — raw body required (set in server.js before json middleware)
router.post('/stripe', async (req, res) => {
  const sig = req.headers['stripe-signature'];

  let event;
  try {
    if (process.env.STRIPE_WEBHOOK_SECRET) {
      event = constructWebhookEvent(req.body, sig);
    } else {
      // Dev mode: no signature verification
      event = JSON.parse(req.body.toString());
    }
  } catch (err) {
    console.error('Webhook signature error:', err.message);
    return res.status(400).json({ error: `Webhook error: ${err.message}` });
  }

  try {
    switch (event.type) {
      case 'invoice.paid':
        await handleInvoicePaid(event.data.object);
        break;
      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(event.data.object);
        break;
      case 'invoice.payment_action_required':
        await handlePaymentActionRequired(event.data.object);
        break;
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object);
        break;
      default:
        break;
    }

    res.json({ received: true });
  } catch (err) {
    console.error(`Error handling ${event.type}:`, err);
    res.status(500).json({ error: err.message });
  }
});

async function getVenueByCustomerId(customerId) {
  const { data, error } = await supabase
    .from('venues')
    .select('*')
    .eq('stripe_customer_id', customerId)
    .single();
  if (error) return null;
  return data;
}

async function handleInvoicePaid(invoice) {
  const venue = await getVenueByCustomerId(invoice.customer);
  if (!venue) return;

  const lineItem = invoice.lines?.data?.[0];
  const artworkCount = lineItem?.quantity || 0;
  const { amount, gstAmount, totalAmount } = calculateAmounts(artworkCount);

  await supabase.from('payments').upsert({
    venue_id: venue.id,
    stripe_invoice_id: invoice.id,
    stripe_payment_intent_id: invoice.payment_intent,
    amount,
    gst_amount: gstAmount,
    total_amount: totalAmount,
    artwork_count: artworkCount,
    status: 'paid',
    paid_at: new Date(invoice.status_transitions?.paid_at * 1000 || Date.now()),
    invoice_url: invoice.hosted_invoice_url,
  }, { onConflict: 'stripe_invoice_id' });

  await supabase
    .from('venues')
    .update({ status: 'active' })
    .eq('id', venue.id);
}

async function handleInvoicePaymentFailed(invoice) {
  const venue = await getVenueByCustomerId(invoice.customer);
  if (!venue) return;

  const lineItem = invoice.lines?.data?.[0];
  const artworkCount = lineItem?.quantity || 0;
  const { amount, gstAmount, totalAmount } = calculateAmounts(artworkCount);

  await supabase.from('payments').upsert({
    venue_id: venue.id,
    stripe_invoice_id: invoice.id,
    stripe_payment_intent_id: invoice.payment_intent,
    amount,
    gst_amount: gstAmount,
    total_amount: totalAmount,
    artwork_count: artworkCount,
    status: 'failed',
    invoice_url: invoice.hosted_invoice_url,
  }, { onConflict: 'stripe_invoice_id' });

  await supabase
    .from('venues')
    .update({ status: 'past_due' })
    .eq('id', venue.id);
}

async function handlePaymentActionRequired(invoice) {
  const venue = await getVenueByCustomerId(invoice.customer);
  if (!venue) return;

  await supabase
    .from('venues')
    .update({ status: 'past_due' })
    .eq('id', venue.id);
}

async function handleSubscriptionDeleted(subscription) {
  const { data: venue } = await supabase
    .from('venues')
    .select('id')
    .eq('stripe_subscription_id', subscription.id)
    .single();

  if (!venue) return;

  await supabase
    .from('venues')
    .update({ status: 'cancelled', stripe_subscription_id: null })
    .eq('id', venue.id);
}

module.exports = router;
