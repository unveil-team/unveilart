const express = require('express');
const router = express.Router({ mergeParams: true });
const supabase = require('../lib/supabase');
const {
  createSubscription,
  updateSubscriptionQuantity,
  cancelSubscription,
  calculateAmounts,
} = require('../lib/stripe');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

async function getInstalledCount(venueId) {
  const { data, error } = await supabase
    .from('artworks')
    .select('id')
    .eq('venue_id', venueId)
    .eq('status', 'installed');
  if (error) throw error;
  return (data || []).length;
}

// POST /api/venues/:id/artworks — install artwork, create/update subscription
router.post('/', async (req, res) => {
  try {
    const { id: venueId } = req.params;
    const { title, artist_name, installed_at, condition_on_arrival, notes } = req.body;

    const { data: venue, error: venueErr } = await supabase
      .from('venues')
      .select('*')
      .eq('id', venueId)
      .single();
    if (venueErr || !venue) return res.status(404).json({ error: 'Venue not found' });

    const { data: artwork, error: artErr } = await supabase
      .from('artworks')
      .insert({ venue_id: venueId, title, artist_name, installed_at, condition_on_arrival, notes, status: 'installed' })
      .select()
      .single();
    if (artErr) throw artErr;

    const newCount = await getInstalledCount(venueId);
    const { amount, gstAmount, totalAmount } = calculateAmounts(newCount);

    let subscriptionId = venue.stripe_subscription_id;

    if (!subscriptionId) {
      const sub = await createSubscription({
        customerId: venue.stripe_customer_id,
        artworkCount: newCount,
        installedAt: installed_at,
      });
      subscriptionId = sub.id;

      await supabase
        .from('venues')
        .update({ stripe_subscription_id: subscriptionId, status: 'active' })
        .eq('id', venueId);
    } else {
      await updateSubscriptionQuantity({ subscriptionId, newQuantity: newCount });
    }

    res.status(201).json({
      artwork,
      subscription: { artwork_count: newCount, monthly_amount: amount, monthly_gst: gstAmount, monthly_total: totalAmount },
    });
  } catch (err) {
    console.error('POST /venues/:id/artworks', err);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/venues/:id/artworks/:artworkId — update artwork details
router.patch('/:artworkId', async (req, res) => {
  try {
    const { artworkId } = req.params;
    const allowed = ['title', 'artist_name', 'installed_at', 'condition_on_arrival', 'condition_on_return', 'notes', 'status'];
    const updates = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });

    const { data, error } = await supabase
      .from('artworks')
      .update(updates)
      .eq('id', artworkId)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('PATCH /artworks/:artworkId', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/venues/:id/artworks/:artworkId — remove artwork, update/cancel subscription
router.delete('/:artworkId', async (req, res) => {
  try {
    const { id: venueId, artworkId } = req.params;
    const { removed_at = new Date().toISOString().split('T')[0], condition_on_return, notes } = req.body || {};

    const { data: venue, error: venueErr } = await supabase
      .from('venues')
      .select('*')
      .eq('id', venueId)
      .single();
    if (venueErr || !venue) return res.status(404).json({ error: 'Venue not found' });

    await supabase
      .from('artworks')
      .update({ status: 'removed', removed_at, condition_on_return, notes })
      .eq('id', artworkId);

    const remainingCount = await getInstalledCount(venueId);

    if (remainingCount === 0 && venue.stripe_subscription_id) {
      await cancelSubscription({ subscriptionId: venue.stripe_subscription_id, immediately: false });
      await supabase
        .from('venues')
        .update({ stripe_subscription_id: null, status: 'inactive' })
        .eq('id', venueId);
    } else if (remainingCount > 0 && venue.stripe_subscription_id) {
      await updateSubscriptionQuantity({ subscriptionId: venue.stripe_subscription_id, newQuantity: remainingCount });
    }

    const { amount, gstAmount, totalAmount } = calculateAmounts(remainingCount);

    res.json({
      removed: true,
      subscription: { artwork_count: remainingCount, monthly_amount: amount, monthly_gst: gstAmount, monthly_total: totalAmount },
    });
  } catch (err) {
    console.error('DELETE /artworks/:artworkId', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
