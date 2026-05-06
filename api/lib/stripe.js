const Stripe = require('stripe');

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

const ARTWORK_PRICE_AUD_CENTS = 15000; // $150 AUD
const GST_RATE = 0.10;

let _priceId = null;
let _taxRateId = null;

async function getOrCreatePrice() {
  if (_priceId) return _priceId;

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
    p.unit_amount === ARTWORK_PRICE_AUD_CENTS &&
    p.currency === 'aud' &&
    p.recurring?.interval === 'month'
  );

  if (!price) {
    price = await stripe.prices.create({
      product: product.id,
      unit_amount: ARTWORK_PRICE_AUD_CENTS,
      currency: 'aud',
      recurring: { interval: 'month' },
    });
  }

  _priceId = price.id;
  return _priceId;
}

async function getOrCreateGSTTaxRate() {
  if (_taxRateId) return _taxRateId;

  const taxRates = await stripe.taxRates.list({ active: true, limit: 100 });
  let taxRate = taxRates.data.find(t =>
    t.percentage === 10 &&
    t.jurisdiction === 'AU' &&
    !t.inclusive
  );

  if (!taxRate) {
    taxRate = await stripe.taxRates.create({
      display_name: 'GST',
      description: 'Australian Goods and Services Tax',
      jurisdiction: 'AU',
      percentage: 10,
      inclusive: false,
    });
  }

  _taxRateId = taxRate.id;
  return _taxRateId;
}

async function createCustomer({ name, email, phone, metadata = {} }) {
  return stripe.customers.create({ name, email, phone, metadata });
}

async function createSubscription({ customerId, artworkCount, installedAt }) {
  const priceId = await getOrCreatePrice();
  const taxRateId = await getOrCreateGSTTaxRate();

  return stripe.subscriptions.create({
    customer: customerId,
    items: [{ price: priceId, quantity: artworkCount }],
    default_tax_rates: [taxRateId],
    payment_settings: {
      payment_method_types: ['card', 'au_becs_debit'],
      save_default_payment_method: 'on_subscription',
    },
    collection_method: 'charge_automatically',
    expand: ['latest_invoice'],
  });
}

async function updateSubscriptionQuantity({ subscriptionId, newQuantity }) {
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const itemId = subscription.items.data[0].id;

  return stripe.subscriptionItems.update(itemId, {
    quantity: newQuantity,
    proration_behavior: 'create_prorations',
  });
}

async function cancelSubscription({ subscriptionId, immediately = false }) {
  if (immediately) {
    return stripe.subscriptions.cancel(subscriptionId);
  }
  return stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: true });
}

async function getSubscription(subscriptionId) {
  return stripe.subscriptions.retrieve(subscriptionId, {
    expand: ['latest_invoice', 'default_payment_method'],
  });
}

async function createCustomerPortalSession({ customerId, returnUrl }) {
  return stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  });
}

function calculateAmounts(artworkCount) {
  const amount = artworkCount * 150;
  const gstAmount = +(amount * GST_RATE).toFixed(2);
  const totalAmount = +(amount + gstAmount).toFixed(2);
  return { amount, gstAmount, totalAmount };
}

function constructWebhookEvent(payload, signature) {
  return stripe.webhooks.constructEvent(
    payload,
    signature,
    process.env.STRIPE_WEBHOOK_SECRET
  );
}

module.exports = {
  stripe,
  createCustomer,
  createSubscription,
  updateSubscriptionQuantity,
  cancelSubscription,
  getSubscription,
  createCustomerPortalSession,
  calculateAmounts,
  constructWebhookEvent,
};
