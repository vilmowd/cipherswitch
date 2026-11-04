export function stripeCheckoutUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Checkout could not be started.");
  }
  if (parsed.protocol !== "https:" || parsed.hostname !== "checkout.stripe.com") {
    throw new Error("Checkout could not be started.");
  }
  return parsed.toString();
}
