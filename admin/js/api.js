/**
 * api.js — UnveilArt Admin API module
 * Requires auth.js (window.fnFetch) to be loaded first.
 */

/* ══════════════════════════════════════════════════════════
   API NAMESPACE
══════════════════════════════════════════════════════════ */
const API = {

  // ── Venues ──────────────────────────────────────────────
  venues: {
    list:   ()         => fnFetch('admin-venues'),
    get:    (id)       => fnFetch('admin-venues?id=' + id),
    create: (data)     => fnFetch('admin-venues', { method: 'POST',  body: data }),
    update: (id, data) => fnFetch('admin-venues?id=' + id, { method: 'PATCH', body: data }),
  },

  // ── Artists ──────────────────────────────────────────────
  artists: {
    list:   ()         => fnFetch('admin-artists'),
    get:    (id)       => fnFetch('admin-artists?id=' + id),
    create: (data)     => fnFetch('admin-artists', { method: 'POST',  body: data }),
    update: (id, data) => fnFetch('admin-artists?id=' + id, { method: 'PATCH', body: data }),
  },

  // ── Artworks ─────────────────────────────────────────────
  artworks: {
    list: (filters = {}) => {
      const params = new URLSearchParams(filters).toString();
      return fnFetch('admin-artworks' + (params ? '?' + params : ''));
    },
    get:    (id)   => fnFetch('admin-artworks?id=' + id),
    create: (data) => fnFetch('admin-artworks',         { method: 'POST', body: data }),
    update: (id, data) => fnFetch('admin-artworks?id=' + id, { method: 'PATCH', body: data }),
    install: (data)    => fnFetch('admin-artworks',         { method: 'POST', body: data }),
    remove:  (data)    => fnFetch('admin-artworks/remove',  { method: 'POST', body: data }),
    sell:    (data)    => fnFetch('admin-artworks/sell',    { method: 'POST', body: data }),
  },

  // ── Revenue ───────────────────────────────────────────────
  revenue: {
    get:                (period = 'current_month') => fnFetch('admin-revenue?period=' + period),
    settlements:        ()     => fnFetch('admin-revenue/settlements'),
    completeSettlement: (id)   => fnFetch('admin-revenue/settlements/' + id, {
      method: 'PATCH',
      body: { status: 'completed' },
    }),
  },

  // ── Settings ─────────────────────────────────────────────
  settings: {
    get:    ()            => fnFetch('admin-settings'),
    update: (key, value)  => fnFetch('admin-settings', { method: 'PATCH', body: { key, value } }),
  },
};

/* ══════════════════════════════════════════════════════════
   PRICE TIER HELPERS
══════════════════════════════════════════════════════════ */

/**
 * Returns the price tier key based on artwork price.
 * @param {number} price
 * @returns {'entry'|'mid'|'premium'}
 */
function priceTier(price) {
  const n = Number(price) || 0;
  if (n < 2000)  return 'entry';
  if (n <= 7000) return 'mid';
  return 'premium';
}

/**
 * Returns a human-readable label for a price tier.
 * @param {'entry'|'mid'|'premium'} tier
 * @returns {string}
 */
function priceTierLabel(tier) {
  const map = { entry: 'Under $2,000', mid: '$2,000–$7,000', premium: 'Over $7,000' };
  return map[tier] || tier;
}

/* ══════════════════════════════════════════════════════════
   FORMATTING HELPERS
══════════════════════════════════════════════════════════ */

/**
 * Formats a number as AUD currency.
 * @param {number|string} amount
 * @returns {string}  e.g. '$1,234.56'
 */
function formatCurrency(amount) {
  const n = Number(amount);
  if (isNaN(n)) return '—';
  return '$' + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Formats a date string as '15 Jan 2025'.
 * @param {string|null} dateStr
 * @returns {string}
 */
function formatDate(dateStr) {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return '—';
  }
}

/**
 * Returns a human-readable relative time string.
 * @param {string|null} dateStr
 * @returns {string}  e.g. '2 hours ago', 'just now', '3 Jan 2025'
 */
function timeSince(dateStr) {
  if (!dateStr) return '—';
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '—';

    const now  = new Date();
    const secs = Math.floor((now - date) / 1000);

    if (secs < 60)           return 'just now';
    if (secs < 3600)         return Math.floor(secs / 60) + ' min ago';
    if (secs < 86400)        return Math.floor(secs / 3600) + ' hour' + (Math.floor(secs / 3600) === 1 ? '' : 's') + ' ago';
    if (secs < 172800)       return 'yesterday';

    return date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return '—';
  }
}

/* ══════════════════════════════════════════════════════════
   COMMISSION SPLIT CALCULATOR
══════════════════════════════════════════════════════════ */

/**
 * Calculates the revenue split for an artwork sale.
 *
 * Commission rates by tier — the artist's share rises with price, and the
 * remainder is shared equally between the venue and UnveilArt:
 *   Entry   (<$2,000):    Artist 70% / Venue 15%   / UA 15%
 *   Mid     ($2k–$7k):    Artist 75% / Venue 12.5% / UA 12.5%
 *   Premium (>$7,000):    Artist 80% / Venue 10%   / UA 10%
 * When no venue is involved, the venue's share rolls up to the artist.
 *
 * @param {number} salePrice
 * @param {'entry'|'mid'|'premium'} tier
 * @param {boolean} hasVenue
 * @returns {{ artistShare: number, venueCommission: number, uaShare: number }}
 */
function calcSplits(salePrice, tier, hasVenue) {
  const price = Number(salePrice) || 0;

  const rates = {
    entry:   { artist: 0.70, venue: 0.15,  ua: 0.15  },
    mid:     { artist: 0.75, venue: 0.125, ua: 0.125 },
    premium: { artist: 0.80, venue: 0.10,  ua: 0.10  },
  };

  const r = rates[tier] || rates.entry;

  const uaShare         = round2(price * r.ua);
  const venueCommission = hasVenue ? round2(price * r.venue) : 0;
  const artistShare     = round2(price - uaShare - venueCommission);

  return { artistShare, venueCommission, uaShare };
}

/** @param {number} n @returns {number} */
function round2(n) {
  return Math.round(n * 100) / 100;
}
