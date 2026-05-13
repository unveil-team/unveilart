import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@14?target=deno';

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

// ── Stripe status check ───────────────────────────────────────────────────────

async function checkStripeStatus(): Promise<Response> {
  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
  if (!stripeKey) {
    return json({ connected: false, error: 'STRIPE_SECRET_KEY not configured' });
  }

  try {
    const stripe = new Stripe(stripeKey, {
      apiVersion: '2024-06-20' as Parameters<typeof Stripe>[1]['apiVersion'],
      httpClient: Stripe.createFetchHttpClient(),
    });

    const account = await stripe.accounts.retrieve();
    return json({
      connected:    true,
      account_id:   account.id,
      country:      account.country,
      currency:     account.default_currency,
      charges_enabled:  account.charges_enabled,
      payouts_enabled:  account.payouts_enabled,
      display_name: (account as { settings?: { dashboard?: { display_name?: string } } })
        .settings?.dashboard?.display_name ?? null,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return json({ connected: false, error: msg });
  }
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
  const pathname = url.pathname.replace(/^\/admin-settings/, '') || '/';

  // GET /admin-settings/stripe-status
  if (req.method === 'GET' && pathname === '/stripe-status') {
    return checkStripeStatus();
  }

  // GET /admin-settings/supabase-status
  if (req.method === 'GET' && pathname === '/supabase-status') {
    try {
      // Simple liveness check — fetch a single row from settings
      const { error } = await supabase.from('settings').select('key').limit(1);
      if (error) return json({ connected: false, error: error.message });
      return json({
        connected:   true,
        project_ref: Deno.env.get('SUPABASE_URL')?.match(/https:\/\/([^.]+)\./)?.[1] ?? null,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return json({ connected: false, error: msg });
    }
  }

  // GET /admin-settings  →  return all settings as flat {key: value} object
  if (req.method === 'GET' && (pathname === '/' || pathname === '')) {
    const { data, error } = await supabase
      .from('settings')
      .select('key, value, updated_at')
      .order('key', { ascending: true });

    if (error) return json({ error: error.message }, 400);

    const result: Record<string, string> = {};
    for (const row of (data || []) as Array<{ key: string; value: string }>) {
      result[row.key] = row.value;
    }
    return json(result);
  }

  // PATCH /admin-settings  →  body {key, value}
  if (req.method === 'PATCH' && (pathname === '/' || pathname === '')) {
    const body = await req.json().catch(() => ({}));
    const { key, value } = body as { key?: string; value?: unknown };

    if (!key || typeof key !== 'string') {
      return json({ error: 'key is required and must be a string' }, 400);
    }
    if (value === undefined || value === null) {
      return json({ error: 'value is required' }, 400);
    }

    const strValue = String(value);

    // Validate numeric settings stay numeric
    const numericKeys = [
      'subscription_price', 'gst_rate', 'subscription_artist_rate',
      'entry_artist_rate', 'mid_artist_rate', 'premium_artist_rate',
      'entry_max', 'mid_max', 'venue_commission_rate',
    ];
    if (numericKeys.includes(key)) {
      const n = parseFloat(strValue);
      if (isNaN(n) || n < 0) {
        return json({ error: `${key} must be a non-negative number` }, 400);
      }
    }

    const { data, error } = await supabase
      .from('settings')
      .upsert({ key, value: strValue, updated_at: new Date().toISOString() })
      .select()
      .single();

    if (error) return json({ error: error.message }, 400);
    return json(data);
  }

  return json({ error: 'Not found' }, 404);
});
