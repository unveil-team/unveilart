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

// ── Stripe helpers (inline, no shared imports) ────────────────────────────────

function getStripe() {
  return new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
    apiVersion: '2024-06-20' as Parameters<typeof Stripe>[1]['apiVersion'],
    httpClient: Stripe.createFetchHttpClient(),
  });
}

const PRICE_AUD_CENTS = 15000; // $150

async function getOrCreatePrice(stripe: Stripe): Promise<string> {
  const products = await stripe.products.list({ active: true, limit: 100 });
  let product = products.data.find(p => p.metadata.unveilart === 'artwork_subscription');
  if (!product) {
    product = await stripe.products.create({
      name: 'UnveilArt Artwork Subscription',
      metadata: { unveilart: 'artwork_subscription' },
    });
  }
  const prices = await stripe.prices.list({ product: product.id, active: true, limit: 100 });
  let price = prices.data.find(p =>
    p.unit_amount === PRICE_AUD_CENTS && p.currency === 'aud' && p.recurring?.interval === 'month'
  );
  if (!price) {
    price = await stripe.prices.create({
      product: product.id,
      unit_amount: PRICE_AUD_CENTS,
      currency: 'aud',
      recurring: { interval: 'month' },
    });
  }
  return price.id;
}

async function getOrCreateGSTTaxRate(stripe: Stripe): Promise<string> {
  const taxRates = await stripe.taxRates.list({ active: true, limit: 100 });
  let taxRate = taxRates.data.find(t => t.percentage === 10 && t.jurisdiction === 'AU' && !t.inclusive);
  if (!taxRate) {
    taxRate = await stripe.taxRates.create({
      display_name: 'GST',
      description: 'Australian Goods and Services Tax',
      jurisdiction: 'AU',
      percentage: 10,
      inclusive: false,
    });
  }
  return taxRate.id;
}

function calculateSubscriptionAmounts(artworkCount: number) {
  const amount    = artworkCount * 150;
  const gstAmount = +(amount * 0.1).toFixed(2);
  const total     = +(amount + gstAmount).toFixed(2);
  return { amount, gstAmount, total };
}

// ── Supabase client factory ───────────────────────────────────────────────────

function sb() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
}

// ── Business logic helpers ────────────────────────────────────────────────────

async function getInstalledCount(
  supabase: ReturnType<typeof sb>,
  venueId: string,
): Promise<number> {
  const { data } = await supabase
    .from('artworks')
    .select('id')
    .eq('venue_id', venueId)
    .eq('status', 'installed');
  return (data || []).length;
}

function calcPriceTier(price: number): 'entry' | 'mid' | 'premium' {
  if (price < 2000)  return 'entry';
  if (price <= 7000) return 'mid';
  return 'premium';
}

/**
 * Returns artist_share, venue_commission, ua_share for a sale.
 *
 * The artist's share rises with price, and the remainder is split equally
 * between the venue and UnveilArt:
 *   Entry   (<$2,000):    Artist 70% / Venue 15%   / UA 15%
 *   Mid     ($2k–$7k):    Artist 75% / Venue 12.5% / UA 12.5%
 *   Premium (>$7,000):    Artist 80% / Venue 10%   / UA 10%
 * When no venue is involved, the venue's share rolls up to the artist.
 */
function calcSaleSplits(salePrice: number, tier: 'entry' | 'mid' | 'premium', hasVenue: boolean): {
  artist_share: number;
  venue_commission: number;
  ua_share: number;
} {
  const rates = {
    entry:   { artist: 0.70, venue: 0.15,  ua: 0.15  },
    mid:     { artist: 0.75, venue: 0.125, ua: 0.125 },
    premium: { artist: 0.80, venue: 0.10,  ua: 0.10  },
  };
  const r = rates[tier];

  const ua_share         = +(salePrice * r.ua).toFixed(2);
  const venue_commission = hasVenue ? +(salePrice * r.venue).toFixed(2) : 0;
  const artist_share     = +(salePrice - ua_share - venue_commission).toFixed(2);

  return { artist_share, venue_commission, ua_share };
}

/** Upsert a settlement row, incrementing the specified field by delta. */
async function upsertSettlement(
  supabase: ReturnType<typeof sb>,
  artistId: string,
  month: string,            // YYYY-MM
  field: 'subscription_amount' | 'sales_amount',
  delta: number,
): Promise<void> {
  // Try to fetch existing
  const { data: existing } = await supabase
    .from('settlements')
    .select('*')
    .eq('artist_id', artistId)
    .eq('month', month)
    .maybeSingle();

  if (existing) {
    const newValue = +((existing[field] ?? 0) + delta).toFixed(2);
    const newTotal = +(
      (field === 'subscription_amount' ? newValue : (existing.subscription_amount ?? 0)) +
      (field === 'sales_amount'        ? newValue : (existing.sales_amount        ?? 0))
    ).toFixed(2);

    await supabase
      .from('settlements')
      .update({ [field]: newValue, total: newTotal })
      .eq('id', existing.id);
  } else {
    const sub   = field === 'subscription_amount' ? delta : 0;
    const sales = field === 'sales_amount'        ? delta : 0;
    await supabase.from('settlements').insert({
      artist_id:           artistId,
      month,
      subscription_amount: +sub.toFixed(2),
      sales_amount:        +sales.toFixed(2),
      total:               +(sub + sales).toFixed(2),
      status:              'pending',
    });
  }
}

// ── Route handlers ────────────────────────────────────────────────────────────

// GET /admin-artworks  or  GET /admin-artworks?id=X  or  GET /admin-artworks?venue_id=X
async function handleGet(
  supabase: ReturnType<typeof sb>,
  url: URL,
): Promise<Response> {
  const id      = url.searchParams.get('id');
  const venueId = url.searchParams.get('venue_id');

  if (id) {
    const { data, error } = await supabase
      .from('artworks')
      .select('*')
      .eq('id', id)
      .single();

    if (error) return json({ error: error.message }, 400);

    const row = data as Record<string, unknown>;

    // Resolve names via separate lookups
    const [artistRes, venueRes] = await Promise.all([
      row.artist_id ? supabase.from('artists').select('id, name').eq('id', row.artist_id).single() : Promise.resolve({ data: null }),
      row.venue_id  ? supabase.from('venues').select('id, name').eq('id', row.venue_id).single()   : Promise.resolve({ data: null }),
    ]);

    return json({
      ...row,
      artist_name: (artistRes.data as { name?: string } | null)?.name ?? (row.artist_name as string | null) ?? null,
      venue_name:  (venueRes.data  as { name?: string } | null)?.name ?? null,
    });
  }

  let query = supabase
    .from('artworks')
    .select('id, title, artist_id, venue_id, price, price_tier, status, installed_at, removed_at, arrival_condition, return_condition, sold_at, sale_price, artist_name, notes, image_url, dimensions, published')
    .order('installed_at', { ascending: false });

  if (venueId) query = query.eq('venue_id', venueId);

  const { data, error } = await query;
  if (error) return json({ error: error.message }, 400);

  // Resolve venue names in bulk
  const venueIds = [...new Set((data || []).map((r: { venue_id: string | null }) => r.venue_id).filter(Boolean))];
  const venueMap: Record<string, string> = {};
  if (venueIds.length > 0) {
    const { data: vd } = await supabase.from('venues').select('id, name').in('id', venueIds);
    (vd || []).forEach((v: { id: string; name: string }) => { venueMap[v.id] = v.name; });
  }

  const rows = (data || []).map((row: { venue_id: string | null; artist_name: string | null; [key: string]: unknown }) => ({
    ...row,
    venue_name: row.venue_id ? (venueMap[row.venue_id] ?? null) : null,
  }));

  return json(rows);
}

// POST /admin-artworks  →  create artwork (stored or installed at a venue)
async function handleCreate(
  supabase: ReturnType<typeof sb>,
  body: Record<string, unknown>,
): Promise<Response> {
  const { venue_id, title, artist_id, notes, price, quantity, memo } = body;

  // ── Stored artwork (no venue) ─────────────────────────────
  if (!venue_id) {
    let artist_name: string | null = (body.artist_name as string) || null;
    if (artist_id) {
      const { data: artist } = await supabase.from('artists').select('name').eq('id', artist_id).single();
      if (artist) artist_name = (artist as { name: string }).name;
    }
    const numPrice  = price ? Number(price) : null;
    const priceTier = numPrice !== null ? calcPriceTier(numPrice) : null;

    const { data: artwork, error: artErr } = await supabase
      .from('artworks')
      .insert({
        title:      title ?? null,
        artist_id:  artist_id ?? null,
        artist_name,
        venue_id:   null,
        notes:      notes ?? null,
        memo:       memo ?? null,
        price:      numPrice,
        price_tier: priceTier,
        quantity:   quantity ? Number(quantity) : 1,
        status:     'stored',
      })
      .select()
      .single();

    if (artErr) return json({ error: artErr.message }, 400);
    return json({ artwork }, 201);
  }

  // ── Installed artwork (venue required) ───────────────────
  const { data: venue, error: venueErr } = await supabase
    .from('venues')
    .select('*')
    .eq('id', venue_id)
    .single();

  if (venueErr || !venue) return json({ error: 'Venue not found' }, 404);

  // Resolve artist name
  let artist_name: string | null = (body.artist_name as string) || null;
  if (artist_id) {
    const { data: artist } = await supabase
      .from('artists')
      .select('name')
      .eq('id', artist_id)
      .single();
    if (artist) artist_name = (artist as { name: string }).name;
  }

  // Derive price tier
  const numPrice  = price ? Number(price) : null;
  const priceTier = numPrice !== null ? calcPriceTier(numPrice) : null;

  const { data: artwork, error: artErr } = await supabase
    .from('artworks')
    .insert({
      venue_id,
      title:      title ?? null,
      artist_id:  artist_id ?? null,
      artist_name,
      notes:      notes ?? null,
      memo:       memo ?? null,
      price:      numPrice,
      price_tier: priceTier,
      quantity:   quantity ? Number(quantity) : 1,
      status:     'installed',
    })
    .select()
    .single();

  if (artErr) return json({ error: artErr.message }, 400);

  const newCount = await getInstalledCount(supabase, venue_id as string);
  const { amount, gstAmount, total } = calculateSubscriptionAmounts(newCount);

  try {
    const stripe = getStripe();
    if (!venue.stripe_subscription_id) {
      const priceId   = await getOrCreatePrice(stripe);
      const taxRateId = await getOrCreateGSTTaxRate(stripe);
      const sub = await stripe.subscriptions.create({
        customer:            venue.stripe_customer_id,
        items:               [{ price: priceId, quantity: newCount }],
        default_tax_rates:   [taxRateId],
        collection_method:   'send_invoice',
        days_until_due:      30,
      });
      await supabase
        .from('venues')
        .update({ stripe_subscription_id: sub.id, status: 'active' })
        .eq('id', venue_id);
    } else {
      const sub = await stripe.subscriptions.retrieve(venue.stripe_subscription_id as string);
      await stripe.subscriptionItems.update(
        sub.items.data[0].id,
        { quantity: newCount, proration_behavior: 'create_prorations' },
      );
    }
  } catch (stripeErr) {
    // Roll back artwork on Stripe failure
    await supabase.from('artworks').delete().eq('id', (artwork as { id: string }).id);
    return json({ error: `Stripe error: ${(stripeErr as Error).message}` }, 500);
  }

  return json({
    artwork,
    subscription: { artwork_count: newCount, monthly_amount: amount, monthly_gst: gstAmount, monthly_total: total },
  }, 201);
}

// PATCH /admin-artworks?id=X  →  update artwork fields
async function handleUpdate(
  supabase: ReturnType<typeof sb>,
  id: string,
  body: Record<string, unknown>,
): Promise<Response> {
  const allowed = [
    'title', 'artist_id', 'artist_name', 'venue_id',
    'installed_at', 'arrival_condition', 'return_condition',
    'notes', 'memo', 'status', 'price', 'genre', 'description',
    'buyer_name', 'buyer_email', 'delivery_date', 'delivered_at',
    'image_url', 'dimensions', 'published', 'quantity',
  ];

  const updates: Record<string, unknown> = {};
  allowed.forEach(k => { if (body[k] !== undefined) updates[k] = body[k]; });

  // Recompute price_tier if price changed
  if (updates.price !== undefined && updates.price !== null) {
    updates.price_tier = calcPriceTier(Number(updates.price));
  }

  const { data, error } = await supabase
    .from('artworks')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) return json({ error: error.message }, 400);
  return json(data);
}

// DELETE /admin-artworks?id=X&venue_id=Y  →  remove artwork, update Stripe subscription
async function handleDelete(
  supabase: ReturnType<typeof sb>,
  id: string,
  venueId: string,
  body: Record<string, unknown>,
): Promise<Response> {
  const removed_at        = (body.removed_at as string)        || new Date().toISOString().split('T')[0];
  const return_condition  = (body.return_condition as string)  || null;

  const { data: venue } = await supabase.from('venues').select('*').eq('id', venueId).single();
  if (!venue) return json({ error: 'Venue not found' }, 404);

  await supabase
    .from('artworks')
    .update({ status: 'removed', removed_at, return_condition })
    .eq('id', id);

  const remainingCount = await getInstalledCount(supabase, venueId);

  try {
    const stripe = getStripe();
    if (remainingCount === 0 && venue.stripe_subscription_id) {
      await stripe.subscriptions.update(venue.stripe_subscription_id as string, {
        cancel_at_period_end: true,
      });
      await supabase
        .from('venues')
        .update({ stripe_subscription_id: null, status: 'inactive' })
        .eq('id', venueId);
    } else if (remainingCount > 0 && venue.stripe_subscription_id) {
      const sub = await stripe.subscriptions.retrieve(venue.stripe_subscription_id as string);
      await stripe.subscriptionItems.update(
        sub.items.data[0].id,
        { quantity: remainingCount, proration_behavior: 'create_prorations' },
      );
    }
  } catch (stripeErr) {
    // Log but don't fail — artwork already marked removed
    console.error('Stripe update failed after remove:', (stripeErr as Error).message);
  }

  const { amount, gstAmount, total } = calculateSubscriptionAmounts(remainingCount);
  return json({
    removed:      true,
    subscription: { artwork_count: remainingCount, monthly_amount: amount, monthly_gst: gstAmount, monthly_total: total },
  });
}

// POST /admin-artworks/sell  →  mark artwork sold, calculate splits, update settlement
async function handleSell(
  supabase: ReturnType<typeof sb>,
  body: Record<string, unknown>,
): Promise<Response> {
  const { artwork_id, sale_price, buyer_name, buyer_email, delivery_date } = body;

  if (!artwork_id)  return json({ error: 'artwork_id is required' }, 400);
  if (!sale_price)  return json({ error: 'sale_price is required' }, 400);

  const numSalePrice = Number(sale_price);
  if (isNaN(numSalePrice) || numSalePrice <= 0) {
    return json({ error: 'sale_price must be a positive number' }, 400);
  }

  // Fetch artwork with venue
  const { data: artwork, error: artErr } = await supabase
    .from('artworks')
    .select('*, venues(id, name, stripe_subscription_id, stripe_customer_id, status)')
    .eq('id', artwork_id)
    .single();

  if (artErr || !artwork) return json({ error: 'Artwork not found' }, 404);

  const aw = artwork as {
    id: string;
    title: string;
    artist_id: string | null;
    artist_name: string | null;
    venue_id: string;
    status: string;
    price: number | null;
    venues: {
      id: string;
      name: string;
      stripe_subscription_id: string | null;
      stripe_customer_id: string | null;
      status: string;
    } | null;
  };

  if (aw.status === 'sold') {
    return json({ error: 'Artwork is already marked as sold' }, 400);
  }

  // Use stored price_tier or recalculate from sale_price
  const tier = calcPriceTier(numSalePrice);
  const { artist_share, venue_commission, ua_share } = calcSaleSplits(numSalePrice, tier, !!aw.venue_id);

  const now = new Date().toISOString();

  // Mark artwork sold
  const { data: updatedArtwork, error: updateErr } = await supabase
    .from('artworks')
    .update({
      status:           'sold',
      sold_at:          now,
      sale_price:       numSalePrice,
      price_tier:       tier,
      buyer_name:       buyer_name   ?? null,
      buyer_email:      buyer_email  ?? null,
      delivery_date:    delivery_date ?? null,
      artist_share,
      venue_commission,
      ua_share,
    })
    .eq('id', artwork_id)
    .select()
    .single();

  if (updateErr) return json({ error: updateErr.message }, 400);

  // Update artist settlement if we have an artist_id
  if (aw.artist_id) {
    const month = now.slice(0, 7); // YYYY-MM
    try {
      await upsertSettlement(supabase, aw.artist_id, month, 'sales_amount', artist_share);
    } catch (settleErr) {
      console.error('Settlement update failed:', (settleErr as Error).message);
      // Non-fatal — artwork already marked sold
    }
  }

  // Decrement Stripe subscription (sold artwork is no longer installed)
  if (aw.venue_id && aw.venues?.stripe_subscription_id) {
    try {
      const stripe          = getStripe();
      const remainingCount  = await getInstalledCount(supabase, aw.venue_id);
      if (remainingCount === 0) {
        await stripe.subscriptions.update(aw.venues.stripe_subscription_id, {
          cancel_at_period_end: true,
        });
        await supabase
          .from('venues')
          .update({ stripe_subscription_id: null, status: 'inactive' })
          .eq('id', aw.venue_id);
      } else {
        const sub = await stripe.subscriptions.retrieve(aw.venues.stripe_subscription_id);
        await stripe.subscriptionItems.update(
          sub.items.data[0].id,
          { quantity: remainingCount, proration_behavior: 'create_prorations' },
        );
      }
    } catch (stripeErr) {
      console.error('Stripe update after sale failed:', (stripeErr as Error).message);
    }
  }

  return json({
    artwork:    updatedArtwork,
    splits: {
      sale_price,
      price_tier:       tier,
      artist_share,
      venue_commission,
      ua_share,
    },
  });
}

// POST /admin-artworks/remove  →  remove artwork from venue, record history, update Stripe
async function handleRemove(
  supabase: ReturnType<typeof sb>,
  body: Record<string, unknown>,
): Promise<Response> {
  const { artwork_id, return_condition } = body;

  if (!artwork_id) return json({ error: 'artwork_id is required' }, 400);

  const { data: artwork, error: artErr } = await supabase
    .from('artworks')
    .select('*, venues(id, name, stripe_subscription_id, status)')
    .eq('id', artwork_id)
    .single();

  if (artErr || !artwork) return json({ error: 'Artwork not found' }, 404);

  const aw = artwork as {
    id: string;
    venue_id: string;
    status: string;
    installed_at: string | null;
    arrival_condition: string | null;
    venues: {
      id: string;
      stripe_subscription_id: string | null;
      status: string;
    } | null;
  };

  if (aw.status === 'removed') {
    return json({ error: 'Artwork is already removed' }, 400);
  }
  if (aw.status === 'sold') {
    return json({ error: 'Artwork is sold and cannot be removed via this endpoint' }, 400);
  }

  const now = new Date().toISOString();

  // Record artwork_history entry
  const { error: histErr } = await supabase.from('artwork_history').insert({
    artwork_id:       aw.id,
    venue_id:         aw.venue_id,
    installed_at:     aw.installed_at ? new Date(aw.installed_at).toISOString() : null,
    removed_at:       now,
    arrival_condition: aw.arrival_condition ?? null,
    return_condition:  return_condition     ?? null,
  });

  if (histErr) {
    console.error('artwork_history insert failed:', histErr.message);
    // Non-fatal — continue with removal
  }

  // Mark artwork removed
  const { data: updatedArtwork, error: updateErr } = await supabase
    .from('artworks')
    .update({
      status:           'removed',
      removed_at:       now.split('T')[0], // existing DATE column
      removed_at_ts:    now,               // new TIMESTAMPTZ column
      return_condition: return_condition ?? null,
    })
    .eq('id', artwork_id)
    .select()
    .single();

  if (updateErr) return json({ error: updateErr.message }, 400);

  // Update Stripe subscription
  const remainingCount = await getInstalledCount(supabase, aw.venue_id);
  let subscriptionUpdate: Record<string, unknown> = { artwork_count: remainingCount };

  try {
    const stripe = getStripe();
    if (remainingCount === 0 && aw.venues?.stripe_subscription_id) {
      await stripe.subscriptions.update(aw.venues.stripe_subscription_id, {
        cancel_at_period_end: true,
      });
      await supabase
        .from('venues')
        .update({ stripe_subscription_id: null, status: 'inactive' })
        .eq('id', aw.venue_id);
      subscriptionUpdate = { ...subscriptionUpdate, cancelled: true };
    } else if (remainingCount > 0 && aw.venues?.stripe_subscription_id) {
      const sub = await stripe.subscriptions.retrieve(aw.venues.stripe_subscription_id);
      await stripe.subscriptionItems.update(
        sub.items.data[0].id,
        { quantity: remainingCount, proration_behavior: 'create_prorations' },
      );
      const { amount, gstAmount, total } = calculateSubscriptionAmounts(remainingCount);
      subscriptionUpdate = {
        ...subscriptionUpdate,
        monthly_amount:  amount,
        monthly_gst:     gstAmount,
        monthly_total:   total,
      };
    }
  } catch (stripeErr) {
    console.error('Stripe update after remove failed:', (stripeErr as Error).message);
  }

  return json({ artwork: updatedArtwork, subscription: subscriptionUpdate });
}

// ── Entry point ───────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleOptions();
  if (!await verifyAdminToken(req)) return json({ error: 'Unauthorised' }, 401);

  const supabase = sb();
  const url      = new URL(req.url);
  const pathname = url.pathname.replace(/^\/admin-artworks/, '') || '/';
  const id       = url.searchParams.get('id');
  const venueId  = url.searchParams.get('venue_id');

  // POST /admin-artworks/sell
  if (req.method === 'POST' && pathname === '/sell') {
    const body = await req.json().catch(() => ({}));
    return handleSell(supabase, body);
  }

  // POST /admin-artworks/remove
  if (req.method === 'POST' && pathname === '/remove') {
    const body = await req.json().catch(() => ({}));
    return handleRemove(supabase, body);
  }

  // GET /admin-artworks  or  GET /admin-artworks?id=X  or  GET /admin-artworks?venue_id=X
  if (req.method === 'GET') {
    return handleGet(supabase, url);
  }

  // POST /admin-artworks  →  create / install artwork
  if (req.method === 'POST') {
    const body = await req.json().catch(() => ({}));
    return handleCreate(supabase, body);
  }

  // PATCH /admin-artworks?id=X
  if (req.method === 'PATCH' && id) {
    const body = await req.json().catch(() => ({}));
    return handleUpdate(supabase, id, body);
  }

  // DELETE /admin-artworks?id=X&venue_id=Y
  if (req.method === 'DELETE' && id && venueId) {
    const body = req.headers.get('content-length') !== '0'
      ? await req.json().catch(() => ({}))
      : {};
    return handleDelete(supabase, id, venueId, body);
  }

  return json({ error: 'Not found' }, 404);
});
