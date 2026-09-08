import { requireThat, int, textId, fetchJson, ApiError } from './common.mjs';
import { paymentGate } from './catalog.mjs';
export class Providers {
  constructor(env, auth, fetcher = fetch) { this.env = env; this.auth = auth; this.fetch = (...args) => fetcher(...args); }
  async tossGet(orderId) {
    const r = await fetchJson(this.fetch, `https://api.tosspayments.com/v1/payments/orders/${encodeURIComponent(orderId)}`, { headers: { Authorization: `Basic ${btoa(this.env.TOSS_SECRET_KEY + ':')}` } });
    if (r.status === 404) return null;
    requireThat(r.ok && r.data, 'provider-unavailable', 503); return r.data;
  }
  async tossConfirm(order, paymentKey) {
    paymentGate(this.env, 'toss');
    // GET first recovers a successful approval whose response was lost. Never turn an uncertain GET into another POST.
    let result = await this.tossGet(order.id);
    if (result?.status === 'IN_PROGRESS') this.validateToss(result, order, paymentKey || result.paymentKey);
    if ((!result || result.status === 'IN_PROGRESS') && paymentKey) {
      result = null;
      try {
        const r = await fetchJson(this.fetch, 'https://api.tosspayments.com/v1/payments/confirm', {
          method: 'POST', headers: { Authorization: `Basic ${btoa(this.env.TOSS_SECRET_KEY + ':')}`, 'Content-Type': 'application/json', 'Idempotency-Key': order.id },
          body: JSON.stringify({ orderId: order.id, paymentKey, amount: order.amount })
        });
        if (r.ok) result = r.data;
      } catch (e) { if (!(e instanceof ApiError)) throw e; }
      // Includes timeout, already-processed and other ambiguous responses. No credit without a fresh trusted result.
      if (!result) result = await this.tossGet(order.id);
    }
    requireThat(result, 'payment-not-confirmed', 409);
    this.validateToss(result, order, paymentKey || result.paymentKey);
    requireThat(['DONE', 'CANCELED', 'PARTIAL_CANCELED'].includes(result.status), result.status === 'WAITING_FOR_DEPOSIT' ? 'payment-pending' : 'payment-not-complete', 409);
    return result;
  }
  validateToss(p, order, paymentKey = order.paymentKey) {
    requireThat(p && p.orderId === order.id && p.paymentKey === paymentKey && p.mId === this.env.TOSS_MID &&
      p.currency === 'KRW' && p.totalAmount === order.amount && (!p.customerKey || p.customerKey === order.customerKey), 'payment-mismatch', 409);
    requireThat(int(p.balanceAmount, 0, order.amount), 'payment-mismatch', 409);
    if (p.status === 'DONE') requireThat(p.balanceAmount === order.amount, 'payment-mismatch', 409);
    if (p.status === 'CANCELED') requireThat(p.balanceAmount === 0, 'payment-mismatch', 409);
  }
  async googleGet(token) {
    const bearer = await this.auth.accessToken(this.env);
    const r = await fetchJson(this.fetch, `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(this.env.GOOGLE_PLAY_PACKAGE)}/purchases/productsv2/tokens/${encodeURIComponent(token)}`, { headers: { Authorization: `Bearer ${bearer}` } });
    requireThat(r.ok && r.data, 'purchase-unverified', r.status === 404 ? 409 : 503); return r.data;
  }
  validateGoogle(p, productId, obfuscatedAccountId, allowCancelled = false) {
    requireThat(p && p.productLineItem?.length === 1, 'purchase-mismatch', 409);
    const item = p.productLineItem[0], offer = item.productOfferDetails;
    requireThat(item.productId === productId && offer?.quantity === 1 && int(offer.refundableQuantity, 0, 1) &&
      !offer.rentOfferDetails && !offer.preorderOfferDetails && p.obfuscatedExternalAccountId === obfuscatedAccountId && textId(p.orderId, 256), 'purchase-mismatch', 409);
    const test = p.testPurchaseContext?.fopType === 'TEST';
    requireThat(this.env.PAYMENT_MODE === 'test' ? test : !p.testPurchaseContext, 'purchase-environment-mismatch', 409);
    const state = p.purchaseStateContext?.purchaseState;
    requireThat(state === 'PURCHASED' || (allowCancelled && state === 'CANCELLED'), state === 'PENDING' ? 'payment-pending' : 'purchase-not-complete', 409);
    requireThat(['CONSUMPTION_STATE_YET_TO_BE_CONSUMED', 'CONSUMPTION_STATE_CONSUMED'].includes(offer.consumptionState), 'purchase-mismatch', 409);
    if (!allowCancelled) requireThat(offer.refundableQuantity === 1, 'purchase-refunded', 409);
    requireThat(['ACKNOWLEDGEMENT_STATE_PENDING', 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED'].includes(p.acknowledgementState), 'purchase-mismatch', 409);
    return { state, acknowledged: p.acknowledgementState === 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED', consumed: offer.consumptionState === 'CONSUMPTION_STATE_CONSUMED', refunded: state === 'CANCELLED' || offer.refundableQuantity === 0 };
  }
  async acknowledge(token, productId) {
    const bearer = await this.auth.accessToken(this.env);
    let r; try { r = await this.fetch(`https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(this.env.GOOGLE_PLAY_PACKAGE)}/purchases/products/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(token)}:acknowledge`, { method: 'POST', headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(15000) }); } catch { return false; }
    if (r.ok) return true;
    const p = await this.googleGet(token); return p.acknowledgementState === 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED';
  }
  async consume(token, productId) {
    const bearer = await this.auth.accessToken(this.env);
    let r; try { r = await this.fetch(`https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(this.env.GOOGLE_PLAY_PACKAGE)}/purchases/products/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(token)}:consume`, { method: 'POST', headers: { Authorization: `Bearer ${bearer}` }, signal: AbortSignal.timeout(15000) }); } catch { return false; }
    if (r.ok) return true;
    // An earlier consume may have succeeded despite a lost response. Re-query the actual state.
    const p = await this.googleGet(token);
    return p.productLineItem?.[0]?.productOfferDetails?.consumptionState === 'CONSUMPTION_STATE_CONSUMED';
  }
}
