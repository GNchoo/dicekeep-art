# 배경음악 생성 프롬프트 (Suno / Udio)

2026-09-06. 코드(`music.js`)는 이미 파일을 받을 준비가 되어 있다. **파일만 지정한 이름으로 `audio/` 에 넣으면** 코드 합성 음악이 자동으로 파일로 교체된다. 코드 수정 없음.

## 개요

- 기본은 **코드 합성**(WebAudio 신스, `music.js` 의 `DKBGM`)이다. 파일이 없어도 게임은 항상 음악이 나온다.
- 트랙을 처음 필요로 할 때 `audio/bgm-<트랙>.ogg` → `.mp3` 순서로 한 번만 받아 보고, 있으면 그 파일을 루프 재생한다(없으면 합성). 결과는 세션 동안 캐시되므로 파일을 넣은 뒤에는 **새로고침**(Ctrl+F5) 할 것.
- 파일명 (둘 다 넣는다 — Safari 는 OGG 를 못 읽는다):

| 트랙 | 쓰이는 곳 | 파일 |
|---|---|---|
| 로비 | 타이틀·스테이지 선택·상점 | `audio/bgm-lobby.ogg` + `audio/bgm-lobby.mp3` |
| 배틀 | 일반 웨이브 전투 | `audio/bgm-battle.ogg` + `audio/bgm-battle.mp3` |
| 보스 | 보스 웨이브 (배틀에서 0.8초 크로스페이드) | `audio/bgm-boss.ogg` + `audio/bgm-boss.mp3` |

- 세 트랙 사이는 코드가 0.8초 크로스페이드로 잇는다. 효과음이 클 때 코드가 잠깐 음악을 줄인다(덕킹). 그러니 **트랙 안에 페이드·인트로·엔딩을 넣지 말 것**.

## 공통 규격

| 항목 | 값 |
|---|---|
| 루프 | **완전 루프**. 시작·끝 페이드 없음. 첫 박이 파일 첫 샘플에, 마지막 박이 파일 끝에 정렬. 끝의 리버브 꼬리는 잘라내거나 첫 박에 겹치도록 처리 |
| 길이 | 로비 60–90초 · 배틀 60초 · 보스 45–60초 (BPM 에 맞춰 마디 단위로 딱 떨어지게 자를 것) |
| 라우드니스 | **−14 LUFS** (통합), **true peak −1 dBTP** |
| 포맷 | **OGG Vorbis q6** (~192 kbps) + **MP3 192 kbps CBR**, 44.1 kHz, 스테레오 |
| 금지 | 보컬·가사·허밍·구호, 급격한 다이내믹 변화(드롭·브레이크다운·정적 구간), 트랙 안 템포 변화, 효과음처럼 들리는 소리(폭발·타격·동전) — 게임 효과음과 겹친다 |
| 스타일 | Kingdom Rush 류 캐주얼 판타지. 오케스트라+칩튠 하이브리드, 밝고 또렷한 믹스, 저음이 너무 두껍지 않게(모바일 스피커) |
| 라이선스 | 생성 서비스의 **상용 이용 가능한 유료 플랜**에서 생성했는지 확인하고, 생성 링크·계정·날짜를 `ASSET-MANIFEST.md` 에 기록 |

---

## 1. 로비 — `bgm-lobby`

**분위기**: 따뜻하고 장난기 있는 마을 광장. 주사위 굴리는 여관, 나무 간판, 오후 햇살. 긴 시간 들어도 지치지 않게 조용하고 반복적.

| | |
|---|---|
| BPM | **84** |
| 조 | **D 마이너 펜타토닉** (D F G A C) |
| 코드 | Dm – B♭ – F – C, 각 2마디 (16마디 루프) |
| 악기 | 부드러운 패드(현·목관 느낌), 하프/뮤직박스 아르페지오, 가벼운 어쿠스틱 기타 또는 피치카토, 아주 작은 셰이커. **드럼 없음** |

**Suno 프롬프트** (가사 칸은 비우고 Instrumental 켜기):

```text
Warm, playful fantasy village theme for a casual tower defense game, instrumental, seamless loop. Gentle harp and music-box arpeggios over soft string and woodwind pads, light acoustic guitar plucks, a tiny shaker. D minor pentatonic, 84 BPM, chord loop Dm - Bb - F - C. Cozy afternoon tavern feeling, cartoonish and friendly, no drums, no vocals, steady dynamics, no intro or outro, loops perfectly.
```
```text
style tags: casual fantasy game music, cozy, harp, music box, woodwind pad, acoustic, lo-fi orchestral, loopable, instrumental, 84 bpm
```

**Udio 프롬프트**:

```text
Cozy fantasy game lobby music, instrumental loop, 84 BPM, D minor pentatonic. Harp and music-box arpeggios, warm string pad, soft acoustic guitar, gentle shaker, no drums. Kingdom Rush style, playful and calm, constant dynamics, no vocals.
```

---

## 2. 배틀 — `bgm-battle`

**분위기**: 추진력. 몬스터가 길을 따라 밀려오고 주사위 타워가 연달아 쏜다. 긴박하지만 스트레스가 아니라 "재밌는 바쁨". 20분 이상 반복돼도 괜찮게 멜로디는 절제.

| | |
|---|---|
| BPM | **128** |
| 조 | **A 에올리안** (A 마이너) |
| 코드 | Am – F – C – G, 각 1마디 (8마디 루프, 두 번째 4마디는 변주) |
| 악기 | 8분음표 스퀘어/신스 베이스, 오프비트 스트링·브라스 스탭, 16분음표 아르페지오(칩튠 트라이앵글 또는 마림바), 킥 4분·스네어 2·4·햇 8분, 4·8마디째 오픈 햇 |

**Suno 프롬프트**:

```text
Upbeat heroic battle loop for a casual fantasy tower defense game, instrumental. Driving eighth-note synth bass, punchy off-beat string and brass stabs, fast chiptune triangle arpeggios, tight drums with kick on every beat and snare on 2 and 4, open hi-hat at the end of every 4 bars. A minor, 128 BPM, chord loop Am - F - C - G. Energetic but cheerful and cartoonish, orchestral-chiptune hybrid, steady intensity, no vocals, no breakdown, no intro or outro, seamless loop.
```
```text
style tags: fantasy battle game music, orchestral chiptune, driving, heroic, synth bass, string stabs, 128 bpm, loopable, instrumental
```

**Udio 프롬프트**:

```text
Energetic tower defense battle music, instrumental loop, 128 BPM, A minor, Am F C G. Eighth-note synth bass, off-beat orchestral stabs, chiptune arpeggios, steady rock drums. Bright, heroic, cartoonish, constant energy, no vocals, no breaks.
```

---

## 3. 보스 — `bgm-boss`

**분위기**: 위협적이되 코믹. 거대한 보스가 등장하지만 게임은 여전히 귀여운 치비 세계다. 메탈 갤럽 + 서커스/할로윈 오르간 느낌을 살짝. 급박하지만 유머가 있게.

| | |
|---|---|
| BPM | **150** |
| 조 | **D 프리지안** (D E♭ F G A B♭ C) — ♭2 를 살려 위협감 |
| 코드 | Dm – E♭ – Dm – B♭, 각 2마디 (8마디 루프) |
| 악기 | 갤럽 리듬(♩♪♪, 'x.xx.xx.') 디스토션 베이스·기타, 파워코드(루트+5도) 박마다, 고음 16분 아르페지오(오르간·칩튠 리드), 더블킥, 4마디마다 스네어 롤, 8마디 끝 라이저·심벌 |

**Suno 프롬프트**:

```text
Menacing but cartoonish boss battle loop for a casual fantasy tower defense game, instrumental. Galloping distorted bass and palm-muted guitar (triplet gallop rhythm), power chords on every beat, fast high organ and chiptune lead arpeggios, double-kick drums, snare roll every 4 bars, a short riser at the end of the 8-bar phrase. D Phrygian, 150 BPM, chord loop Dm - Eb - Dm - Bb. Big villain energy with a playful circus-Halloween tint, orchestral-metal-chiptune hybrid, steady intensity, no vocals, no intro or outro, seamless loop.
```
```text
style tags: boss battle game music, orchestral metal, chiptune, gallop, phrygian, villain theme, circus, 150 bpm, loopable, instrumental
```

**Udio 프롬프트**:

```text
Cartoon villain boss fight music, instrumental loop, 150 BPM, D Phrygian, Dm Eb Dm Bb. Galloping distorted bass, power chords, fast organ arpeggios, double kick drums, snare roll every 4 bars. Threatening yet comical, Kingdom Rush boss style, constant intensity, no vocals.
```

---

## 루프 검증 방법 (Audacity)

1. 파일을 열고 **끝 2초를 복사**해 새 트랙 맨 앞에 붙인 뒤 원본 시작과 이어 들어본다. 이음새에 **클릭·툭 소리·박자 밀림**이 있으면 실패.
2. 파형 확대: 첫 샘플과 마지막 샘플이 모두 **0 근처**인지(아니면 클릭 발생). 아니면 마지막 마디 끝(다음 첫 박 직전)에서 **제로 크로싱**으로 자를 것.
3. 길이가 `60 / BPM × 4 × 마디수` 초와 맞는지 확인 (로비 84 BPM 16마디 = 45.71초 ×n, 배틀 128 BPM 8마디 = 15초 ×n, 보스 150 BPM 8마디 = 12.8초 ×n).
4. 분석 → **라우드니스 정규화** −14 LUFS, 효과 → 리미터 true peak −1 dB.
5. 내보내기: OGG 품질 6, MP3 192 kbps CBR. MP3 는 앞에 인코더 무음이 붙으므로 **Audacity 최신판(LAME gapless)** 으로 내보내고 루프 재확인.

## 납품 뒤 확인 절차

1. `audio/` 폴더에 6개 파일을 넣는다 (`bgm-lobby/battle/boss` × `.ogg/.mp3`).
2. `python3 serve.py` 를 띄우고 **`http://localhost:8137`** 을 연다 (file:// 금지 — fetch 가 막힌다). Ctrl+F5.
3. 화면을 한 번 클릭해 오디오를 깨운 뒤, 콘솔에서:
   ```js
   DKBGM.state()                 // { current: 'lobby', source: 'file', files: { lobby: 'file', ... } }
   DKBGM.state().source === 'file'
   ```
   `source` 가 `'synth'` 면 파일을 못 읽은 것 — 네트워크 탭에서 `audio/bgm-lobby.ogg` 가 200 인지, 경로·대소문자·확장자를 확인.
4. 스테이지에 들어가 배틀 → 보스 웨이브로 넘어가며 `DKBGM.current()` 가 `'battle'` → `'boss'` 로 바뀌고 크로스페이드가 자연스러운지, 루프 이음새가 매끄러운지 2회 이상 듣는다.
5. 탭을 숨겼다 돌아와도(visibilitychange) 음악이 이어지는지, 설정의 음악 볼륨이 적용되는지 확인.
6. `ASSET-MANIFEST.md` 에 파일명·길이·BPM·생성 서비스·플랜·날짜를 기록한다.
