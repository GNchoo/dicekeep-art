# Android Google 로그인과 Play 결제

`com.fallman.dicekeep` 앱의 `DicekeepBilling` Capacitor 플러그인은 Google 계정 선택과 Play 구매 화면을 실행합니다. ID 토큰과 구매 토큰을 웹 상점 코드에 전달하며, 구매 검증·잔액 지급·consume·acknowledge는 수행하지 않습니다. 해당 처리는 인증된 commerce 서버의 책임입니다.

## 고정 의존성과 공식 근거

2026-09-08 확인 기준으로 다음 안정 버전을 사용합니다. alpha 예제 버전은 사용하지 않습니다.

- Google Play Billing `9.1.0`: [공식 릴리스 노트](https://developer.android.com/google/play/billing/release-notes), 2026-06-18 릴리스. [공식 통합 문서](https://developer.android.com/google/play/billing/integrate)의 자동 재연결, pending 구매, 구매 재조회 계약을 적용했습니다.
- AndroidX Credentials 및 Play Services Auth `1.6.0`: [공식 안정 버전 목록](https://developer.android.com/jetpack/androidx/releases/credentials), 2026-04-08 릴리스.
- Google ID `1.2.0`: [Google Maven 메타데이터](https://dl.google.com/dl/android/maven2/com/google/android/libraries/identity/googleid/googleid/maven-metadata.xml)의 release 버전. [로그인 구현 문서](https://developer.android.com/identity/sign-in/credential-manager-siwg-implementation)는 2026-09-01 갱신되었습니다.

## JavaScript 계약

`app.js`가 Android에서 `Capacitor.registerPlugin('DicekeepBilling')`을 호출합니다. `MainActivity`는 bridge 생성 전에 Java 플러그인을 등록합니다. 별도의 npm 결제 플러그인은 필요하지 않습니다.

```js
const billing = Capacitor.Plugins.DicekeepBilling;
await billing.signIn({ serverClientId }); // { idToken }
await billing.signOut();                 // Credential Manager 세션 초기화
await billing.products({ productIds });
// { products:[{productId,title,formattedPrice,currencyCode,priceAmountMicros}],
//   unavailableProductIds:[] }
await billing.purchase({ productId, accountId });
// { purchaseToken, productId, state:'PURCHASED'|'PENDING' }
await billing.restore();
// { purchases:[{purchaseToken,productId,state}] }
const listener = await billing.addListener('purchaseUpdated', ({ purchases }) => {
  // 로그인된 서버에 PURCHASED 토큰을 전달하여 검증한다.
});
await listener.remove();
```

`serverClientId`는 Android OAuth client ID가 아닌 서버 검증용 **Web OAuth client ID**입니다. 동일 Google Cloud 프로젝트에 `com.fallman.dicekeep`과 배포 서명의 SHA-1을 등록한 Android OAuth 클라이언트도 필요합니다. debug 서명과 Play App Signing 서명은 구분해서 등록해야 합니다. 앱에 client secret이나 서비스 계정 키를 넣지 않습니다.

`signIn`은 사용자가 누르는 Google 로그인 버튼 흐름(`GetSignInWithGoogleOption`)을 사용합니다. 선택적으로 서버가 발급한 `nonce`를 받을 수 있지만, 이 경우 서버가 요청과 토큰의 nonce 일치를 검증해야 합니다. ID 토큰의 서명·audience·issuer·유효기간 검증은 서버에서 합니다. 앱 로그인 성공만으로 게임 잔액을 변경하지 않습니다.

`accountId`는 서버가 내려준 64자리 소문자 hex 해시이며 `setObfuscatedAccountId`에 전달합니다. 이메일·Google subject·로컬 세이브 값을 직접 넣지 않습니다. 서버는 Play의 `obfuscatedExternalAccountId`와 현재 인증 계정을 대조해야 합니다.

## 상품과 구매 복구

- 소비형 조각 상품과 비소비형 스킨 모두 INAPP으로 조회·구매합니다. SKU를 네이티브에 고정하지 않으므로 `dicekeep.skin_royal`, `dicekeep.skin_frost`, `dicekeep.skin_ember`도 같은 경로를 사용합니다. 상품당 일반 buy 구매 옵션 하나를 설정합니다. rental·preorder·할인 offer·복수 기본 옵션은 현재 UI 계약에 포함하지 않아 구매 가능 상품으로 표시하지 않습니다. [공식 one-time offer API](https://developer.android.com/reference/com/android/billingclient/api/ProductDetails.OneTimePurchaseOfferDetails)를 사용합니다.
- 상품 조회는 최대 20개 ID를 받고 중복을 제거합니다. 가격은 Play 응답의 지역별 `formattedPrice`를 표시합니다. 구매 시작 전에 ProductDetails를 새로 조회하므로 오래된 offer token을 보관하지 않습니다.
- 구매 창을 하나만 허용합니다. 다른 상품이나 다른 계정의 복구 결과는 진행 중인 구매 호출을 완료시키지 않습니다. `USER_CANCELED`는 취소 안내로 reject합니다. `PENDING`은 승인 대기로 반환하고 지급하지 않습니다.
- 초기 연결과 앱 복귀, 이벤트 listener 등록 때 `queryPurchasesAsync(INAPP)`를 실행합니다. 연결이 끊기면 Billing Library의 자동 재연결을 사용합니다. 서버가 아직 consume하지 않은 조각 구매와 이미 acknowledge된 비소비형 스킨 모두 복원 결과로 서버에 전달합니다. 서버가 상품 종류에 따라 지급 후 consume 또는 acknowledge를 결정합니다.
- 이벤트와 purchase/restore 응답에 같은 토큰이 반복될 수 있습니다. 서버는 구매 토큰별 지급을 멱등 처리해야 합니다. 앱 로그인 전에 도착한 이벤트는 지급 근거로 사용하지 않으며, **로그인 성공 후 restore를 실행**해서 다시 조회합니다.
- restore/query 응답의 예전 토큰으로 진행 중인 새 checkout 호출을 완료하지 않습니다. 실제 launch 이후 일치하는 구매 callback만 purchase 호출을 완료합니다. callback을 놓친 구매도 restore 응답과 이벤트로 서버에서 복구하며, 원래 호출의 시간 초과를 결제 실패로 단정하지 않습니다.
- 네이티브 토큰 결과는 프로세스 메모리에만 존재합니다. 앱이 종료되어 callback을 받지 못해도 Play의 미처리 구매를 다시 조회할 수 있습니다. native에서 먼저 consume하거나 acknowledge하지 않습니다.
- 일반 작업은 30초, 연결은 20초, 로그인은 2분, 열린 결제 흐름은 5분 뒤 응답을 종료합니다. 시간 초과는 결제 취소나 미청구를 증명하지 않습니다. 구매 복원과 서버 조회로 상태를 확인해야 하며 자동 재청구하지 않습니다.

`app.js`는 Capacitor JS payload 로깅을 끕니다. `capacitor.config.json`의 `android.loggingBehavior: 'none'`도 유지해야 native debug 로그에 인증/결제 요청 내용이 남지 않습니다. 이 플러그인은 토큰·Google 계정·스토어의 원본 오류 내용을 로그나 사용자 오류 메시지에 넣지 않습니다.

## 로컬 빌드

```powershell
npm run build:www
npx cap sync android
$env:ANDROID_HOME = 'C:/Users/PC/AppData/Local/Android/Sdk'
Push-Location android
./gradlew.bat :app:assembleDebug :app:testDebugUnitTest --console=plain --no-daemon
Pop-Location
```

JDK 21과 Android SDK 36이 필요합니다. compile/target SDK는 36, AGP는 8.9.2, Gradle wrapper는 기존 8.11.1입니다. [API 36의 최소 AGP는 8.9.1](https://developer.android.com/build/releases/about-agp)이며, [Play는 2026-08-31부터 신규/업데이트 제출에 target 36을 요구](https://support.google.com/googleplay/android-developer/answer/11926878?hl=en)합니다. 기존 몰입 모드와 AndroidX 뒤로가기 dispatcher, SafeArea 처리는 유지합니다.

로컬 APK 경로는 `android/app/build/outputs/apk/debug/app-debug.apk`입니다. APK 생성은 실제 Android 16 기기 화면이나 Google 로그인·청구·서버 지급 검증을 대신하지 않습니다. 실제 테스트는 OAuth 프로젝트, 등록된 서명, Play Console 상품과 라이선스 테스터, 배포된 검증 서버를 연결한 내부 테스트에서 수행합니다. 이 작업은 스토어 업로드나 라이브 거래를 수행하지 않습니다.

## 실제 연결 후 확인할 시나리오

1. Google 계정 선택 성공/취소, 로그아웃 후 다른 계정 선택, OAuth 설정 불일치.
2. Play 지역 가격과 최종 구매창 가격 확인, 비활성 상품과 스토어 미설치 상태.
3. 구매 버튼 연타, 사용자 취소, pending 승인 전 미지급 및 승인 후 한 번 지급.
4. 결제 완료 직후 네트워크 단절·앱 강제 종료 후 로그인/restore로 한 번 지급.
5. 다른 계정으로 restore 시 서버 소유자 불일치 거절.
6. callback+restore 중복, 조각 지급 후 consume 실패 및 재시도, 스킨 지급 후 acknowledge 실패 및 재시도, 이미 acknowledge된 스킨 복원.
7. 로그캣과 WebView 콘솔에 ID 토큰·purchaseToken이 남지 않는지 확인.

`PurchaseGateTest`는 중복 실행, 실제 구매창을 열기 전 callback 차단, 다른 계정/상품 callback, 종료 후 재시작, 잘못된 원본 계정 ID 거부를 검사합니다. Play 서비스 통신 자체는 이 단위 테스트로 검증하지 않습니다.

2026-09-08 로컬 JDK 21 / SDK 36 환경에서 `:app:assembleDebug :app:testDebugUnitTest`가 성공했고, 위 5개 테스트는 실패·오류 없이 통과했습니다. 합쳐진 Android manifest의 target 36, 패키지 ID, BILLING 권한도 확인했습니다. 스킨 등 최종 웹 자산 변경 후에는 위 빌드 순서로 다시 복사·패키징해야 합니다.
