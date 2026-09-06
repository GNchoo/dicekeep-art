'use strict';
// ───────────────────────────────────────────────────────────────────────────
// DKBGM — WebAudio 배경음악 모듈 (코드 합성 기본, audio/ 파일이 있으면 자동 교체)
//   game.js 의 audio() 가 DKBGM.attach(ac, musicBus) 를 한 번 호출하고,
//   장면 전환마다 DKBGM.set('lobby'|'battle'|'boss'|null) 을 부른다.
//   파일 규격·프롬프트는 MUSIC-PROMPTS.md 참고.
// ───────────────────────────────────────────────────────────────────────────
(function () {
  const FILES = { lobby: 'audio/bgm-lobby', battle: 'audio/bgm-battle', boss: 'audio/bgm-boss' };
  const FADE = 0.8, LOOKAHEAD = 0.12, TICK = 25, PROBE_WAIT = 300;

  let ac = null, bus = null, master = null, comp = null; // master(덕킹) → comp → bus
  let wanted = null, cur = null, paused = false;
  const probe = {};   // name → { status: 'unknown'|'file'|'synth', buf, pending: [] }
  const noiseCache = new Map(), curveCache = new Map();

  const mf = m => 440 * Math.pow(2, (m - 69) / 12);       // MIDI → Hz
  const now = () => (ac ? ac.currentTime : 0);
  const safe = fn => { try { return fn(); } catch (e) { return undefined; } };

  // ── 공용 버퍼 ────────────────────────────────────────────────────────────
  function noiseBuffer(ctx) {
    let b = noiseCache.get(ctx);
    if (b) return b;
    b = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);           // 1초 백색 소음
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    noiseCache.set(ctx, b);
    return b;
  }
  function distCurve(ctx) {
    let c = curveCache.get(ctx);
    if (c) return c;
    c = new Float32Array(256);
    for (let i = 0; i < 256; i++) { const x = i / 127.5 - 1; c[i] = Math.tanh(x * 2.2) / Math.tanh(2.2); }
    curveCache.set(ctx, c);
    return c;
  }

  // ── 악기 (ctx, dest 에 묶인 보이스 세트) ─────────────────────────────────
  function makeVoices(ctx, dest) {
    function env(g, t, dur, vol, attack, decay) {
      const a = Math.max(0.001, attack), hold = Math.max(t + a, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(vol, t + a);
      g.gain.setValueAtTime(vol, hold);
      g.gain.exponentialRampToValueAtTime(0.0001, hold + Math.max(0.01, decay));
      return hold + Math.max(0.01, decay) + 0.02;
    }
    function noiseSrc(t, dur) {
      const s = ctx.createBufferSource(); s.buffer = noiseBuffer(ctx); s.loop = true;
      s.start(t); s.stop(t + dur + 0.05); return s;
    }
    const V = {};
    // 기본 오실레이터: o = { attack, decay, lp, detune, dist }
    V.osc = function (type, freq, t, dur, vol, o) {
      o = o || {};
      const s = ctx.createOscillator(); s.type = type; s.frequency.value = freq;
      if (o.detune) s.detune.value = o.detune;
      const g = ctx.createGain();
      let n = s;
      if (o.lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; f.Q.value = 0.7; n.connect(f); n = f; }
      if (o.dist) { const w = ctx.createWaveShaper(); w.curve = distCurve(ctx); n.connect(w); n = w; }
      n.connect(g); g.connect(dest);
      const end = env(g, t, dur, vol, o.attack == null ? 0.005 : o.attack, o.decay == null ? 0.1 : o.decay);
      s.start(t); s.stop(end);
    };
    V.kick = function (t, vol) {
      const s = ctx.createOscillator(); s.type = 'sine';
      s.frequency.setValueAtTime(150, t); s.frequency.exponentialRampToValueAtTime(45, t + 0.12);
      const g = ctx.createGain(); g.gain.setValueAtTime(vol || 0.3, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
      s.connect(g); g.connect(dest); s.start(t); s.stop(t + 0.16);
    };
    V.snare = function (t, vol) {
      vol = vol || 0.15;
      const n = noiseSrc(t, 0.12), f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1800; f.Q.value = 0.8;
      const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
      n.connect(f); f.connect(g); g.connect(dest);
      const s = ctx.createOscillator(); s.type = 'sine'; s.frequency.value = 180;
      const g2 = ctx.createGain(); g2.gain.setValueAtTime(vol * 0.9, t); g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
      s.connect(g2); g2.connect(dest); s.start(t); s.stop(t + 0.06);
    };
    V.hat = function (t, open, vol) {
      const dur = open ? 0.12 : 0.03, n = noiseSrc(t, dur), f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 6000;
      const g = ctx.createGain(); g.gain.setValueAtTime(vol || 0.03, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      n.connect(f); f.connect(g); g.connect(dest);
    };
    // 패드: 음마다 ±6센트 트라이앵글 2개, 느린 LFO 가 걸린 로우패스 ~900
    V.pad = function (freqs, t, dur, vol) {
      vol = vol || 0.05;
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900; f.Q.value = 0.5;
      const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 0.18; lg.gain.value = 250;
      lfo.connect(lg); lg.connect(f.frequency);
      const g = ctx.createGain(); f.connect(g); g.connect(dest);
      const end = env(g, t, dur - 0.4, vol, 0.35, 0.5);
      lfo.start(t); lfo.stop(end);
      freqs.forEach(fr => [-6, 6].forEach(dt => {
        const s = ctx.createOscillator(); s.type = 'triangle'; s.frequency.value = fr; s.detune.value = dt;
        s.connect(f); s.start(t); s.stop(end);
      }));
    };
    V.riser = function (t, dur, vol) {
      const n = noiseSrc(t, dur), f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 1.5;
      f.frequency.setValueAtTime(200, t); f.frequency.exponentialRampToValueAtTime(4000, t + dur);
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(vol || 0.1, t + dur * 0.9); g.gain.linearRampToValueAtTime(0.0001, t + dur);
      n.connect(f); f.connect(g); g.connect(dest);
    };
    return V;
  }

  // ── 트랙 정의: step(i, t, V, spb) — i = 루프 안 16분음표 인덱스 ────────────
  const upDown = tones => tones.concat(tones.slice(1, -1).reverse());
  const TRACKS = {
    // 로비: 84 BPM, D 마이너 펜타토닉, Dm–B♭–F–C 두 마디씩 (16마디)
    lobby: {
      bpm: 84, bars: 16, level: 1.0,
      chords: [[50, 53, 57], [46, 50, 53], [53, 57, 60], [48, 52, 55]],  // Dm B♭ F C (MIDI, 3옥타브)
      step(i, t, V, spb) {
        const bar = Math.floor(i / 16), s = i % 16, ch = this.chords[Math.floor(bar / 2) % 4];
        if (s === 0) V.pad(ch.concat([ch[0] - 12]).map(mf), t, spb * 16, 0.045);       // 온음표 패드 (+저음 루트)
        if (s % 2 === 0) {                                                             // 8분 사인 아르페지오 위/아래
          const seq = upDown([ch[0] + 12, ch[1] + 12, ch[2] + 12, ch[0] + 24]);
          const n = seq[(bar * 8 + s / 2) % seq.length];
          V.osc('sine', mf(n), t, spb * 1.2, 0.05, { attack: 0.005, decay: 0.35 });
        }
        if (s === 0 || s === 8) V.hat(t, false, 0.02);                                 // 두 박마다 작은 햇
        if (bar % 4 === 3 && s === 14) V.osc('sine', mf(ch[0] + 24), t, spb * 2, 0.035, { decay: 0.5 }); // 네 마디 끝 장식음
      }
    },
    // 배틀: 128 BPM, A 에올리안, Am–F–C–G 한 마디씩 (8마디)
    battle: {
      bpm: 128, bars: 8, level: 0.9,
      chords: [[45, 48, 52], [41, 45, 48], [48, 52, 55], [43, 47, 50]],  // Am F C G
      step(i, t, V, spb) {
        const bar = Math.floor(i / 16), s = i % 16, ch = this.chords[bar % 4], r = ch[0];
        if (s % 2 === 0) {                                                             // 스퀘어 베이스 8분: 루트 루트 5도 ♭7
          const bass = [r, r, r + 7, r + 10][(s / 2) % 4] - 12;
          V.osc('square', mf(bass), t, spb * 1.6, 0.12, { lp: 600, decay: 0.08 });
        }
        if (s % 4 === 2) ch.forEach(n => V.osc('sawtooth', mf(n + 12), t, spb * 1.2, 0.06, { lp: 1800, decay: 0.12 })); // 오프비트 스탭
        const arp = [r + 24, ch[1] + 24, ch[2] + 24, r + 36];                          // 트라이앵글 16분 아르페지오
        V.osc('triangle', mf(arp[s % 4]), t, spb * 0.8, 0.04, { decay: 0.1 });
        if (s % 4 === 0) V.kick(t, 0.3);
        if (s === 4 || s === 12) V.snare(t, 0.15);
        if (s % 2 === 0) V.hat(t, bar % 4 === 3 && s === 14, bar % 4 === 3 && s === 14 ? 0.035 : 0.025);
      }
    },
    // 보스: 150 BPM, D 프리지안, Dm–E♭–Dm–B♭ 두 마디씩 (8마디)
    boss: {
      bpm: 150, bars: 8, level: 0.85,
      chords: [[50, 53, 57], [51, 55, 58], [50, 53, 57], [46, 50, 53]],  // Dm E♭ Dm B♭
      gallop: 'x.xx.xx.',
      step(i, t, V, spb) {
        const bar = Math.floor(i / 16), s = i % 16, ch = this.chords[Math.floor(bar / 2) % 4], r = ch[0];
        if (this.gallop[s % 8] === 'x')                                                // 갤럽 베이스 (로우패스 + 디스토션)
          V.osc('sawtooth', mf(r - 24), t, spb * 0.9, 0.14, { lp: 900, dist: true, decay: 0.05 });
        if (s % 4 === 0) [r, r + 7].forEach(n => V.osc('sawtooth', mf(n), t, spb * 1.5, 0.07, { lp: 2200, decay: 0.15 })); // 파워코드
        const arp = [r + 24, ch[1] + 24, ch[2] + 24, r + 36, ch[2] + 24, ch[1] + 24, r + 24, ch[0] + 23]; // 고음 16분 (프리지안 ♭2 포함)
        V.osc('square', mf(arp[s % 8]), t, spb * 0.7, 0.04, { lp: 4000, decay: 0.08 });
        if (s % 4 === 0 || (bar === 7 && s % 2 === 0)) V.kick(t, 0.3);               // 킥 4분, 8마디째 더블킥
        if (s === 4 || s === 12) V.snare(t, 0.15);
        if (bar % 4 === 3 && s >= 12) V.snare(t, 0.06 + (s - 12) * 0.025);            // 4마디마다 롤
        if (s % 2 === 1) V.hat(t, false, 0.02);
        if (bar === 7 && s === 0) V.riser(t, spb * 16, 0.09);                          // 8마디 끝 라이저
      }
    }
  };

  // ── 재생 객체 ─────────────────────────────────────────────────────────────
  // p = { name, gain, source, synth: {gain, V, timer, step, nextTime}, file: {gain, src, buf, startedAt, offset}, dead }
  function startSynth(p) {
    if (p.dead || p.synth) return;
    const def = TRACKS[p.name], g = ac.createGain(); g.gain.value = def.level; g.connect(p.gain);
    p.synth = { gain: g, V: makeVoices(ac, g), timer: null, step: 0, nextTime: 0, def };
    p.source = p.file ? p.source : 'synth';
    runSynth(p);
  }
  function runSynth(p) {
    const sy = p.synth; if (!sy || sy.timer) return;
    const spb = 60 / sy.def.bpm / 4, total = sy.def.bars * 16;
    sy.nextTime = now() + 0.05;
    sy.timer = setInterval(() => {
      try {
        if (!ac || ac.state !== 'running') return;
        const t = ac.currentTime;
        if (sy.nextTime < t - 0.5) sy.nextTime = t + 0.05;       // 탭 스로틀 등으로 밀리면 현 위치에서 재개
        let n = 0;
        while (sy.nextTime < t + LOOKAHEAD && n++ < 64) {
          sy.def.step(sy.step, sy.nextTime, sy.V, spb);
          sy.nextTime += spb; sy.step = (sy.step + 1) % total;
        }
      } catch (e) { /* 무시 */ }
    }, TICK);
  }
  function haltSynth(p) { const sy = p.synth; if (sy && sy.timer) { clearInterval(sy.timer); sy.timer = null; } }

  function startFile(p, buf, offset) {
    if (p.dead) return;
    const f = p.file || (p.file = { gain: ac.createGain(), buf, startedAt: 0, offset: 0, src: null });
    if (!f.connected) { f.gain.connect(p.gain); f.connected = true; }
    const src = ac.createBufferSource(); src.buffer = buf; src.loop = true; src.connect(f.gain);
    f.offset = (offset || 0) % buf.duration; f.startedAt = now(); f.src = src;
    src.start(0, f.offset);
  }
  function haltFile(p) {
    const f = p.file; if (!f || !f.src) return;
    f.offset = (f.offset + now() - f.startedAt) % f.buf.duration;
    safe(() => f.src.stop()); f.src = null;
  }
  // 신스로 시작했다가 파일이 늦게 도착: 같은 재생 객체 안에서 크로스페이드
  function switchToFile(p, buf) {
    if (p.dead) return;
    if (!p.synth) { startFile(p, buf, 0); p.source = 'file'; return; }
    const t = now(); p.file = { gain: ac.createGain(), buf, startedAt: 0, offset: 0, src: null };
    p.file.gain.gain.setValueAtTime(0, t); p.file.gain.gain.linearRampToValueAtTime(1, t + FADE);
    startFile(p, buf, 0); p.source = 'file';
    const sg = p.synth.gain.gain; sg.cancelScheduledValues(t); sg.setValueAtTime(sg.value, t); sg.linearRampToValueAtTime(0.0001, t + FADE);
    const sy = p.synth;
    setTimeout(() => { safe(() => { clearInterval(sy.timer); sy.gain.disconnect(); }); if (p.synth === sy) p.synth = null; }, FADE * 1000 + 100);
  }

  function ensureProbe(name) {
    let pr = probe[name];
    if (pr) return pr;
    pr = probe[name] = { status: 'unknown', buf: null, pending: [] };
    const base = (typeof DKBGM.base === 'string' ? DKBGM.base : ''), path = base + FILES[name];
    const fin = (status, buf) => { pr.status = status; pr.buf = buf || null; const w = pr.pending; pr.pending = []; w.forEach(fn => safe(fn)); };
    const tryExt = ext => (typeof fetch === 'function' ? fetch(path + ext) : Promise.reject(new Error('no fetch')))
      .then(r => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
      .then(ab => new Promise((res, rej) => { const p = ac.decodeAudioData(ab, res, rej); if (p && p.then) p.then(res, rej); }));
    tryExt('.ogg').catch(() => tryExt('.mp3')).then(buf => fin('file', buf), () => fin('synth'));
    return pr;
  }

  function startPlayback(name) {
    const p = { name, gain: ac.createGain(), source: null, synth: null, file: null, dead: false };
    p.gain.connect(master);
    const pr = ensureProbe(name);
    if (pr.status === 'file') { startFile(p, pr.buf, 0); p.source = 'file'; }
    else if (pr.status === 'synth') startSynth(p);
    else {
      const timer = setTimeout(() => { if (!p.dead && !p.file) startSynth(p); }, PROBE_WAIT);   // 프로브가 느리면 신스 먼저
      pr.pending.push(() => {
        clearTimeout(timer);
        if (p.dead) return;
        if (pr.status === 'file') switchToFile(p, pr.buf); else startSynth(p);
      });
    }
    return p;
  }
  function stopPlayback(p, fade) {
    if (!p || p.dead) return;
    p.dead = true;
    const t = now(), g = p.gain.gain;
    g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(0.0001, t + fade);
    setTimeout(() => safe(() => { haltSynth(p); if (p.file && p.file.src) p.file.src.stop(); p.gain.disconnect(); }), fade * 1000 + 100);
  }

  function running() { return !!(ac && bus && ac.state === 'running' && !paused); }
  function applyWanted() {
    if (!running()) return;
    if (cur && !cur.dead && cur.name === wanted) return;
    const old = cur, t = now();
    cur = null;
    if (old) stopPlayback(old, FADE);
    if (!wanted) return;
    const p = startPlayback(wanted);
    p.gain.gain.setValueAtTime(0.0001, t); p.gain.gain.linearRampToValueAtTime(1, t + FADE);
    cur = p;
  }

  // ── 공개 API ─────────────────────────────────────────────────────────────
  const DKBGM = {
    base: '',
    attach(ctx, node) {
      try {
        if (!ctx || !node || ac) return;                        // 한 번만
        ac = ctx; bus = node;
        master = ac.createGain(); master.gain.value = 1;
        comp = ac.createDynamicsCompressor();
        comp.threshold.value = -18; comp.knee.value = 12; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.25;
        master.connect(comp); comp.connect(bus);
        if (typeof ac.addEventListener === 'function') ac.addEventListener('statechange', () => safe(applyWanted));
        else ac.onstatechange = () => safe(applyWanted);
        applyWanted();
      } catch (e) { /* 무시 */ }
    },
    set(track) {
      try {
        track = TRACKS[track] ? track : null;
        if (track === wanted && cur && !cur.dead && cur.name === track) return;
        wanted = track;
        applyWanted();
      } catch (e) { /* 무시 */ }
    },
    duck(mult, sec) {
      try {
        if (!master) return;
        const t = now(), g = master.gain;
        g.cancelScheduledValues(t); g.setValueAtTime(Math.max(0.0001, mult == null ? 0.4 : mult), t);
        g.linearRampToValueAtTime(1, t + Math.max(0.05, sec == null ? 1 : sec));
      } catch (e) { /* 무시 */ }
    },
    suspend() {
      try { paused = true; if (cur) { haltSynth(cur); haltFile(cur); } } catch (e) { /* 무시 */ }
    },
    resume() {
      try {
        paused = false;
        if (!ac || ac.state !== 'running') return;
        if (cur && !cur.dead && cur.name === wanted) {
          if (cur.synth) runSynth(cur);                                   // 패턴 위치를 유지한 채 재개
          if (cur.file && !cur.file.src) startFile(cur, cur.file.buf, cur.file.offset);
        } else applyWanted();
      } catch (e) { /* 무시 */ }
    },
    current() { return cur && !cur.dead ? cur.name : null; },
    state() {
      const files = {};
      Object.keys(FILES).forEach(k => { files[k] = probe[k] ? probe[k].status : 'unknown'; });
      return { attached: !!ac, wanted, current: cur && !cur.dead ? cur.name : null, source: cur && !cur.dead ? cur.source : null, running: running(), files };
    },
    // ── 테스트 보조: 신스 트랙을 OfflineAudioContext 로 렌더 (NaN/클리핑 검사용)
    _test: {
      tracks: Object.keys(TRACKS),
      renderOffline(track, seconds) {
        const def = TRACKS[track]; if (!def) return Promise.reject(new Error('unknown track ' + track));
        const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
        const oc = new OAC(2, Math.ceil(44100 * (seconds || 4)), 44100);
        const g = oc.createGain(); g.gain.value = def.level;
        const c = oc.createDynamicsCompressor(); c.threshold.value = -18; c.knee.value = 12; c.ratio.value = 4;
        g.connect(c); c.connect(oc.destination);
        const V = makeVoices(oc, g), spb = 60 / def.bpm / 4, total = def.bars * 16;
        for (let i = 0, t = 0.02; t < seconds; i = (i + 1) % total, t += spb) def.step(i, t, V, spb);
        return oc.startRendering();
      }
    }
  };
  window.DKBGM = DKBGM;
})();
