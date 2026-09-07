const fs = require('node:fs');
const path = require('node:path');

async function launchBrowser() {
  const { chromium } = require('playwright-core');
  const explicit = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  if (explicit && !fs.existsSync(explicit)) throw new Error(`Browser does not exist: ${explicit}`);
  const candidates = [
    explicit, chromium.executablePath(), '/opt/pw-browsers/chromium',
    '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    ...['PROGRAMFILES', 'PROGRAMFILES(X86)', 'LOCALAPPDATA'].flatMap(key => process.env[key] ? [
      path.join(process.env[key], 'Google/Chrome/Application/chrome.exe'),
      path.join(process.env[key], 'Microsoft/Edge/Application/msedge.exe'),
    ] : []),
  ];
  const executablePath = candidates.find(candidate => candidate && fs.existsSync(candidate));
  if (!executablePath) throw new Error('Chromium/Chrome/Edge not found. Set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH or install a Playwright Chromium browser.');
  console.log('browser', executablePath);
  return chromium.launch({ executablePath, args: process.platform === 'linux' ? ['--no-sandbox'] : [] });
}

function gameUrl(unlock = true) {
  const url = new URL('index.html', (process.env.E2E_BASE_URL || 'http://localhost:8137/').replace(/\/?$/, '/'));
  url.searchParams.set('net', 'off');
  url.searchParams.set('v', Date.now());
  if (unlock) url.searchParams.set('unlock', 'all');
  return url.href;
}

function outputPath(name) {
  const dir = path.resolve(process.env.E2E_OUTPUT_DIR || process.cwd());
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, name);
}

// Legacy optional assets may 404. New infinity assets and uncaught JS errors must fail.
function watchArtErrors(page) {
  const errors = [];
  const isInfinityArt = url => /\/casual\/(enemies|bosses)\/inf\//.test(new URL(url).pathname);
  page.on('pageerror', error => errors.push(`PAGEERROR ${error.message}`));
  page.on('response', response => {
    if (response.status() >= 400 && isInfinityArt(response.url())) errors.push(`${response.status()} ${response.url()}`);
  });
  page.on('requestfailed', request => {
    if (isInfinityArt(request.url())) errors.push(`REQUESTFAILED ${request.url()} ${request.failure()?.errorText}`);
  });
  return errors;
}

module.exports = { launchBrowser, gameUrl, outputPath, watchArtErrors };
