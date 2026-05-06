const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');
const { createCustomer, calculateAmounts } = require('../lib/stripe');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

// POST /api/venues — create venue + Stripe customer
router.post('/', async (req, res) => {
  try {
    const { name, contact_name, email, phone, venue_type, address, notes } = req.body;

    if (!name || !email) {
      return res.status(400).json({ error: 'name and email are required' });
    }

    const customer = await createCustomer({ name, email, phone });

    const { data: venue, error } = await supabase
      .from('venues')
      .insert({
        name, contact_name, email, phone, venue_type, address, notes,
        stripe_customer_id: customer.id,
        status: 'inactive',
      })
      .select()
      .single();

    if (error) throw error;

    res.status(201).json(venue);
  } catch (err) {
    console.error('POST /venues', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/venues — list all venues with artwork counts
router.get('/', async (req, res) => {
  try {
    const { data: venues, error } = await supabase
      .from('venues')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    const { data: artworkCounts } = await supabase
      .from('artworks')
      .select('venue_id')
      .eq('status', 'installed');

    const countMap = {};
    (artworkCounts || []).forEach(a => {
      countMap[a.venue_id] = (countMap[a.venue_id] || 0) + 1;
    });

    const enriched = venues.map(v => {
      const count = countMap[v.id] || 0;
      const { amount, gstAmount, totalAmount } = calculateAmounts(count);
      return { ...v, artwork_count: count, monthly_amount: amount, monthly_gst: gstAmount, monthly_total: totalAmount };
    });

    res.json(enriched);
  } catch (err) {
    console.error('GET /venues', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/venues/:id — venue detail with artworks + payments
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const [venueRes, artworksRes, paymentsRes] = await Promise.all([
      supabase.from('venues').select('*').eq('id', id).single(),
      supabase.from('artworks').select('*').eq('venue_id', id).order('installed_at', { ascending: false }),
      supabase.from('payments').select('*').eq('venue_id', id).order('created_at', { ascending: false }),
    ]);

    if (venueRes.error) throw venueRes.error;
    if (!venueRes.data) return res.status(404).json({ error: 'Venue not found' });

    const artworkCount = (artworksRes.data || []).filter(a => a.status === 'installed').length;
    const { amount, gstAmount, totalAmount } = calculateAmounts(artworkCount);

    res.json({
      ...venueRes.data,
      artwork_count: artworkCount,
      monthly_amount: amount,
      monthly_gst: gstAmount,
      monthly_total: totalAmount,
      artworks: artworksRes.data || [],
      payments: paymentsRes.data || [],
    });
  } catch (err) {
    console.error('GET /venues/:id', err);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/venues/:id — update venue info
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const allowed = ['name', 'contact_name', 'email', 'phone', 'venue_type', 'address', 'notes'];
    const updates = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });

    const { data, error } = await supabase
      .from('venues')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('PATCH /venues/:id', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
