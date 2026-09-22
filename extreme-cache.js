// 극한 아트(casual/{enemies,bosses}/extreme/** 666장 · 74 MiB)를 첫 진입 때 내려받아 캐시한다.
//
// 왜 —  이 666장은 www 의 가장 큰 덩어리이고, Play 초기 다운로드 한도 200 MB 를 넘기는
// 직접적인 원인이다. 그런데 101웨이브 이후에만 쓰이므로 대부분의 이용자는 닿지도 않는다.
// 앱에서 빼고 필요할 때 받으면 www 가 309 → 188 MiB 가 된다.
//
// 웹은 아무 영향이 없다 — Cloudflare 는 www/ 가 아니라 저장소 루트를 그대로 올리고
// .assetsignore 도 이 경로를 막지 않아서, 상대경로가 지금처럼 그대로 풀린다.
// 바뀌는 것은 APK 뿐이고, 그 "그대로 서비스되는 URL" 이 곧 내려받을 원본이다.
//
// 실패는 치명적이지 않다 — extreme-art.js 의 view 333개에 전부 64px 인라인 WebP fallback 이
// 있고 infinity-art.js 가 sheet → still → fallback 순으로 강등한다. 못 받으면 저해상도로
// 계속 플레이되고, 네트워크가 돌아오면 다음 진입 때 받는다. 그래서 재시도 큐·부분 재개·
// 무결성 롤백 같은 장치를 두지 않는다.
(function (W) {
  'use strict';
  const EXTREME_RE = /\/casual\/(?:enemies|bosses)\/extreme\//;
  const ROOT = 'extreme-art';               // Filesystem 안의 폴더
  const CONCURRENCY = 5;

  // 내려받을 원본. 앱은 https://localhost 에서 돌기 때문에 상대경로가 안 먹는다.
  // 웹에서 돌 때는 이 값을 안 쓴다(아래 available() 이 false).
  const ORIGIN = (W.DKEXTREME_ORIGIN || 'https://dicekeep.cgn3731.workers.dev').replace(/\/+$/, '');

  const cap = () => W.Capacitor;
  // isNativePlatform() 으로 판단하면 안 된다 — 테스트가 그것만 스텁하고 Plugins 는 안 주는
  // 경우가 있다(tools/e2e/extreme-multiplayer.cjs:11). 실제로 쓸 객체의 존재로 판단한다.
  const fsPlugin = () => { const C = cap(); return C && C.Plugins && C.Plugins.Filesystem; };
  const available = () => !!(fsPlugin() && cap().convertFileSrc);

  // 'casual/enemies/extreme/w102-side.webp' 처럼 매니페스트가 쓰는 상대경로로 되돌린다.
  function relOf(url) {
    let pathname;
    try { pathname = new URL(url, W.location && W.location.href).pathname; } catch (e) { return null; }
    if (!EXTREME_RE.test(pathname)) return null;
    return pathname.replace(/^\/+/, '');
  }
  const localPath = (rel) => ROOT + '/' + rel.split('/').pop();   // 파일명이 이미 전역 고유하다

  const cached = new Map();   // rel -> convertFileSrc 로 만든 로컬 URL
  let scanned = false;

  // 이미 받아 둔 파일 목록을 한 번만 읽어 둔다. 캐시가 비어 있어도 조용히 넘어간다.
  async function scan() {
    if (scanned || !available()) { scanned = true; return; }
    scanned = true;
    const FS = fsPlugin();
    try {
      const listing = await FS.readdir({ path: ROOT, directory: 'DATA' });
      for (const item of listing.files || []) {
        const name = typeof item === 'string' ? item : item.name;
        if (!name) continue;
        try {
          const { uri } = await FS.getUri({ path: ROOT + '/' + name, directory: 'DATA' });
          cached.set(name, cap().convertFileSrc(uri));
        } catch (e) { /* 개별 파일 실패는 무시한다 — 없으면 원격에서 받는다 */ }
      }
    } catch (e) { /* 폴더가 아직 없다 */ }
  }

  // infinity-art.js 의 options.loadImage 에서 부르는 것. 극한 경로가 아니면 그대로 돌려준다.
  function resolve(url) {
    const rel = relOf(url);
    if (!rel || !available()) return url;
    const hit = cached.get(rel.split('/').pop());
    if (hit) return hit;                              // 캐시 적중
    return ORIGIN + '/' + rel + (url.includes('?') ? url.slice(url.indexOf('?')) : '');
  }

  // 매니페스트에서 666개 경로를 뽑는다. 이름 규칙에 기대지 않고 실제 값을 읽는다.
  function allPaths() {
    const m = W.INF_EXTREME_ART;
    if (!m || !m.entries) return [];
    const out = new Set();
    for (const entry of Object.values(m.entries)) {
      for (const view of Object.values(entry.views || {})) {
        for (const key of ['still', 'sheet']) if (view[key]) out.add(view[key]);
      }
    }
    return [...out];
  }

  let inFlight = null;
  /**
   * 전량을 받아 캐시한다. 이미 있는 파일은 건너뛰므로 중단 후 재개가 공짜다.
   * 절대 throw 하지 않는다 — 실패하면 저해상도로 계속 가는 것이 설계다.
   * @returns {Promise<{total:number, cached:number, downloaded:number, failed:number, skipped?:string}>}
   */
  function ensure(onProgress) {
    if (inFlight) return inFlight;
    inFlight = (async () => {
      const paths = allPaths();
      if (!available()) return { total: paths.length, cached: 0, downloaded: 0, failed: 0, skipped: 'no-filesystem' };
      await scan();
      const FS = fsPlugin();
      try { await FS.mkdir({ path: ROOT, directory: 'DATA', recursive: true }); } catch (e) { /* 이미 있다 */ }

      const todo = paths.filter((p) => !cached.has(p.split('/').pop()));
      const already = paths.length - todo.length;
      let done = 0, failed = 0;
      const tick = () => { if (onProgress) { try { onProgress((already + done + failed) / Math.max(1, paths.length)); } catch (e) {} } };
      tick();

      let next = 0;
      const worker = async () => {
        while (next < todo.length) {
          const rel = todo[next++], name = rel.split('/').pop();
          try {
            // downloadFile 은 브리지를 거치지 않고 네이티브가 바로 디스크에 쓴다.
            // 74 MiB 를 base64 로 왕복시키면 메모리·시간 모두 감당이 안 된다.
            await FS.downloadFile({ url: ORIGIN + '/' + rel, path: localPath(rel), directory: 'DATA', recursive: true });
            const { uri } = await FS.getUri({ path: localPath(rel), directory: 'DATA' });
            cached.set(name, cap().convertFileSrc(uri));
            done++;
          } catch (e) { failed++; }
          tick();
        }
      };
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, todo.length) }, worker));
      return { total: paths.length, cached: already, downloaded: done, failed };
    })().catch((error) => ({ total: 0, cached: 0, downloaded: 0, failed: 0, skipped: String((error && error.message) || error) }))
      .then((r) => { inFlight = null; return r; });
    return inFlight;
  }

  W.DKEXTREME = { available, resolve, ensure, allPaths, scan, isExtremeUrl: (u) => !!relOf(u) };

  // 캐시 목록을 미리 읽어 둔다. ensure() 를 거치지 않는 경로(멀티·재접속·DKstartInf)에서도
  // 이미 받아 둔 파일을 쓰게 하려는 것이다 — 안 하면 그런 진입마다 원격에서 다시 받는다.
  // resolve() 는 동기라서 여기서 기다릴 수 없고, 아직 안 끝났으면 그 사이의 요청만 원격으로
  // 나간다(정상 동작, 느릴 뿐). 실패는 조용히 무시한다.
  if (available()) { try { scan(); } catch (e) {} }
})(window);
