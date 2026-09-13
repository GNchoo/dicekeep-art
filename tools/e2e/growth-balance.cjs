// Actual combat using the existing bot, not a formula-only win-rate estimate.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { launchBrowser } = require('./browser.cjs');
const { playRun, openGame, summarize } = require('./pure-luck-clearrate.cjs');
const arg = key => process.argv.find(x => x.startsWith(`--${key}=`))?.split('=')[1];
const runs = Number(arg('runs') || 3);
const cases = [
  { name: 'starter', mode: 'build', deck: [1, 2, 3, 4, 5], level: 1 },
  { name: 'mixed', mode: 'build', deck: [3, 4, 6, 7, 10], level: 10 },
  { name: 'control', mode: 'build', deck: [4, 5, 14, 18, 20], level: 20 },
  { name: 'high', mode: 'build', deck: [16, 17, 18, 19, 20], level: 20 },
  { name: 'extreme20', mode: 'extreme', deck: [4, 5, 14, 18, 20], level: 20 },
  { name: 'extreme50', mode: 'extreme', deck: [4, 5, 14, 18, 20], level: 50 },
  { name: 'extreme100', mode: 'extreme', deck: [4, 5, 14, 18, 20], level: 100 },
  { name: 'extreme200', mode: 'extreme', deck: [4, 5, 14, 18, 20], level: 200 },
].filter(c => !arg('case') || arg('case').split(',').includes(c.name));
assert.ok(runs > 0 && runs <= 1000 && cases.length);
const out = path.resolve(process.env.E2E_OUTPUT_DIR || 'gen/e2e/growth-balance');
fs.mkdirSync(out, { recursive: true });
(async () => {
  const browser = await launchBrowser(), errors = [];
  const report = { scope: 'Seeded actual browser combat; bot policies are not human win rates.', rows: [], summaries: {}, pass: false };
  try {
    for (const c of cases) {
      const rows = [];
      for (let i = 0; i < runs; i++) {
        const { page, context } = await openGame(browser, errors);
        try {
          const params = { ...c, seed: 20260913 + i * 7919, policy: 'player', clearWave: c.mode === 'build' ? 101 : 505 };
          const before = Date.now(), result = await page.evaluate(playRun, params);
          rows.push(result); report.rows.push({ ...params, ...result, seconds: (Date.now() - before) / 1000 });
          console.log(c.name, i + 1, result.doneW, result.reason, 'stuck', result.heldStuck);
        } finally { await context.close(); }
      }
      report.summaries[c.name] = summarize(rows);
      fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
    }
    assert.deepEqual(errors, []); report.pass = true;
  } finally {
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
    await browser.close();
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
