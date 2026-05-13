import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

// ── Date range helpers ────────────────────────────────────────────────────────

type DateRange = { start: string; end: string };

function getDateRange(period: string): DateRange {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth(); // 0-indexed

  switch (period) {
    case 'last_month': {
      const lastM = m === 0 ? 11 : m - 1;
      const lastY = m === 0 ? y - 1 : y;
      const start = new Date(Date.UTC(lastY, lastM, 1));
      const end   = new Date(Date.UTC(lastY, lastM + 1, 1));
      return { start: start.toISOString(), end: end.toISOString() };
    }
    case 'current_quarter': {
      const qStart = Math.floor(m / 3) * 3;
      const start  = new Date(Date.UTC(y, qStart, 1));
      const end    = new Date(Date.UTC(y, qStart + 3, 1));
      return { start: start.toISOString(), end: end.toISOString() };
    }
    case 'current_year': {
      const start = new Date(Date.UTC(y, 0, 1));
      const end   = new Date(Date.UTC(y + 1, 0, 1));
      return { start: start.toISOString(), end: end.toISOString() };
    }
    case 'current_month':
    default: {
      const start = new Date(Date.UTC(y, m, 1));
      const end   = new Date(Date.UTC(y, m + 1, 1));
      return { start: start.toISOString(), end: end.toISOString() };
    }
  }
}

/** Number of complete calendar months (inclusive) that overlap with [rangeStart, rangeEnd). */
function monthsInRange(rangeStart: string, rangeEnd: string): number {
  const s = new Date(rangeStart);
  const e = new Date(rangeEnd);
  return (e.getUTCFullYear() - s.getUTCFullYear()) * 12 +
    (e.getUTCMonth() - s.getUTCMonth());
}

// ── Settings loader ───────────────────────────────────────────────────────────

type Settings = Record<string, number>;

async function loadSettings(supabase: ReturnType<typeof createClient>): Promise<Settings> {
  const { data } = await supabase.from('settings').select('key, value');
  const out: Settings = {};
  for (const row of (data || [])) {
    out[row.key] = parseFloat(row.value);
  }
  // Fallback defaults
  const defaults: Settings = {
    subscription_price:       150,
    gst_rate:                 0.10,
    subscription_artist_rate: 0.10,
    entry_artist_rate:        0.80,
    mid_artist_rate:          0.85,
    premium_artist_rate:      0.90,
    entry_max:                1500,
    mid_max:                  5000,
    venue_commission_rate:    0.50,
  };
  return { ...defaults, ...out };
}

// ── Revenue calculation ───────────────────────────────────────────────────────

function calcPriceTier(price: number, entryMax: number, midMax: number): 'entry' | 'mid' | 'premium' {
  if (price < entryMax) return 'entry';
  if (price <= midMax)  return 'mid';
  return 'premium';
}

function artistRateForTier(tier: string, s: Settings): number {
  if (tier === 'entry')   return s.entry_artist_rate;
  if (tier === 'mid')     return s.mid_artist_rate;
  return s.premium_artist_rate;
}

// ── Route handlers ────────────────────────────────────────────────────────────

async function handleRevenueReport(
  supabase: ReturnType<typeof createClient>,
  period: string,
): Promise<Response> {
  const range   = getDateRange(period);
  const months  = Math.max(1, monthsInRange(range.start, range.end));
  const s       = await loadSettings(supabase);

  // ── Subscription revenue ─────────────────────────────────────────────────
  // Count installed artworks per venue that were active during the period.
  // "Active" means status = 'installed' (or removed_at falls after range.start).
  const { data: artworks, error: artErr } = await supabase
    .from('artworks')
    .select('id, venue_id, status, removed_at, installed_at, venues(id, name)')
    .or(`status.eq.installed,removed_at.gte.${range.start}`)
    .filter('installed_at', 'lte', range.end);

  if (artErr) return json({ error: artErr.message }, 400);

  // Group by venue
  const venueMap: Record<string, { name: string; count: number }> = {};
  for (const aw of (artworks || []) as Array<{
    venue_id: string;
    venues: { id: string; name: string } | null;
  }>) {
    if (!aw.venue_id) continue;
    const venueName = (aw.venues as { id: string; name: string } | null)?.name ?? 'Unknown';
    if (!venueMap[aw.venue_id]) venueMap[aw.venue_id] = { name: venueName, count: 0 };
    venueMap[aw.venue_id].count++;
  }

  const subPrice = s.subscription_price;
  const gstRate  = s.gst_rate;

  let subTotal = 0;
  const subByVenue = Object.entries(venueMap).map(([venue_id, v]) => {
    const amount = v.count * subPrice * months;
    const gst    = +(amount * gstRate).toFixed(2);
    const total  = +(amount + gst).toFixed(2);
    subTotal    += total;
    return { venue_id, name: v.name, artwork_count: v.count, amount, gst, total };
  });

  const subGst = +(subTotal * gstRate / (1 + gstRate)).toFixed(2);
  const subNet = +(subTotal - subGst).toFixed(2);

  // ── Sales revenue ────────────────────────────────────────────────────────
  const { data: sales, error: salesErr } = await supabase
    .from('artworks')
    .select(`
      id, title, sale_price, price_tier, artist_share, venue_commission, ua_share, sold_at,
      artist_id, artist_name,
      venue_id, venues(name)
    `)
    .eq('status', 'sold')
    .gte('sold_at', range.start)
    .lt('sold_at', range.end);

  if (salesErr) return json({ error: salesErr.message }, 400);

  const tierTotals: Record<string, { count: number; total: number }> = {
    entry:   { count: 0, total: 0 },
    mid:     { count: 0, total: 0 },
    premium: { count: 0, total: 0 },
  };

  let salesTotalGross = 0;

  const saleItems = ((sales || []) as Array<{
    id: string;
    title: string;
    sale_price: number | null;
    price_tier: string | null;
    artist_share: number | null;
    venue_commission: number | null;
    ua_share: number | null;
    sold_at: string;
    artist_id: string | null;
    artist_name: string | null;
    venue_id: string | null;
    venues: { name: string } | null;
  }>).map(aw => {
    const tier = aw.price_tier ?? calcPriceTier(aw.sale_price ?? 0, s.entry_max, s.mid_max);
    const sp   = aw.sale_price ?? 0;

    // Recalculate if not stored
    const artistRate    = artistRateForTier(tier, s);
    const artist_share  = aw.artist_share  ?? +(sp * artistRate).toFixed(2);
    const ua_gross      = +(sp - artist_share).toFixed(2);
    const venue_commission = aw.venue_commission ?? +(ua_gross * s.venue_commission_rate).toFixed(2);
    const ua_share      = aw.ua_share      ?? +(ua_gross - venue_commission).toFixed(2);

    if (tierTotals[tier]) {
      tierTotals[tier].count++;
      tierTotals[tier].total += sp;
    }
    salesTotalGross += sp;

    return {
      artwork_id:       aw.id,
      title:            aw.title,
      artist_name:      aw.artist_name ?? null,
      venue_name:       aw.venues?.name ?? null,
      sale_price:       sp,
      price_tier:       tier,
      artist_share,
      venue_commission,
      ua_share,
      sold_at:          aw.sold_at,
    };
  });

  // ── Settlements ──────────────────────────────────────────────────────────
  const { data: settlementRows, error: settleErr } = await supabase
    .from('settlements')
    .select('*, artists(name)')
    .gte('month', range.start.slice(0, 7))
    .lte('month', range.end.slice(0, 7));

  if (settleErr) return json({ error: settleErr.message }, 400);

  let totalArtist        = 0;
  let totalVenueComm     = 0;
  let totalUaNet         = 0;

  const byArtist = ((settlementRows || []) as Array<{
    artist_id: string;
    subscription_amount: number;
    sales_amount: number;
    total: number;
    status: string;
    artists: { name: string } | null;
  }>).map(row => {
    totalArtist += row.total ?? 0;
    return {
      artist_id:           row.artist_id,
      name:                row.artists?.name ?? null,
      subscription_amount: row.subscription_amount,
      sales_amount:        row.sales_amount,
      total:               row.total,
      status:              row.status,
    };
  });

  // Derive venue commission and ua_net from sale items
  for (const item of saleItems) {
    totalVenueComm += item.venue_commission;
    totalUaNet     += item.ua_share;
  }

  return json({
    period,
    date_range: range,
    subscription: {
      total: +subTotal.toFixed(2),
      gst:   subGst,
      net:   subNet,
      by_venue: subByVenue,
    },
    sales: {
      total:    +salesTotalGross.toFixed(2),
      by_tier:  tierTotals,
      items:    saleItems,
    },
    settlements: {
      total_artist:        +totalArtist.toFixed(2),
      total_venue_commission: +totalVenueComm.toFixed(2),
      ua_net:              +totalUaNet.toFixed(2),
      by_artist:           byArtist,
    },
  });
}

async function handleListSettlements(
  supabase: ReturnType<typeof createClient>,
  url: URL,
): Promise<Response> {
  const artistId = url.searchParams.get('artist_id');
  const month    = url.searchParams.get('month');
  const status   = url.searchParams.get('status');

  let query = supabase
    .from('settlements')
    .select('*, artists(name)')
    .order('month', { ascending: false });

  if (artistId) query = query.eq('artist_id', artistId);
  if (month)    query = query.eq('month', month);
  if (status)   query = query.eq('status', status);

  const { data, error } = await query;
  if (error) return json({ error: error.message }, 400);

  const rows = ((data || []) as Array<{
    id: string;
    artist_id: string;
    month: string;
    subscription_amount: number;
    sales_amount: number;
    total: number;
    status: string;
    completed_at: string | null;
    notes: string | null;
    created_at: string;
    artists: { name: string } | null;
  }>).map(row => ({
    ...row,
    artist_name: row.artists?.name ?? null,
    artists: undefined,
  }));

  return json(rows);
}

async function handlePatchSettlement(
  supabase: ReturnType<typeof createClient>,
  id: string,
  body: Record<string, unknown>,
): Promise<Response> {
  const allowed = ['status', 'notes', 'subscription_amount', 'sales_amount', 'total'];
  const updates: Record<string, unknown> = {};
  allowed.forEach(k => { if (body[k] !== undefined) updates[k] = body[k]; });

  if (updates.status === 'completed' && !updates.completed_at) {
    updates.completed_at = new Date().toISOString();
  }

  // Recompute total if amounts updated
  if (updates.subscription_amount !== undefined || updates.sales_amount !== undefined) {
    const { data: existing } = await supabase.from('settlements').select('*').eq('id', id).single();
    if (existing) {
      const sub   = (updates.subscription_amount as number) ?? existing.subscription_amount ?? 0;
      const sales = (updates.sales_amount        as number) ?? existing.sales_amount        ?? 0;
      updates.total = +(sub + sales).toFixed(2);
    }
  }

  const { data, error } = await supabase
    .from('settlements')
    .update(updates)
    .eq('id', id)
    .select('*, artists(name)')
    .single();

  if (error) return json({ error: error.message }, 400);

  const row = data as {
    artists: { name: string } | null;
    [key: string]: unknown;
  };
  return json({ ...row, artist_name: row.artists?.name ?? null, artists: undefined });
}

// ── Entry point ───────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleOptions();
  if (!await verifyAdminToken(req)) return json({ error: 'Unauthorised' }, 401);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const url      = new URL(req.url);
  // Supabase Edge Functions receive the path after the function name, e.g. /admin-revenue/settlements
  const pathname = url.pathname.replace(/^\/admin-revenue/, '') || '/';

  // GET /admin-revenue/settlements
  if (req.method === 'GET' && pathname === '/settlements') {
    return handleListSettlements(supabase, url);
  }

  // PATCH /admin-revenue/settlements/:id
  if (req.method === 'PATCH' && pathname.startsWith('/settlements/')) {
    const id = pathname.replace('/settlements/', '').split('/')[0];
    if (!id) return json({ error: 'Settlement ID required' }, 400);
    const body = await req.json().catch(() => ({}));
    return handlePatchSettlement(supabase, id, body);
  }

  // GET /admin-revenue  (main report)
  if (req.method === 'GET' && (pathname === '/' || pathname === '')) {
    const period = url.searchParams.get('period') || 'current_month';
    const validPeriods = ['current_month', 'last_month', 'current_quarter', 'current_year'];
    if (!validPeriods.includes(period)) {
      return json({ error: `Invalid period. Must be one of: ${validPeriods.join(', ')}` }, 400);
    }
    return handleRevenueReport(supabase, period);
  }

  return json({ error: 'Not found' }, 404);
});
