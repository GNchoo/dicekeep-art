const {test}=require('node:test'),assert=require('node:assert/strict');
const N=require('../reward-notifications.js');
function state(){return {account:{linked:true},attendance:{claimedToday:false},serverNow:1000,mail:[
  {id:'fresh',claimed:false,expiresAt:2000},{id:'read',claimed:true,expiresAt:null},
  {id:'expired',claimed:false,expiresAt:999},{id:'revoked',claimed:false,expired:true,expiresAt:99999}],
  pass:{xp:200,premiumOwned:false,tiers:[
    {requiredXp:100,free:{claimed:true},premium:{claimed:false}},
    {requiredXp:200,free:{claimed:false},premium:{claimed:false}},
    {requiredXp:300,free:{claimed:false},premium:{claimed:false}}]}};}
test('only a current unclaimed mail and an earned free tier signal; locked premium does not',()=>{
  const v=state();assert.deepEqual(N.counts(v,1000),{attendance:1,mail:1,pass:1});
  v.pass.tiers[1].free.claimed=true;v.attendance.claimedToday=true;
  assert.deepEqual(N.counts(v,1000),{attendance:0,mail:1,pass:0});
  v.pass.premiumOwned=true;assert.equal(N.counts(v,1000).pass,2);
  for(const t of v.pass.tiers)t.premium.claimed=true;assert.equal(N.counts(v,1000).pass,0);
});
test('expiry uses the supplied authoritative time and guest mail is never advertised',()=>{
  const v=state();assert.equal(N.counts(v,1999).mail,1);assert.equal(N.counts(v,2000).mail,0);
  v.mail.push({id:'permanent',claimed:false,expiresAt:null});assert.equal(N.counts(v,1e12).mail,1);
  v.account.linked=false;assert.equal(N.counts(v,1000).mail,0);
  assert.deepEqual(N.counts(null),{attendance:0,mail:0,pass:0});
});
