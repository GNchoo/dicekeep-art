# Dicekeep 계정·결제 Worker

Google 로그인, 서버 성장 프로필, 서버 가격의 Toss 결제, Google Play 일회성 구매 검증을 구현합니다. 기본은 `PAYMENT_MODE=disabled`이며 설정되지 않은 결제는 차단합니다. 실제 서비스 계약·키·상품 등록·운영 공개 정보가 아직 제공되지 않아 **실결제 활성화와 배포는 완료되지 않았습니다**. 검증은 가짜 provider 응답 및 로컬 workerd/SQLite로 수행하며 실제 청구를 만들지 않습니다.

## 실행과 파일

저장소 루트에서:

```sh
npm ci --prefix commerce
node commerce/build.mjs
npm test --prefix commerce
npm run test:worker --prefix commerce
```

`build.mjs`는 루트 `progression.js`를 LF로 정규화하고 SHA를 기록한 ESM wrapper `src/progression.mjs`를 만듭니다. `npm test`는 두 파일의 불일치를 먼저 거부합니다. 성장 규칙은 복제하여 별도 수정하지 않습니다. Worker 진입점은 `src/index.mjs`, 단일 권위 원장은 `src/ledger.mjs`, 공급자 API는 `src/providers.mjs`, 신원 검증은 `src/auth.mjs`입니다.

`wrangler.jsonc`는 SQLite Durable Object를 설정하며 공개 workers.dev 주소를 자동으로 열지 않습니다. Wrangler `deploy --dry-run`은 번들 확인 용도로만 사용했습니다. `test:worker`는 설치된 Wrangler의 Miniflare/workerd를 사용하고 **모든 provider 요청을 메모리 fixture로 가로챕니다**. 실제 로그인 키나 결제 키를 테스트에 넣지 마세요.

## API 계약

요청/응답은 JSON입니다. `/auth/google`, `/config`, 검증되는 provider 웹훅을 제외한 API는 `Authorization: Bearer <token>`이 필요합니다. 알 수 없는 mutation 필드는 거부하며 에러 응답은 `{error:code}`입니다. provider 원문 오류나 토큰은 반환하지 않습니다.

- `GET /config`: 결제 모드, 플랫폼별 활성 상태, Google 웹 client ID, 공개 Toss client key, 상품, 사업자·정책 URL, 보상 제한을 반환합니다. 비밀키는 포함하지 않습니다.
- `POST /auth/google {idToken}`: `{token,accountId,expiresAt,obfuscatedAccountId,profile,wallet,cosmetics}`. Google `sub`로 계정을 찾고 프로필은 서버에서 새로 생성합니다. 기존 게스트 저장 데이터 업로드·병합 API는 없습니다.
- `POST /auth/logout {}`: 현재 세션을 폐기합니다. 세션은 24시간 만료이며 다시 로그인하면 이전 bearer가 폐기됩니다. 서버에는 SHA256 해시만 저장합니다.
- `GET /profile`: 수정하지 않은 PG schema 자체를 반환합니다. `GET /wallet`은 `{free,paid,debt}`, `GET /cosmetics`는 `{owned:['base',...],equipped}`를 반환합니다. 스킨 조회는 현재 설정으로 검증 가능한 보유 구매 원천을 재조회하여 누락된 환불을 회수합니다. 공급자 장애는 오류로 반환합니다.
- `POST /profile/action {type,face?,deck?,skinId?,requestId}`: `unlock`, `upgrade`, `deck`, `skinEquip`. `requestId`는 영숫자/`_`/`-` 8~128자이며 재시도 시 동일하게 사용합니다. 동일 ID의 다른 내용은 `request-id-conflict`, 같은 내용은 중복 차감 없이 최신 상태를 반환합니다.
- `POST /runs/start {mode}`: `{ticket,profile,wallet,cosmetics,snapshot,startedAt}`. `clear`, `build`, `extreme`, `multi`, `extremeMulti` 중 하나입니다. 새 시작은 이전 미정산 ticket을 포기 상태로 바꿉니다. 시작 snapshot은 덱·레벨을 고정합니다. `clear`/`multi`는 성장 없는 규칙, `build`는 레벨20, 극한 성장 모드는 레벨200 상한을 그대로 사용합니다.
- `POST /runs/settle {ticket,wave,kills,won,elapsed?,date?}`: `{profile,wallet,cosmetics,shards,earnedShards?,debtPaid?,duplicate}`. 서버 시작 시간·현재 UTC 시간을 사용하며 client `elapsed/date`로 보상을 늘릴 수 없습니다. 동일 ticket의 다른 결과는 거부합니다.
- `POST /orders {sku,platform:'web'|'android'}`: 웹은 `{orderId,amount,currency,orderName,customerKey,clientKey}`, Android는 `{productId,obfuscatedAccountId}`입니다. 웹 SDK에는 서버의 orderId·amount·customerKey를 그대로 전달합니다. Android Billing은 이 account ID를 `setObfuscatedAccountId()`에 넣고 Play에서 받은 현지 가격을 표시합니다.
- `POST /payments/toss/confirm {orderId,paymentKey?}`: 자기 주문만 처리합니다. paymentKey 없는 복구는 GET으로 확인 가능한 결제만 사용하며 새 승인 정보를 만들지 않습니다. 응답에 `{profile,wallet,cosmetics,shards,duplicate,refunded?}`를 포함합니다.
- `POST /payments/google/verify {purchaseToken,productId}`: `{profile,wallet,cosmetics,shards,duplicate,consumePending? | acknowledgePending?,refunded?}`. Play PURCHASED 이벤트·복구 결과를 모두 이곳에 보냅니다. 클라이언트에서 지급·consume·ack를 수행하지 않습니다.

`profile` 밖에 있는 스킨은 공격력, 확률, 덱, 성장, 기록에 영향을 주지 않습니다. `base`는 항상 소유합니다. 비로그인 게스트 성장은 기존 로컬 게임의 별도 저장이며 로그인 계정 보상으로 업로드할 수 없습니다.

## 상품 초안

- `shards60`: 조각60, 웹 1,100 KRW, Play `dicekeep.shards60`.
- `shards600`: 조각600, 웹 9,900 KRW, Play `dicekeep.shards600`.
- `shards2000`: 조각2,000, 웹 33,000 KRW, Play `dicekeep.shards2000`.
- `skinRoyal`, `skinFrost`, `skinEmber`: 각 웹 4,900 KRW. 각각 `royal`, `frost`, `ember` 주사위 재질+1~20성 타워 외형 묶음이며 Play ID는 `dicekeep.skin_royal`, `dicekeep.skin_frost`, `dicekeep.skin_ember`입니다.

조각은 `kind:'currency'` 소모품, 스킨은 `kind:'cosmetic'` 비소모품입니다. Play의 실제 가격·상품/구매옵션은 Play Console 등록 결과가 기준입니다. 이 초안 가격은 상품 등록·사업자 승인 완료를 의미하지 않습니다.

## 결제와 환불 무결성

모든 계정과 구매는 한 Durable Object의 트랜잭션에서 수정합니다. `global:production`은 disabled/live 무료 계정을 유지하고 `global:test`는 별도 시험 계정·잔액을 사용합니다. 시험 결제를 실제 잔액으로 승계하지 않습니다. 운영·시험 webhook URL/배포 설정도 별도로 구성해야 합니다.

Toss는 저장된 서버 가격으로 승인합니다. GET에서 `DONE`이면 재사용합니다. 성공 반환이나 이전 승인 요청으로 확보한 paymentKey가 있고 상태가 인증 완료 `IN_PROGRESS`일 때는 주문·키·MID·KRW·금액을 검사한 뒤 같은 idempotency key로 승인합니다. 응답이 불확실하면 다시 GET으로 복구합니다. orderId만 가진 복구는 새 승인 요청을 만들지 않으므로 미승인 주문을 다시 청구하지 않습니다. `READY`, 입금 대기, 실패·만료·취소도 새 승인하지 않습니다. 일반 Payment에 customerKey가 항상 반환되지는 않으므로 서버 주문→인증 계정의 결합이 고객 권위이며, 반환되는 customerKey가 있다면 추가 비교합니다.

Google은 고정 공식 productV2 URL로 조회하고 PURCHASED, 제품 ID, 수량1, 미환불, obfuscated account ID, 시험 환경을 검사합니다. 토큰 SHA와 order ID를 영구 중복 키로 보관합니다. 원문 Play token은 AES-GCM으로 암호화하여 후속 검증에만 씁니다. 조각은 지급 후 **consume**, 스킨은 소유권 지급 후 **acknowledge**합니다. outbox와 미리 등록한 alarm이 응답 손실·중단 후 완료 처리를 재시도합니다. 한 번에20건을 순회하며 실패한 선두 작업이 뒤 작업을 영구히 막지 않습니다.

스킨 구매 시작은 이미 소유한 상품을 거부하고 동시 미완료 웹 주문은 같은 주문을 돌려줍니다. 이미 실제로 결제된 유효한 복구 영수증은 버리지 않고 소유권의 별도 원천으로 저장합니다. 여러 유효 구매가 있으면 OR로 소유하며 한 건의 취소가 다른 유효 구매를 없애지 않습니다.

`POST /webhooks/toss`의 본문은 조회 힌트일 뿐입니다. 저장된 orderId 또는 paymentKey와 연결된 결제를 GET으로 다시 검증합니다. 일반 결제 webhook과 지급대행의 HMAC webhook을 혼동하지 않습니다. `POST /webhooks/google`는 Google 서명 OIDC bearer의 audience·이메일·email_verified를 검사한 뒤 RTDN의 package와 token으로 productV2를 재조회합니다. 알 수 없는 웹훅에서 새 소유권을 지급하지 않습니다. 사용자의 구매 복구도 취소를 재확인합니다.

조각 환불은 취소 비율의 조각 수를 올림해 유료 잔액에서만 회수합니다. 이미 소비한 차액은 부채로 남으며 성장 구매·덱 변경·새 성장 런은 막힙니다. 기존 레벨은 롤백하지 않습니다. 순수 모드 플레이 및 base 외형은 가능하고 이후 정상 적립은 부채부터 상환합니다. 무료 잔액을 환불 명목으로 빼앗지 않습니다. 스킨은 나눌 수 없는 묶음이므로 부분 또는 전체 취소 시 해당 구매 원천 전체를 회수하고 마지막 소유권이면 base로 돌아갑니다. 이 정책은 서비스 개시 전에 구매자에게 공개해야 합니다. 고객이 임의 환불을 발행하는 API는 없습니다.

## 무료 보상과 검증 한계

PG의 기본 보상은 런당 최대500, 최초 마일스톤 보상은 모드별 최대50이므로 첫 극한 런의 최대는550입니다. 101 클리어는 기본100+마일스톤50+클리어20=170입니다. 완료 웨이브당 최소2초와 초당100킬의 보수적인 시간 제한을 확인합니다. 0웨이브 즉시 포기는0보상으로 정산할 수 있으며 무한 싱글을 시간으로 끝내지 않습니다. 극한은101 이후도 계속되고 `won:true`를 클리어로 위장할 수 없습니다.

이 제한은 클라이언트가 보고한 전투를 증명하지 않습니다. 수정된 클라이언트가 현실적인 시간 동안 기다렸다가 거짓 결과를 보내는 것은 막지 못합니다. 공식 전역 경쟁 순위·강한 부정 플레이 방지·서버 전투 재현은 구현하지 않았습니다. 친구방/quick 경쟁 결과를 공인 순위로 표시하면 안 됩니다.

## 설정 및 아직 필요한 운영 준비

공개 설정: `GOOGLE_CLIENT_IDS`(허용 audience 쉼표 목록), `GOOGLE_WEB_CLIENT_ID`, `PUBLIC_ORIGINS`(정확한 origin, Android의 `https://localhost` 포함), `TOSS_CLIENT_KEY`, `TOSS_MID`, `GOOGLE_PLAY_PACKAGE`, `GOOGLE_RTDN_AUDIENCE`, `GOOGLE_RTDN_EMAIL`.

비밀 환경값: `TOSS_SECRET_KEY`, `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`(PKCS8 PEM), `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `TOKEN_ENCRYPTION_KEY`(32바이트 base64 AES 키). 저장소·정적 www·모바일 앱에 포함하지 않습니다. 테스트 파일의 RSA 키는 매 실행 메모리에만 만드는 fixture이며 서비스 키가 아닙니다. 배포 운영자는 키 보관/교체 및 이전 token 복호화 마이그레이션을 관리해야 합니다.

`PAYMENT_MODE=test`는 Toss test 키와 Google `testPurchaseContext.fopType=TEST`만 허용합니다. `live`는 아래가 모두 있어야 활성화됩니다.

- `ENABLE_LIVE_PURCHASES=true`, `PROVIDER_CONTRACTS_CONFIRMED=true`, `PRODUCTS_REGISTERED=true`.
- 올바른 live 키·상품·서비스 계정 API 권한 및 provider별 필수 설정.
- `MERCHANT_BUSINESS_NAME`, `MERCHANT_REGISTRATION_NUMBER`, `MERCHANT_CONTACT`.
- HTTPS `TERMS_URL`, `PRIVACY_URL`, `REFUND_POLICY_URL`, `ACCOUNT_DELETION_URL`.

URL/플래그 검사는 실제 계약 심사·상품 상태·문서 내용을 대신 확인하지 않습니다. 서비스 소유자가 등록과 공개 정보를 완성하고 시험 계정으로 결제/환불을 실제 검증해야 합니다. 현재 로그인 공급자·PG 계약·서비스 키·Play 상품 등록·도메인·웹훅/PubSub·운영 공개 문서가 미확정입니다. 계정 삭제 접수/본인 확인/처리, 결제 기록의 법정 보관과 개인정보 삭제, 장애 모니터링·주기적 정산 대사·backup 및 ledger 복구·환불 고객지원도 운영 절차를 마련해야 합니다. 이 코드에는 자동 계정 삭제나 보관 기간별 purge가 없으며 구매/중복 키는 현재 보존됩니다. 백업 복구 시 옛 시점의 원장으로 이미 지급된 구매를 다시 지급하지 않도록 provider 대사를 먼저 해야 합니다.

## 클라이언트 스킨과 구매 복구

`cosmetics.js`는 서버의 `owned/equipped`만 적용하며 게스트 `SAVE.progression`에 소유권을 저장하지 않습니다. 왕실 상아·서리 수정·잿불 흑요석의 6종 주사위와 20성 타워는 구매 없이 미리 볼 수 있고, 장착은 서버 소유권 검사를 거칩니다. 기본 부팅은 base만 준비합니다. 선택한 묶음은 재질1장과 타워20장을 동시2개까지 디코드하고 최대2묶음을 보관합니다. 재질 캐시는 최대2세트(104개 텍스처)이며 이전 큐브 자세·구면 픽셀 캐시도 정리합니다.

런 시작의 외형을 유지하고 굴리는 중 장착을 막습니다. 환불·로그아웃으로 소유권이 없어지면 진행 중인 굴림이 끝난 뒤 base로 돌아갑니다. 새 그림 로딩 중 런이 시작되어도 런 외형을 나중에 바꾸지 않습니다. 재로그인은 `/cosmetics`를 다시 조회하여 누락된 환불 알림을 복구합니다. 웹의 미승인 주문이나 Android의 다른 계정 영수증은 뒤의 정상 구매 복구를 막지 않으며, 미해결 결과는 사용자에게 남깁니다.

검증 명령은 `node --test tools/cosmetic-test.cjs`와 `E2E_BASE_URL`을 로컬 서버로 지정한 `node tools/e2e/cosmetics.cjs`입니다. 브라우저 검사는 실제 HTTP 원본과 PNG를 사용하되 계정 API·선택된 굴림 결과만 fixture로 제공합니다. `--unready`는 재질 요청 하나를 HTTP503으로 만들어 기본 외형 유지를 확인합니다. 실제 로그인·청구·운영 결제를 검증한 결과로 간주하면 안 됩니다. `DKCOSMETICS.debugUse(theme)`는 localhost에서만 실전 아트를 검수하며 서버나 저장 파일에 소유권을 추가하지 않습니다.

## 공식 근거 (확인 2026-09-08)

Toss의 [결제 흐름](https://docs.tosspayments.com/guides/v2/get-started/payment-flow), [승인·조회·Payment API](https://docs.tosspayments.com/reference), [웹훅 종류](https://docs.tosspayments.com/reference/using-api/webhook-events)를 따릅니다. Google은 [ID token 검증](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token), [productV2 조회](https://developers.google.com/android-publisher/api-ref/rest/v3/purchases.productsv2/getproductpurchasev2), [구매 상태와 필드](https://developers.google.com/android-publisher/api-ref/rest/v3/purchases.productsv2), [서버 consume](https://developers.google.com/android-publisher/api-ref/rest/v3/purchases.products/consume), [서버 acknowledge](https://developers.google.com/android-publisher/api-ref/rest/v3/purchases.products/acknowledge), [Pub/Sub push 인증](https://cloud.google.com/pubsub/docs/authenticate-push-subscriptions)에 근거합니다. 저장 원자성은 [Durable Object SQLite API](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/)를 사용합니다.
