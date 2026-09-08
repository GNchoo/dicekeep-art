import { requireThat, list, unb64 } from './common.mjs';
export const PRODUCTS = Object.freeze([
  { sku: 'shards60', kind: 'currency', shards: 60, amount: 1100, currency: 'KRW', playProductId: 'dicekeep.shards60' },
  { sku: 'shards600', kind: 'currency', shards: 600, amount: 9900, currency: 'KRW', playProductId: 'dicekeep.shards600' },
  { sku: 'shards2000', kind: 'currency', shards: 2000, amount: 33000, currency: 'KRW', playProductId: 'dicekeep.shards2000' },
  { sku: 'skinRoyal', kind: 'cosmetic', skinId: 'royal', shards: 0, amount: 4900, currency: 'KRW', playProductId: 'dicekeep.skin_royal' },
  { sku: 'skinFrost', kind: 'cosmetic', skinId: 'frost', shards: 0, amount: 4900, currency: 'KRW', playProductId: 'dicekeep.skin_frost' },
  { sku: 'skinEmber', kind: 'cosmetic', skinId: 'ember', shards: 0, amount: 4900, currency: 'KRW', playProductId: 'dicekeep.skin_ember' }
]);
const httpsUrl = value => { try { const u = new URL(value); return u.protocol === 'https:' && !!u.hostname && !u.username && !u.password; } catch { return false; } };
export function liveReady(env) {
  return env.ENABLE_LIVE_PURCHASES === 'true' && env.PROVIDER_CONTRACTS_CONFIRMED === 'true' && env.PRODUCTS_REGISTERED === 'true' &&
    !!env.MERCHANT_BUSINESS_NAME && !!env.MERCHANT_REGISTRATION_NUMBER && !!env.MERCHANT_CONTACT &&
    ['TERMS_URL', 'PRIVACY_URL', 'REFUND_POLICY_URL', 'ACCOUNT_DELETION_URL'].every(k => httpsUrl(env[k]));
}
export function enabled(env, provider) {
  const mode = env.PAYMENT_MODE || 'disabled';
  if (!['test', 'live'].includes(mode) || !list(env.GOOGLE_CLIENT_IDS).length) return false;
  if (mode === 'live' && !liveReady(env)) return false;
  try { if (unb64(env.TOKEN_ENCRYPTION_KEY || '').length !== 32) return false; } catch { return false; }
  if (!list(env.PUBLIC_ORIGINS).length) return false;
  if (provider === 'toss') return !!(env.TOSS_CLIENT_KEY && env.TOSS_SECRET_KEY && env.TOSS_MID &&
    env.TOSS_SECRET_KEY.startsWith(mode === 'test' ? 'test_sk_' : 'live_sk_') &&
    env.TOSS_CLIENT_KEY.startsWith(mode === 'test' ? 'test_ck_' : 'live_ck_'));
  return !!(env.GOOGLE_PLAY_PACKAGE && env.GOOGLE_SERVICE_ACCOUNT_EMAIL && env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY &&
    env.GOOGLE_RTDN_AUDIENCE && env.GOOGLE_RTDN_EMAIL);
}
export function paymentGate(env, provider) { requireThat(enabled(env, provider), 'purchases-disabled', 503); }
export function publicConfig(env) {
  const web = enabled(env, 'toss'), android = enabled(env, 'google');
  return { paymentMode: env.PAYMENT_MODE || 'disabled', purchasesEnabled: web || android,
    providers: { web, android }, googleClientId: env.GOOGLE_WEB_CLIENT_ID || list(env.GOOGLE_CLIENT_IDS)[0] || null,
    products: PRODUCTS, tossClientKey: web ? env.TOSS_CLIENT_KEY : null,
    merchant: { name: env.MERCHANT_BUSINESS_NAME || null, registrationNumber: env.MERCHANT_REGISTRATION_NUMBER || null, contact: env.MERCHANT_CONTACT || null },
    policies: { terms: env.TERMS_URL || null, privacy: env.PRIVACY_URL || null, refund: env.REFUND_POLICY_URL || null, accountDeletion: env.ACCOUNT_DELETION_URL || null },
    maxRunReward: 550, maxBaseRunReward: 500, firstMilestoneRewardCap: 50,
    minimumRunSeconds: 0, minimumSecondsPerWave: 2, combatVerification: 'client-reported' };
}
