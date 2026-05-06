// @deno-types="npm:@types/stripe"
import Stripe from 'https://esm.sh/stripe@16.0.0?target=deno';

export const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
  apiVersion: '2024-06-20' as Stripe.LatestApiVersion,
  httpClient: Stripe.createFetchHttpClient(),
});

const PRICE_AUD_CENTS = 15000; // $150

export async function getOrCreatePrice(): Promise<string> {
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

export async function getOrCreateGSTTaxRate(): Promise<string> {
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

export function calculateAmounts(artworkCount: number) {
  const amount = artworkCount * 150;
  const gstAmount = +(amount * 0.1).toFixed(2);
  const totalAmount = +(amount + gstAmount).toFixed(2);
  return { amount, gstAmount, totalAmount };
}
