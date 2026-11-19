/**
 * Stripe checkout helpers — the single source of truth for the app's
 * upgrade payment links. Used by every "Upgrade to Professional" CTA so
 * a dead URL or stale payment link only has to be fixed in one place.
 */

export const STRIPE_PAYMENT_LINKS = {
  yearly: 'https://buy.stripe.com/28E5kDeNNc8U995g2a0x200',
  monthly: 'https://buy.stripe.com/4gM5kDdJJ8WIdpl7vE0x201',
} as const;

export type BillingInterval = keyof typeof STRIPE_PAYMENT_LINKS;

export function buildCheckoutUrl(
  interval: BillingInterval,
  customerId?: string,
  email?: string,
): string {
  const url = new URL(STRIPE_PAYMENT_LINKS[interval]);
  if (customerId) url.searchParams.set('client_reference_id', customerId);
  if (email) url.searchParams.set('prefilled_email', email);
  return url.toString();
}

export function openCheckout(
  interval: BillingInterval,
  customerId?: string,
  email?: string,
): void {
  window.open(buildCheckoutUrl(interval, customerId, email), '_blank');
}
