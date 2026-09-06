// 앱(Capacitor) 전용 다리 — 웹 배포에는 쓰이지 않는다 (.assetsignore). tools/build-www.mjs 가
// Capacitor core UMD + 플러그인 UMD(App·SplashScreen·StatusBar·SafeArea) 뒤에 이 파일을 이어붙여 www/app.js 로 만든다.
// index.html 에서는 net.js 보다 먼저 실행되어야 한다 (DK_NET_URL 을 net.js 가 읽는다).
//
// game.js 와의 약속:
//   window.DKAPP.back()  → 뒤로가기 처리. 화면을 하나 닫았으면 true, 더 닫을 게 없으면(로비) false
//   window.DKAPP.toast(msg) → 짧은 안내 문구 (없어도 된다)
//   window.DKBGM.suspend() / resume() → 배경음 일시정지·재개 (없어도 된다)
//   game.js 는 첫 화면이 그려진 뒤 window.DKAPP_NATIVE && DKAPP_NATIVE.ready() 를 부른다 → 스플래시를 내린다
(function () {
  'use strict';
  var W = window;
  var Cap = W.Capacitor;
  if (!Cap || !Cap.isNativePlatform || !Cap.isNativePlatform()) return;   // 브라우저에서는 아무것도 안 함
  var P = Cap.Plugins || {};
  var App = P.App, Splash = P.SplashScreen, Bar = P.StatusBar;
  var log = function () { try { console.log.apply(console, ['[app]'].concat([].slice.call(arguments))); } catch (_) {} };

  // 멀티 서버: 앱 안에서는 hostname 이 localhost 라 net.js 의 호스트 규칙이 로컬 서버를 가리키므로 운영 서버를 못박는다
  // (net.js _resolveUrl 은 native 이면 이 값을 localhost 규칙보다 먼저 쓴다. ?net= 과 저장값(dk_net)은 여전히 이긴다)
  if (!W.DK_NET_URL) W.DK_NET_URL = 'wss://dicekeep-net.cgn3731.workers.dev';

  // 상태 표시줄 숨김 (몰입 모드는 MainActivity 쪽에서도 건다)
  try { if (Bar && Bar.hide) Bar.hide().catch(function () {}); } catch (_) {}

  // 스플래시: game.js 가 준비되면 내린다. 혹시 못 부르면 8초 뒤 안전장치
  var splashDone = false;
  function hideSplash() {
    if (splashDone) return; splashDone = true;
    try { if (Splash && Splash.hide) Splash.hide({ fadeOutDuration: 250 }).catch(function () {}); } catch (_) {}
  }
  W.DKAPP_NATIVE = { ready: hideSplash, platform: Cap.getPlatform ? Cap.getPlatform() : 'native' };
  setTimeout(hideSplash, 8000);

  if (!App || !App.addListener) { log('App 플러그인 없음'); return; }

  // Android 뒤로가기: 게임이 화면을 하나 닫으면 끝. 로비(더 닫을 게 없음)면 2초 안에 두 번 눌러 종료
  var lastBack = 0;
  App.addListener('backButton', function () {
    var handled = false;
    try { handled = !!(W.DKAPP && W.DKAPP.back && W.DKAPP.back()); } catch (e) { log('back', e); }
    if (handled) return;
    var now = Date.now();
    if (now - lastBack < 2000) { try { App.exitApp(); } catch (_) {} return; }
    lastBack = now;
    try { if (W.DKAPP && W.DKAPP.toast) W.DKAPP.toast('한 번 더 누르면 종료합니다'); } catch (_) {}
  });

  // 백그라운드: 배경음 멈춤 · 복귀: 재개 + 크기 다시 계산 (회전·시스템바 변화)
  App.addListener('pause', function () {
    try { if (W.DKBGM && W.DKBGM.suspend) W.DKBGM.suspend(); } catch (_) {}
  });
  App.addListener('resume', function () {
    try { if (W.DKBGM && W.DKBGM.resume) W.DKBGM.resume(); } catch (_) {}
    try { if (Bar && Bar.hide) Bar.hide().catch(function () {}); } catch (_) {}
    try { W.dispatchEvent(new Event('resize')); } catch (_) {}
  });
})();
