# 출석·영구 패스·운영 우편 서버

공유 규칙은 `../liveops-rules.js`, 서비스는 `src/liveops.mjs`, 패스 영수증 회계는 `src/pass-economy.mjs`에 있다. `node commerce/build.mjs`로 공유 규칙의 ESM wrapper와 해시를 생성한다. 계정의 `liveops`, `passGrants`, `passBenefits`, `mailClaims`는 성장 프로필 밖에 저장하며 기존 지갑·연구·전투 snapshot을 바꾸지 않는다.

## 사용자 API

아래 API는 Google 로그인으로 발급한 기존 bearer 세션을 사용한다. 무료 API는 `PAYMENT_MODE=disabled`에서도 동작하며, 로그인 서버 설정은 별도로 필요하다. 클라이언트가 보낸 liveops/지갑/XP 전체 상태를 받아들이는 경로는 없다.

| 요청 | 본문 | 결과 |
|---|---|---|
| `GET /liveops` | 없음 | `profile,wallet,cosmetics,liveops,inbox,canAdmin,serverNow` |
| `POST /attendance/claim` | `{day,requestId}` | 전체 조회 결과와 `ok,reward,earnedReward,debtPaid,xpAdded,duplicate` |
| `POST /mail/claim` | `{id,requestId}` | 동일 |
| `POST /pass/claim` | `{tier,track,requestId}` | 동일 |

`liveops`는 공유 규칙 `view()` 형식이다. `day`는 화면에서 받은 한국 날짜 `YYYY-MM-DD`이며 서버의 현재 날짜와 달라지면 `day-mismatch`를 반환한다. `track`은 `free` 또는 `premium`. `requestId`는 영숫자·`_`·`-` 8~128자이며 재시도에 같은 값을 쓴다. 동일 ID/다른 요청은 `request-id-conflict`, 같은 요청은 최신 조회와 0보상·`duplicate:true`를 반환한다. 별도 ID로 이미 수령한 항목을 다시 요청하면 `already-claimed`다.

출석은 한국 자정 기준 하루 한 번, 7회 보상을 반복한다. 미접속한 날 때문에 누적 회차를 초기화하지 않는다. 매 수령 20XP를 더한다. 전투 XP는 최초 성공한 정산의 같은 저장 트랜잭션에서만 증가한다. 기존 모드는 `min(wave,200)*2`, 대전·협동은 서버가 확정한 `floor(activeSeconds*15/60)`이다. 영구 런 정산 키가 중복 지급을 막으며, 공유 규칙의 최근 64개 런 목록만을 권위로 쓰지 않는다.

출석·우편·무료 패스 조각은 `wallet.free`, 프리미엄 패스 조각은 `wallet.paid`에 넣는다. 두 잔액은 동일 연구에 쓰이며 적립은 기존 환불 부채를 먼저 상환한다. 연구 골드가 표면 상한에 도달하면 초과분을 `tree.reserveGold`에 보존한다. 조각 지갑 상한이나 저장 오류가 발생하면 상태와 보상 전체를 롤백하여 재시도할 수 있다.

## 영구 패스 구매와 환불

`passFounders` / Play `dicekeep.pass_founders`는 2,900원, `kind:'pass'`, `passId:'founders'`인 비소모성 일회 구매다. 20단계·총 2,000XP이며 구독과 만료가 없다. 매 단계 무료 100G+2조각, 프리미엄 10조각, 프리미엄 10단계에는 왕실 외형을 지급한다. 구매 자체가 XP나 단계 보상을 자동 지급하지 않으며, 이미 달성한 단계도 같은 수령 API로 나중에 청구할 수 있다.

Toss와 Google의 유효한 영수증을 각각 소유권 원천으로 저장한다. 둘 다 실제로 결제된 경우 OR로 소유하며 두 번째 영수증이 단계 보상을 다시 지급하지 않는다. 마지막 유효한 영수증이 부분 또는 전체 환불되면 프리미엄 수령을 막고, 누적 프리미엄 조각 지급분을 유료 잔액에서 회수하며 소비한 차액은 부채로 남긴다. `royal`의 `pass:founders` 원천만 제거하여 독립적으로 산 왕실 외형은 보존한다. 무료 보상·연구·출석·XP·단계 수령 이력은 유지한다.

새 구매 영수증으로 재구매하면 이전 회수분을 한 번 복원한다. 부채가 남아 있으면 먼저 상환하며 수령 이력을 초기화하지 않는다. 취소된 옛 영수증 재생은 복원 근거가 아니다. 조회와 프리미엄 수령 전에 보유 패스 영수증도 재조회하여 10단계 외형을 아직 받지 않은 계정의 누락 환불도 복구한다.

Google 패스는 검증·소유권 지급 후 서버에서 acknowledge하며 consume하지 않는다. 기존 durable outbox가 중단·ACK 실패를 재시도한다. 이는 Google의 [일회 구매 처리](https://developer.android.com/google/play/billing/integrate#process)와 [서버 acknowledge API](https://developers.google.com/android-publisher/api-ref/rest/v3/purchases.products/acknowledge)를 따른다(확인 2026-09-14). 실제 Play 상품 등록·환불 고지·운영 결제 설정 완료를 의미하지 않는다.

## 운영 우편

운영자는 서버 환경 `ADMIN_ACCOUNT_IDS`의 쉼표 목록으로 지정한다. 로그인 응답의 계정 ID를 그대로 넣거나 `account:<id>`, `google:<Google sub>`, `sha256:<sha256('google:'+sub)>`를 사용할 수 있다. 권한은 매 요청 서버에서 확인하며 일반 사용자 응답에 allowlist·발행자·감사 로그를 내보내지 않는다. 기본값은 빈 목록으로 운영 API를 닫아 둔다. 계정 ID 방식이 운영 설정에 가장 간단하다.

| 요청 | 본문 | 결과 |
|---|---|---|
| `GET /admin/mail/list` | 없음 | `{mails,serverNow}` |
| `GET /admin/mail/<id>` | 없음 | `{mail,serverNow}` |
| `POST /admin/mail/draft` | `{id?,title,body,reward:{gold,shards},expiresAt?,requestId}` | `{ok,mail,duplicate,serverNow}` |
| `POST /admin/mail/preview` | `{id}` | `{mail,previewToken,audienceAt,recipientCount,total,serverNow}` |
| `POST /admin/mail/publish` | `{id,previewToken,requestId}` | `{ok,mail,duplicate,serverNow}` |
| `POST /admin/mail/cancel` | `{id,requestId}` | 동일 |

제목은 1~80자, 본문은 1~2,000자의 일반 텍스트다. HTML 꺾쇠와 제어문자를 거부하며 본문 줄바꿈은 허용한다. 한 통의 상한은 10,000G·500조각이다. 만료일 생략은 초안 생성 시각부터 30일, `null`은 무기한이다. 지정한 만료 시각은 미래 366일 이내의 밀리초 timestamp여야 한다.

초안을 먼저 미리보기해야 발행할 수 있다. 서버가 10분짜리 토큰에 초안 revision·검토 운영자·대상 기준 시각·계정 순번·대상 수·보상 총량을 묶는다. 대상은 미리보기 당시 이미 생성된 계정이다. 순번을 함께 고정하여 같은 밀리초 안에 뒤늦게 가입한 계정도 제외한다. 초안 수정은 이전 토큰을 무효화한다. `preview-required`면 다시 미리보기하고 총량을 확인해야 한다. `requestId` 재시도는 기존 발행 결과를 재사용한다.

발행은 공지 한 건만 저장한다. 각 대상 계정은 `GET /liveops`의 inbox에서 확인하고 자기 보상만 청구한다. 받은 우편 카드는 `{id,title,body,reward,publishedAt,audienceAt,expiresAt,claimed}`만 포함한다. 취소·만료는 이후 수령을 막지만 이미 받은 보상을 회수하지 않는다. draft·preview·publish·cancel에는 운영자·시각·revision·총량의 감사 이벤트를 저장한다. 발행 API를 호출하는 별도의 자동화는 없다.

## 검증과 배포 경계

`npm test --prefix commerce` 78개, `npm run test:worker --prefix commerce`의 실제 로컬 workerd/SQLite 검사가 통과했다. KST 경계·중복/동시 수령·저장 실패 롤백·기존 계정 마이그레이션·정산 XP·계정 생성 시점·미리보기 위조/만료/수정·우편 취소·양쪽 패스 영수증·환불 부채·재구매를 확인했다. 모든 결제 공급자 요청과 우편 발행 대상은 메모리 또는 로컬 fixture이며 실제 청구·운영 우편 발행은 0건이다.

Wrangler `deploy --dry-run` 번들 검사도 통과했다. 공유 net 보상 연계는 기존 `GAME_ROOMS` 외부 DO binding을 사용하며 새 비밀키는 추가하지 않는다. 운영 반영 순서는 net Worker → commerce Worker → 정적 클라이언트다. 실제 배포·운영 로그인·결제 공급자 등록은 별도 설정 단계이며 이 변경에서 실행하지 않았다. 운영 우편도 실제 대상·내용·총량을 확인한 뒤 사용자가 직접 발행한다.
