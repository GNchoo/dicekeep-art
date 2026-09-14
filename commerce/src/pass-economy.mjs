import { int, requireThat, textId } from './common.mjs';

const PASS_ID = 'founders';
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const zeroCredit = () => ({ credited: 0, debtPaid: 0 });

export function ensurePassState(a) {
  requireThat(object(a), 'invalid-pass-state', 409);
  a.passGrants ??= {};
  a.passBenefits ??= {};
  requireThat(object(a.passGrants) && object(a.passBenefits), 'invalid-pass-state', 409);
  a.passGrants[PASS_ID] ??= {};
  a.passBenefits[PASS_ID] ??= { awardedShards: 0, reversedShards: 0, royalClaimed: false };
  const grants = a.passGrants[PASS_ID], benefits = a.passBenefits[PASS_ID];
  requireThat(object(grants) && Object.values(grants).every(value => value === true)
    && object(benefits) && int(benefits.awardedShards, 0, Number.MAX_SAFE_INTEGER)
    && int(benefits.reversedShards, 0, benefits.awardedShards)
    && typeof benefits.royalClaimed === 'boolean', 'invalid-pass-state', 409);
  return a;
}

function state(a, passId) {
  requireThat(passId === PASS_ID, 'invalid-pass', 409);
  ensurePassState(a);
  return { grants: a.passGrants[passId], benefits: a.passBenefits[passId] };
}

function validKey(key) {
  requireThat(textId(key, 256) && !['__proto__', 'prototype', 'constructor'].includes(key), 'invalid-pass-grant', 409);
}

function syncRoyal(a, passId, cosmetics) {
  const { grants, benefits } = state(a, passId);
  a.skinGrants ??= {};
  a.skinGrants.royal ??= {};
  const source = 'pass:' + passId;
  if (benefits.royalClaimed && Object.keys(grants).length) a.skinGrants.royal[source] = true;
  else delete a.skinGrants.royal[source];
  cosmetics(a);
}

export function premiumOwned(a, passId = PASS_ID) {
  return Object.keys(state(a, passId).grants).length > 0;
}

// Callers persist these mutations together with receipts/claims in their ledger transaction.
export function grantPass(a, passId, key, { credit, cosmetics }) {
  validKey(key);
  const { grants, benefits } = state(a, passId);
  if (Object.hasOwn(grants, key)) return zeroCredit();
  const restore = Object.keys(grants).length ? 0 : benefits.reversedShards;
  const result = restore ? credit(a, restore, 'paid') : zeroCredit();
  grants[key] = true;
  if (restore) benefits.reversedShards = 0;
  syncRoyal(a, passId, cosmetics);
  return result;
}

export function revokePass(a, passId, key, { revoke, cosmetics }) {
  validKey(key);
  const { grants, benefits } = state(a, passId);
  if (!Object.hasOwn(grants, key)) return { revokedShards: 0 };
  const lastSource = Object.keys(grants).length === 1;
  const amount = lastSource ? benefits.awardedShards - benefits.reversedShards : 0;
  if (amount) revoke(a, amount);
  delete grants[key];
  if (lastSource) benefits.reversedShards = benefits.awardedShards;
  syncRoyal(a, passId, cosmetics);
  return { revokedShards: amount };
}

export function grantPremiumReward(a, passId, reward, { credit, cosmetics }) {
  const { grants, benefits } = state(a, passId);
  requireThat(Object.keys(grants).length > 0, 'premium-required', 409);
  requireThat(object(reward) && int(reward.shards, 0, Number.MAX_SAFE_INTEGER)
    && (reward.gold === undefined || reward.gold === 0)
    && (reward.skinId === undefined || reward.skinId === 'royal')
    && Number.isSafeInteger(benefits.awardedShards + reward.shards), 'invalid-pass-reward', 409);
  const result = reward.shards ? credit(a, reward.shards, 'paid') : zeroCredit();
  // Track nominal awards even when credit uses them to repay an earlier refund debt.
  benefits.awardedShards += reward.shards;
  if (reward.skinId === 'royal') benefits.royalClaimed = true;
  syncRoyal(a, passId, cosmetics);
  return result;
}
