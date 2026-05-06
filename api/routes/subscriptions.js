const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');
const { getSubscription, cancelSubscription, createCustomerPortalSession } = require('../lib/stripe');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

// GET /api/subscriptions/:venueId
router.get('/:venueId', async (req, res) => {
  try {
    const { venueId } = req.params;

    const { data: venue, error } = await supabase
      .from('venues')
      .select('*')
      .eq('id', venueId)
      .single();
    if (error || !venue) return res.status(404).json({ error: 'Venue not found' });
    if (!venue.stripe_subscription_id) return res.json({ subscription: null });

    const sub = await getSubscription(venue.stripe_subscription_id);

    res.json({
      subscription: {
        id: sub.id,
        status: sub.status,
        quantity: sub.items.data[0]?.quantity || 0,
        current_period_start: new Date(sub.current_period_start * 1000),
        current_period_end: new Date(sub.current_period_end * 1000),
        cancel_at_period_end: sub.cancel_at_period_end,
        cancel_at: sub.cancel_at ? new Date(sub.cancel_at * 1000) : null,
        latest_invoice: sub.latest_invoice,
      },
    });
  } catch (err) {
    console.error('GET /subscriptions/:venueId', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/subscriptions/cancel/:venueId
router.post('/cancel/:venueId', async (req, res) => {
  try {
    const { venueId } = req.params;
    const { cancel_immediately = false } = req.body;

    const { data: venue, error } = await supabase
      .from('venues')
      .select('*')
      .eq('id', venueId)
      .single();
    if (error || !venue) return res.status(404).json({ error: 'Venue not found' });
    if (!venue.stripe_subscription_id) return res.status(400).json({ error: 'No active subscription' });

    await cancelSubscription({ subscriptionId: venue.stripe_subscription_id, immediately: cancel_immediately });

    if (cancel_immediately) {
      await supabase
        .from('venues')
        .update({ status: 'cancelled', stripe_subscription_id: null })
        .eq('id', venueId);
    }

    res.json({ cancelled: true, immediately: cancel_immediately });
  } catch (err) {
    console.error('POST /subscriptions/cancel', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/subscriptions/portal/:venueId — get Stripe Customer Portal URL
router.post('/portal/:venueId', async (req, res) => {
  try {
    const { venueId } = req.params;
    const { return_url = 'https://www.unveilart.com.au/admin/venue.html?id=' + venueId } = req.body;

    const { data: venue, error } = await supabase
      .from('venues')
      .select('stripe_customer_id')
      .eq('id', venueId)
      .single();
    if (error || !venue) return res.status(404).json({ error: 'Venue not found' });

    const session = await createCustomerPortalSession({
      customerId: venue.stripe_customer_id,
      returnUrl: return_url,
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error('POST /subscriptions/portal', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
