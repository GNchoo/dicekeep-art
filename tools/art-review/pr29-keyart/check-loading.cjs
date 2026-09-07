// Bounded key-art loading/title verification. No game or repository changes.
// node tools/art-review/pr29-keyart/check-loading.cjs (default v91; optional KEYART_EXPECTED_VERSION/KEYART_OUTPUT_DIR)
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { launchBrowser, gameUrl } = require('../../e2e/browser.cjs');
const repo = path.resolve(__dirname, '../../..');
const out = path.resolve(process.env.KEYART_OUTPUT_DIR || path.join(repo, 'gen/pr29-keyart-browser'));
const expectedVersion = process.env.KEYART_EXPECTED_VERSION || '91';
const cases = [
  { name: 'portrait-393x852', width: 393, height: 852, branch: 'p' },
  { name: 'screenshot-754x836', width: 754, height: 836, branch: 'l' },
  { name: 'desktop-1280x800', width: 1280, height: 800, branch: 'l' },
  { name: 'landscape-852x393', width: 852, height: 393, branch: 'l' },
];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const keyartName = url => /^title-keyart-(?:p|l|l-blur)\.jpg$/.test(path.basename(new URL(url).pathname)) ? path.basename(new URL(url).pathname) : null;

async function captureState(page, stage) {
  return page.evaluate(stage => {
    const visible = element => {
      if (!element) return false;
      const s = getComputedStyle(element), r = element.getBoundingClientRect();
      return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0;
    };
    const geometry = id => {
      const e = document.getElementById(id), r = e.getBoundingClientRect();
      return { id, visible: visible(e), x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom, scrollWidth: e.scrollWidth, clientWidth: e.clientWidth, scrollHeight: e.scrollHeight, clientHeight: e.clientHeight };
    };
    const overlay = document.getElementById('overlay'), box = document.getElementById('overlay-box'), button = document.getElementById('ov-btn');
    const css = getComputedStyle(overlay), body = getComputedStyle(document.body);
    const urls = value => [...value.matchAll(/url\(["']?([^"')]+)["']?\)/g)].map(match => new URL(match[1], location.href).href);
    const titleLayers = urls(body.getPropertyValue('--keyart-title'));
    const portraitLayers = urls(body.getPropertyValue('--keyart-title-p'));
    return {
      stage, phase: window.DK?.phase || null,
      viewport: { width: innerWidth, height: innerHeight },
      portraitMedia: matchMedia('(max-aspect-ratio: 3/4)').matches,
      boxClasses: box.className,
      keyart: { landscape: titleLayers.find(url => /title-keyart-l\.jpg/.test(url)), blur: titleLayers.find(url => /title-keyart-l-blur\.jpg/.test(url)), portrait: portraitLayers.find(url => /title-keyart-p\.jpg/.test(url)), displayed: urls(css.backgroundImage), backgroundSize: css.backgroundSize, backgroundPosition: css.backgroundPosition },
      preloads: [...document.querySelectorAll('link[rel="preload"][as="image"]')].filter(link => /title-keyart/.test(link.href)).map(link => ({ href: link.href, media: link.media, active: matchMedia(link.media).matches })),
      titleText: document.getElementById('ov-title').textContent.trim(),
      loadingText: document.getElementById('ov-load-txt').textContent.trim(),
      button: { visible: visible(button), disabled: button.disabled, text: button.textContent.trim() },
      document: { scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth, scrollHeight: document.documentElement.scrollHeight, clientHeight: document.documentElement.clientHeight },
      elements: ['overlay','overlay-box','ov-title','ov-sub','ov-load','ov-btn'].map(geometry),
    };
  }, stage);
}

function validateState(state, testCase, stage) {
  const errors = [], check = (ok, message) => { if (!ok) errors.push(message); };
  const selected = testCase.branch === 'p' ? state.keyart.portrait : state.keyart.landscape;
  check(state.portraitMedia === (testCase.branch === 'p'), 'wrong portrait/landscape media branch');
  check(state.keyart.displayed.includes(selected), 'selected key art is absent from rendered overlay background');
  if (testCase.branch === 'l') check(state.keyart.displayed.includes(state.keyart.blur), 'landscape blur background is absent');
  const active = state.preloads.filter(preload => preload.active);
  check(active.length === 1 && active[0].href === selected, 'active preload URL does not exactly match selected CSS image URL');
  for (const [kind, url] of Object.entries(state.keyart).filter(([kind]) => ['landscape','portrait','blur'].includes(kind))) {
    check(!!url && new URL(url).searchParams.get('v') === expectedVersion, kind + ': image version differs from promoted version');
  }
  for (const preload of state.preloads) check(new URL(preload.href).searchParams.get('v') === expectedVersion, 'preload version differs from promoted version');
  check(state.titleText === '주사위 성채', 'title text is absent or changed');
  check(state.document.scrollWidth <= state.document.clientWidth + 1, 'document horizontal overflow');
  const overlay = state.elements.find(element => element.id === 'overlay');
  check(overlay.visible && Math.abs(overlay.x) <= 1 && Math.abs(overlay.y) <= 1 && Math.abs(overlay.width - testCase.width) <= 1 && Math.abs(overlay.height - testCase.height) <= 1, 'overlay does not cover viewport');
  check(overlay.scrollWidth <= overlay.clientWidth + 1 && overlay.scrollHeight <= overlay.clientHeight + 1, 'loading/title overlay scroll overflow');
  for (const element of state.elements.filter(element => element.visible && ['ov-title','ov-sub',stage === 'loading' ? 'ov-load' : 'ov-btn'].includes(element.id))) {
    check(element.x >= -1 && element.y >= -1 && element.right <= testCase.width + 1 && element.bottom <= testCase.height + 1, element.id + ': visible control extends beyond viewport');
  }
  if (stage === 'loading') {
    check(state.boxClasses.split(/\s+/).includes('loading') && !state.boxClasses.split(/\s+/).includes('preload'), 'loading image decode gate has not completed');
    check(state.elements.find(element => element.id === 'ov-load').visible, 'loading progress is not visible');
    check(state.button.disabled && !state.button.visible, 'start button is prematurely available during loading');
  } else {
    check(state.phase === 'title', 'normal asset loading did not reach title');
    check(state.button.visible && !state.button.disabled && state.button.text === '게임 시작', 'start button is not visible/enabled');
    check(!state.elements.find(element => element.id === 'ov-load').visible, 'loading progress remains visible on title');
  }
  return errors;
}

async function main() {
  assert.ok(expectedVersion, 'Set KEYART_EXPECTED_VERSION to the promoted URL v before the final run');
  fs.mkdirSync(out, { recursive: true });
  const localAssets = Object.fromEntries(['p','l','l-blur'].map(kind => {
    const name = `title-keyart-${kind}.jpg`, file = path.join(repo,'ui',name);
    return [name, { file: path.relative(repo,file).replaceAll('\\','/'), sha256: hash(fs.readFileSync(file)) }];
  }));
  const report = { expectedVersion, baseUrl: process.env.E2E_BASE_URL || 'http://localhost:8137/', localAssets, scope: 'Four Chromium viewport checks of actual key-art bytes, preload/version selection, decoded loading state, title readiness and layout. Normal PNG requests are delayed only until the loading screenshot; all original responses are then released. D6 pip count and chip aesthetics require visual review.', cases: [], errors: [] };
  const browser = await launchBrowser();
  try {
    for (const testCase of cases) {
      const context = await browser.newContext({ viewport: { width: testCase.width, height: testCase.height }, deviceScaleFactor: 1 });
      const page = await context.newPage();
      const row = { ...testCase, heldPngRequests: 0, responses: [], pageErrors: [], keyartErrors: [], otherHttpErrors: [], checks: [], errors: [] };
      report.cases.push(row);
      const pendingResponses = [];
      let releaseGate, released = false;
      const gate = new Promise(resolve => { releaseGate = () => { released = true; resolve(); }; });
      page.on('pageerror', error => row.pageErrors.push(error.message));
      page.on('requestfailed', request => { if (keyartName(request.url())) row.keyartErrors.push(`REQUESTFAILED ${request.url()} ${request.failure()?.errorText}`); });
      page.on('response', response => {
        const name = keyartName(response.url());
        if (!name) { if (response.status() >= 400) row.otherHttpErrors.push({ url: response.url(), status: response.status() }); return; }
        pendingResponses.push((async () => {
          const item = { url: response.url(), status: response.status(), sha256: null, matchesLocalPromotedFile: false };
          row.responses.push(item);
          if (response.status() >= 400) { row.keyartErrors.push(`${response.status()} ${response.url()}`); return; }
          try {
            item.sha256 = hash(await response.body());
            item.matchesLocalPromotedFile = item.sha256 === localAssets[name].sha256;
            if (!item.matchesLocalPromotedFile) row.keyartErrors.push('served bytes differ from promoted local file: ' + response.url());
            if (new URL(response.url()).searchParams.get('v') !== expectedVersion) row.keyartErrors.push('requested stale key-art version: ' + response.url());
          } catch (error) { row.keyartErrors.push('response body unavailable: ' + error.message); }
        })());
      });
      await page.route('**/*', async route => {
        if (!released && /\.png$/i.test(new URL(route.request().url()).pathname)) { row.heldPngRequests++; await gate; }
        try { await route.continue(); }
        catch (error) { if (!page.isClosed()) row.errors.push('request delay helper: '+error.message); }
      });
      try {
        await page.goto(gameUrl(false), { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForFunction(() => {
          const box=document.getElementById('overlay-box');
          return box?.classList.contains('loading') && !box.classList.contains('preload') && getComputedStyle(document.getElementById('overlay')).backgroundImage.includes('title-keyart');
        }, null, { timeout: 15000 });
        // A successful explicit decode also detects the startup gate's timeout or
        // error fallback; it uses the same actual URL and never replaces pixels.
        const initial = await captureState(page, 'loading');
        row.decodedDisplayedImages = await page.evaluate(async urls => Promise.all(urls.map(async url => {
          const image = new Image(); image.src = url; await image.decode();
          return { url, width: image.naturalWidth, height: image.naturalHeight };
        })), initial.keyart.displayed);
        await page.evaluate(async () => { await document.fonts.ready; await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
        const loading = await captureState(page, 'loading');
        row.checks.push(loading); row.errors.push(...validateState(loading,testCase,'loading'));
        assert.ok(row.heldPngRequests > 0, 'PNG loading delay did not hold any requests');
        await page.screenshot({ path: path.join(out,testCase.name+'-loading.png'), animations: 'disabled' });
        releaseGate();
        await page.waitForFunction(() => window.DK?.phase === 'title', null, { timeout: 120000 });
        await page.locator('#ov-btn').click({ trial: true, timeout: 5000 });
        const title = await captureState(page, 'title');
        row.checks.push(title); row.errors.push(...validateState(title,testCase,'title'));
        await page.screenshot({ path: path.join(out,testCase.name+'-title.png'), animations: 'disabled' });
        await Promise.all(pendingResponses);
        for (const image of row.decodedDisplayedImages) assert.ok(row.responses.some(response => response.url === image.url && response.status === 200 && response.matchesLocalPromotedFile), 'decoded displayed image lacks matching successful response: '+image.url);
      } catch (error) { row.errors.push(error.message); }
      finally { releaseGate(); await context.close(); await Promise.all(pendingResponses); }
      row.errors.push(...row.pageErrors,...row.keyartErrors);
      console.log(`${row.errors.length?'FAIL':'PASS'} ${testCase.name} branch=${testCase.branch} keyartResponses=${row.responses.length} pageErrors=${row.pageErrors.length} keyartErrors=${row.keyartErrors.length} otherHttpErrors=${row.otherHttpErrors.length}`);
      if (row.errors.length) console.log(row.errors.join('\n'));
    }
    report.errors = report.cases.flatMap(row => row.errors.map(error => row.name+': '+error));
  } finally {
    await browser.close();
    fs.writeFileSync(path.join(out,'keyart-d6-check.json'), JSON.stringify(report,null,2)+'\n');
  }
  if (report.errors.length) throw new Error(report.errors.length+' key-art/loading/title checks failed');
  console.log('PASS key-art loading/title: four viewports, eight captures, promoted bytes and preload versions verified');
}
main().catch(error => { console.error(error); process.exitCode=1; });
